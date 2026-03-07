import TurndownService from 'turndown';
import { generateText, Output } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';

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

export async function processPage(
  client: experimental_XMC,
  contextId: string,
  itemId: string,
  language: string,
  targetFieldName: string,
  metaFieldName: string,
  aiApiKey?: string
): Promise<ProcessPageResult> {
  // 1. Fetch HTML
  const htmlResult = await client.agent.pagesGetPageHtml({
    path: { pageId: itemId },
    query: { language, sitecoreContextId: contextId },
  });
  const rawHtml = htmlResult.data?.html ?? '';

  // Strip noise tags before converting
  const cleanedHtml = rawHtml.replace(
    /<(nav|footer|script|style|header)[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );

  // 2. HTML → Markdown
  const td = new TurndownService({ headingStyle: 'atx' });
  const rawMarkdown = td.turndown(cleanedHtml);

  // 3. AI stages (optional)
  let finalMarkdown = rawMarkdown;
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
      prompt: rawMarkdown,
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

  // 4. Store to XMC
  const processedAt = new Date().toISOString();
  const wordCount = finalMarkdown.split(/\s+/).filter(Boolean).length;
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

  // 5. Return result
  return { itemId, markdown: finalMarkdown, wordCount, processedAt, description, faqCount, entities };
}
