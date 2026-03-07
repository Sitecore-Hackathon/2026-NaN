import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';
import { listAllPages } from '@/lib/sitecore/pages';
import { generateText, streamText } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const GQL_ADD_VERSION = `
  mutation AddLanguageVersion($itemId: ID!, $language: String!) {
    addVersion(input: {
      itemId: $itemId,
      language: $language
    }) {
      item { itemId }
    }
  }
`;

const GQL_UPDATE_LLM_FIELD = `
  mutation UpdateLlmField($itemId: ID!, $language: String!, $value: String!) {
    updateItem(input: {
      itemId: $itemId,
      language: $language,
      fields: [{ name: "LLM", value: $value }]
    }) {
      item { itemId }
    }
  }
`;

export async function generateLlmTxtStream(
  client: experimental_XMC,
  contextId: string,
  siteName: string,
  siteId: string,
  targetFieldName: string,
  language: string,
  aiApiKey: string
): Promise<Response> {
  try {
    // 1. Get all pages for the site
    const siteResult = await client.sites.retrieveSite({
      path: { siteId },
      query: { sitecoreContextId: contextId },
    });
    // Fallback meta field since we just need the target field
    const metaFieldName = 'AiMarkdownMeta';

    // 2. Fetch all pages using the deduplicated listAllPages function
    const pages = await listAllPages(client, contextId, siteId, siteName, targetFieldName, metaFieldName);

    if (!pages || pages.length === 0) {
      return new Response(JSON.stringify({ error: 'No pages found for the site.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Filter for processed pages and fetch their markdown content
    const processedPagesResult: { title: string; url: string; markdown: string }[] = [];
    const processedPages = pages.filter(p => p.status === 'processed');

    if (processedPages.length === 0) {
      return new Response(JSON.stringify({ error: 'No processed Markdown content found to aggregate.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    for (const page of processedPages) {
      const itemResult = await client.authoring.graphql({
        body: {
          query: `
            query GetPageMarkdown($itemId: ID!, $language: String!, $fieldName: String!) {
              item(where: { itemId: $itemId, language: $language }) {
                field(name: $fieldName) { value }
              }
            }
          `,
          variables: { itemId: page.id, language, fieldName: targetFieldName },
        },
        query: { sitecoreContextId: contextId },
      });

      const markdown = (itemResult.data?.data as any)?.item?.field?.value;

      if (markdown) {
        processedPagesResult.push({
          title: page.displayName || page.name,
          url: page.url,
          markdown,
        });
      }
    }

    if (processedPagesResult.length === 0) {
      return new Response(JSON.stringify({ error: 'Failed to retrieve Markdown content for processed pages.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Draft a raw aggregate
    let rawAggregate = `Site Name: ${siteName}\n\n`;
    for (const page of processedPagesResult) {
      let mdUrl = page.url || '';
      try {
        if (mdUrl.startsWith('http')) {
          mdUrl = new URL(mdUrl).pathname;
        }
      } catch (e) {}
      
      if (!mdUrl.startsWith('/')) mdUrl = '/' + mdUrl;
      if (mdUrl.endsWith('/') && mdUrl.length > 1) mdUrl = mdUrl.slice(0, -1);
      if (!mdUrl.endsWith('.md')) mdUrl += '.md';
      
      // Override so the fallback generator uses it too
      page.url = mdUrl;

      rawAggregate += `TITLE: ${page.title}\nURL: ${page.url}\nCONTENT:\n${page.markdown}\n\n`;
    }

    const aiKey = process.env.VERCEL_AI_KEY;
    
    // Save function to run when text finishes generating or instantly if fallback
    const saveToSitecore = async (textToSave: string) => {
      try {
        const siteGroupingId = siteResult.data?.hosts?.[0]?.properties?.siteDefinitionID;
        if (!siteGroupingId) {
          console.error('Could not find Site Grouping ID (siteDefinitionID) in site properties.');
          return;
        }

        // Check if the language version exists
        const groupingVersionResult = await client.authoring.graphql({
          body: {
            query: `
              query GetSiteGroupingVersion($itemId: ID!, $language: String!) {
                item(where: { itemId: $itemId, language: $language }) {
                  language { name }
                  version
                }
              }
            `,
            variables: { itemId: siteGroupingId, language },
          },
          query: { sitecoreContextId: contextId },
        });

        const versionData = (groupingVersionResult.data?.data as any)?.item;

        if (!versionData || versionData.version === 0) {
          await client.authoring.graphql({
            body: {
              query: GQL_ADD_VERSION,
              variables: { itemId: siteGroupingId, language },
            },
            query: { sitecoreContextId: contextId },
          });
        }

        await client.authoring.graphql({
          body: {
            query: GQL_UPDATE_LLM_FIELD,
            variables: { itemId: siteGroupingId, language, value: textToSave },
          },
          query: { sitecoreContextId: contextId },
        });
        console.log(`Saved ${language} llms.txt to Site Grouping!`);
      } catch (err) {
        console.error('Failed to save to Site Grouping on finish', err);
      }
    };

    if (aiKey) {
      // Stream Response
      const gw = createGateway({ apiKey: aiKey });
      const result = await streamText({
        model: gw('openai/gpt-5-nano'),
        system: `You are an expert at creating standard llms.txt files.
Your goal is to parse the raw markdown dumps of multiple pages from a website and output a highly standardized, very clean, and extremely readable llms.txt file.
The output MUST follow this strict structure:
1. Start with an H1 (#) of the site name.
2. Directly under the H1, provide a blockquote (>) summarizing the purpose of the site based on the content.
3. Add a "## Sections" H2 heading. This must be an index list. For each page, output a strict bullet point: "- [Title](URL): 1-sentence description inferred from content".
4. Add a "## Full Documentation" H2 heading.
5. Under "## Full Documentation", go through each page again. Output the page title as an H3 (###) and provide the Markdown Source URL.
6. Clean up the actual raw Markdown text from the pages aggressively. Strip repetitive boilerplate, redundant headers like "XMCloud Demo - Title", and ensure the text is dense and flows logically. Do not change facts, but do compress and format the text properly so it's readable for LLMs.

ONLY output the generated llms.txt Markdown text. Do not wrap it in \`\`\`markdown code blocks.`,
        prompt: `Format the following raw page aggregations into a standard llms.txt file:\n\n${rawAggregate}`,
        onFinish: async ({ text }) => {
          await saveToSitecore(text);
        }
      });
      
      return result.toTextStreamResponse();
    } else {
      console.warn("VERCEL_AI_KEY not found in .env. Falling back to basic concatenation.");
      // Fallback Response
      let llmContent = `# ${siteName}\n\n> Aggregated AI-ready content for ${siteName}\n\n## Sections\n\n`;
      for (const page of processedPagesResult) {
        llmContent += `- [${page.title}](${page.url})\n`;
      }
      llmContent += `\n## Full Documentation\n\n`;
      for (const page of processedPagesResult) {
        llmContent += `### ${page.title}\nSource: [${page.url}](${page.url})\n\n${page.markdown}\n\n---\n\n`;
      }
      
      await saveToSitecore(llmContent);
      return new Response(llmContent, { headers: { "Content-Type": "text/plain; charset=utf-8" }});
    }

  } catch (error: any) {
    console.error('Error generating llms.txt stream:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
