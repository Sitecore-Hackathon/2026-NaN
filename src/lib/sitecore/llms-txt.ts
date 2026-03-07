import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';
import { listAllPages } from '@/lib/sitecore/pages';

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

export async function generateAndStoreLlmTxt(
  client: experimental_XMC,
  contextId: string,
  siteName: string,
  siteId: string,
  targetFieldName: string,
  language: string
): Promise<{ success: boolean; message: string }> {
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
      return { success: false, message: 'No pages found for the site.' };
    }

    // 3. Filter for processed pages and fetch their markdown content
    const processedPagesResult: { title: string; url: string; markdown: string }[] = [];
    const processedPages = pages.filter(p => p.status === 'processed');

    if (processedPages.length === 0) {
      return { success: false, message: 'No processed Markdown content found to aggregate.' };
    }

    // We still need to fetch the actual markdown content since listAllPages only checks if it exists
    // (targetValue in listAllPages is used for status, but not returned in PageSummary)
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
      return { success: false, message: 'Failed to retrieve Markdown content for processed pages.' };
    }

    // 3. Generate llms.txt content
    let llmContent = `# ${siteName}\n\n`;
    llmContent += `> Aggregated AI-ready content for ${siteName}\n\n`;

    llmContent += `## Sections\n`;
    for (const page of processedPagesResult) {
      llmContent += `- [${page.title}](${page.url})\n`;
    }

    llmContent += `\n## Full Content\n\n`;
    for (const page of processedPagesResult) {
      llmContent += `### ${page.title}\n`;
      llmContent += `URL: ${page.url}\n\n`;
      llmContent += `${page.markdown}\n\n---\n\n`;
    }

    // 4. Update the LLM field on the Site Grouping item
    // The Site Grouping item ID is available in the site properties as siteDefinitionID
    const siteGroupingId = siteResult.data?.hosts?.[0]?.properties?.siteDefinitionID;

    if (!siteGroupingId) {
      return { success: false, message: 'Could not find Site Grouping ID (siteDefinitionID) in site properties.' };
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

    // If we get an item back, but the language name doesn't match or version is 0,
    // it usually means it fell back to another language or doesn't have this version.
    // In GraphQL, querying a non-existent language version often returns null for the item or version 0.
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
        variables: { itemId: siteGroupingId, language, value: llmContent },
      },
      query: { sitecoreContextId: contextId },
    });

    return { success: true, message: `Generated llms.txt and saved to Site Grouping item (${processedPages.length} pages).` };
  } catch (error: any) {
    console.error('Error generating llms.txt:', error);
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}
