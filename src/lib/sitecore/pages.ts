import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';

export type PageStatus = 'pending' | 'processed' | 'error';

export interface PageSummary {
  id: string;
  name: string;
  displayName: string;
  url: string;
  updatedAt: string | null;
  processedAt: string | null;
  wordCount: number | null;
  status: PageStatus;
}

const GQL_GET_PAGE_FIELDS = `
  query GetPageFields($itemId: ID!, $language: String!) {
    item(where: { itemId: $itemId, language: $language }) {
      fields {
        nodes { name value }
      }
    }
  }
`;

type FieldNode = { name: string; value: string };

async function getItemFields(
  client: experimental_XMC,
  contextId: string,
  itemId: string,
  language: string
): Promise<FieldNode[]> {
  try {
    const result = await client.authoring.graphql({
      body: { query: GQL_GET_PAGE_FIELDS, variables: { itemId, language } },
      query: { sitecoreContextId: contextId },
    });
    const data = result.data?.data as
      | { item?: { fields?: { nodes: FieldNode[] } } }
      | null
      | undefined;
    return data?.item?.fields?.nodes ?? [];
  } catch {
    return [];
  }
}

export async function listAllPages(
  client: experimental_XMC,
  contextId: string,
  siteId: string,
  siteName: string,
  targetFieldName: string,
  metaFieldName: string
): Promise<PageSummary[]> {
  // 1. Get site primary language
  const siteResult = await client.sites.retrieveSite({
    path: { siteId },
    query: { sitecoreContextId: contextId },
  });
  const language = siteResult.data?.languages?.[0] ?? 'en';

  // 2. Get all pages in one call
  const pagesResult = await client.agent.sitesGetAllPagesBySite({
    path: { siteName },
    query: { sitecoreContextId: contextId, language },
  });
  const pages = pagesResult.data ?? [];

  // Deduplicate by id
  const seen = new Set<string>();
  const uniquePages = pages.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Sort: home (/) first, then hierarchically so /ai/sub comes right after /ai
  uniquePages.sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    const aSegs = a.path.split('/').filter(Boolean);
    const bSegs = b.path.split('/').filter(Boolean);
    const len = Math.min(aSegs.length, bSegs.length);
    for (let i = 0; i < len; i++) {
      const cmp = aSegs[i].localeCompare(bSegs[i]);
      if (cmp !== 0) return cmp;
    }
    return aSegs.length - bSegs.length;
  });

  // 3. Fetch field status for each page (batched concurrency)
  const summaries: PageSummary[] = [];
  const BATCH = 5;

  for (let i = 0; i < uniquePages.length; i += BATCH) {
    const batch = uniquePages.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (page): Promise<PageSummary> => {
        const fields = await getItemFields(client, contextId, page.id, language);

        const targetValue = fields.find((f) => f.name === targetFieldName)?.value ?? '';
        const metaRaw = fields.find((f) => f.name === metaFieldName)?.value ?? '';
        const updatedAt = fields.find((f) => f.name === '__Updated')?.value ?? null;
        const displayName = fields.find((f) => f.name === '__Display name')?.value ?? '';
        const nameFromPath = page.path.split('/').filter(Boolean).at(-1) ?? page.path;

        let processedAt: string | null = null;
        let wordCount: number | null = null;
        if (metaRaw) {
          try {
            const meta = JSON.parse(metaRaw) as Record<string, unknown>;
            processedAt = typeof meta.processedAt === 'string' ? meta.processedAt : null;
            wordCount = typeof meta.wordCount === 'number' ? meta.wordCount : null;
          } catch {
            // ignore malformed JSON
          }
        }

        return {
          id: page.id,
          name: nameFromPath,
          displayName: displayName || nameFromPath,
          url: page.path,
          updatedAt,
          processedAt,
          wordCount,
          status: targetValue ? 'processed' : 'pending',
        };
      })
    );
    summaries.push(...results);
  }

  return summaries;
}
