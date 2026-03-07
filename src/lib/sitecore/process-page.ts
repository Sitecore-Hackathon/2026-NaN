import TurndownService from 'turndown';
import { generateText, Output } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';
import { z } from 'zod';

export class VersionNotFoundError extends Error {
  constructor(itemId: string, language: string) {
    super(`Item ${itemId} has no version in language "${language}"`);
    this.name = 'VersionNotFoundError';
  }
}

const GQL_CHECK_VERSION = `
  query CheckVersion($itemId: ID!, $language: String!) {
    item(where: { itemId: $itemId, language: $language }) {
      itemId
    }
  }
`;

export interface ProcessPageResult {
  itemId: string;
  markdown: string;
  wordCount: number;
  processedAt: string;
  description: string | null;
  faqCount: number | null;
  entities: string[] | null;
}

const GQL_UPDATE_ITEM = `
  mutation UpdateItem($itemId: ID!, $language: String!, $fields: [FieldValueInput]!) {
    updateItem(input: { itemId: $itemId, language: $language, fields: $fields }) {
      item { itemId }
    }
  }
`;

// ---------------------------------------------------------------------------
// HTML cleaning: strips Sitecore experience-editor artifacts that appear
// in the HTML returned by the AI Agent API (/api/v1/pages/{pageId}/html).
// These include:
//   - JSON metadata blobs embedded as text inside <code> or bare elements
//     (e.g. {"datasource":{"id":"..."},"fieldType":"..."})
//   - "[No text in field]" placeholder texts
//   - Sitecore chrome wrapper elements (data-sc-* attributes)
//   - Standard noise: <nav>, <footer>, <header>, <script>, <style>
// ---------------------------------------------------------------------------

function cleanSitecoreHtml(html: string): string {
  // 1. Remove standard noise tags entirely
  let cleaned = html.replace(
    /<(nav|footer|header|script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );

  // 2. Strip <code> elements whose content is a Sitecore metadata JSON blob.
  //    Turndown converts <code> to backtick-wrapped text, so these appear as
  //    `{"datasource":{"id":"..."},...}` in the generated Markdown.
  cleaned = cleaned.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (match, inner) => {
    // Remove the whole <code> element when it contains a Sitecore datasource blob
    if (inner.includes('"datasource"') || inner.includes('"fieldId"')) return '';
    return match;
  });

  // 3. Strip Sitecore metadata JSON that appears as bare text (not inside a tag).
  //    Pattern: {"datasource":{"id":"{...}","language":"en",...},"fieldType":"..."}
  cleaned = cleaned.replace(/\{[^{}]*"datasource"\s*:\s*\{[^{}]*\}[^{}]*\}/g, '');

  // 4. Remove "[No text in field]" placeholders and "Missing Datasource Item" messages
  //    that Sitecore injects for empty fields and broken datasources.
  cleaned = cleaned.replace(/\[No text in field\]/gi, '');
  cleaned = cleaned.replace(/Missing Datasource Item/gi, '');

  // 5. Unwrap data-sc-* attribute wrapper elements (keep inner content).
  //    Sitecore wraps field values in <span data-sc-field-id="..."> etc.
  cleaned = cleaned.replace(/<(span|div)\s[^>]*data-sc-[^>]*>([\s\S]*?)<\/\1>/gi, '$2');

  // 6. Collapse multiple blank lines left behind by removals
  cleaned = cleaned.replace(/(\n\s*){3,}/g, '\n\n');

  return cleaned;
}

export async function processPage(
  client: experimental_XMC,
  contextId: string,
  itemId: string,
  language: string,
  targetFieldName: string,
  metaFieldName: string,
  aiApiKey?: string,
  // When false, markdown is generated but NOT written to Sitecore.
  // Use this from the custom-field dialog to avoid an "item already modified"
  // concurrency conflict when the host saves via client.setValue() afterward.
  saveToSitecore = true
): Promise<ProcessPageResult> {
  // 0. Guard: confirm the item has a version in the requested language.
  //    XMC GraphQL returns item: null when no version exists.
  const versionCheck = await client.authoring.graphql({
    body: { query: GQL_CHECK_VERSION, variables: { itemId, language } },
    query: { sitecoreContextId: contextId },
  });
  const versionData = versionCheck.data?.data as
    | { item?: { itemId: string } | null }
    | null
    | undefined;
  if (versionData?.item == null) {
    throw new VersionNotFoundError(itemId, language);
  }

  // 1. Fetch rendered page HTML via the AI Agent API endpoint.
  //    This endpoint renders the page as-is and returns clean HTML
  //    (not the authoring/edit-mode representation).
  const htmlResult = await client.agent.pagesGetPageHtml({
    path: { pageId: itemId },
    query: { language, sitecoreContextId: contextId },
  });
  const rawHtml = htmlResult.data?.html ?? '';

  // 2. Strip Sitecore experience-editor artifacts from the HTML
  const cleanedHtml = cleanSitecoreHtml(rawHtml);

  // 3. HTML → Markdown
  const td = new TurndownService({ headingStyle: 'atx' });

  // Ignore inline elements that carry no meaningful content
  td.addRule('removeEmptyInline', {
    filter: ['span', 'code'],
    replacement: (content) => content.trim(),
  });

  const rawMarkdown = td.turndown(cleanedHtml);

  // 4. Remove any remaining JSON-like lines that Turndown might have kept
  //    (lines starting with { and containing "datasource" or "fieldId")
  const filteredMarkdown = rawMarkdown
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      // Drop lines that look like Sitecore JSON metadata
      if (trimmed.startsWith('{') && (trimmed.includes('"datasource"') || trimmed.includes('"fieldId"'))) {
        return false;
      }
      // Drop "[No text in field]" and "Missing Datasource Item" if still present
      if (/\[No text in field\]/i.test(trimmed)) return false;
      if (/Missing Datasource Item/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 5. AI stages (optional — only if an AI API key is provided)
  let finalMarkdown = filteredMarkdown;
  let description: string | null = null;
  let faqCount: number | null = null;
  let entities: string[] | null = null;

  if (aiApiKey) {
    const gw = createGateway({ apiKey: aiApiKey });

    // Stage A — Structural clean
    const { output: stageA } = await generateText({
      model: gw('anthropic/claude-haiku-4-5-20251001'),
      output: Output.object({ schema: z.object({ markdown: z.string() }) }),
      system:
        'Fix heading hierarchy, remove nav/footer noise, normalise lists. Output only the cleaned markdown.',
      prompt: filteredMarkdown,
    });

    // Stage B — AEO enrichment
    const aeoSchema = z.object({
      markdown: z.string(),
      description: z.string(),
      faqCount: z.number(),
      entities: z.array(z.string()),
      wordCount: z.number(),
    });
    const { output: stageB } = await generateText({
      model: gw('anthropic/claude-sonnet-4-6'),
      output: Output.object({ schema: aeoSchema }),
      system: `Add a ## Frequently Asked Questions section (3-5 Q&As derived from content).
Ensure the first paragraph directly answers "What is {page topic}?".
Return the full enriched markdown plus metadata.`,
      prompt: stageA.markdown,
    });

    finalMarkdown = stageB.markdown;
    description = stageB.description;
    faqCount = stageB.faqCount;
    entities = stageB.entities;
  }

  // 6. Optionally store to XMC via Authoring GraphQL.
  //    Skipped when saveToSitecore=false (e.g. custom-field dialog — the host
  //    writes via client.setValue() to avoid a concurrency conflict).
  const processedAt = new Date().toISOString();
  const wordCount = finalMarkdown.split(/\s+/).filter(Boolean).length;

  if (saveToSitecore) {
    const meta = JSON.stringify({ processedAt, wordCount, description, faqCount, entities });
    await client.authoring.graphql({
      body: {
        query: GQL_UPDATE_ITEM,
        variables: {
          itemId,
          language,
          fields: [
            { name: targetFieldName, value: finalMarkdown },
            { name: metaFieldName, value: meta },
          ],
        },
      },
      query: { sitecoreContextId: contextId },
    });
  }

  // 7. Return result
  return { itemId, markdown: finalMarkdown, wordCount, processedAt, description, faqCount, entities };
}
