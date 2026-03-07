import { experimental_XMC } from '@sitecore-marketplace-sdk/xmc';

export interface SiteSummary {
  id: string;
  name: string;
  displayName: string;
  languages: string[];
}

export async function listSites(
  client: experimental_XMC,
  contextId: string
): Promise<SiteSummary[]> {
  const result = await client.sites.listSites({
    query: { sitecoreContextId: contextId },
  });
  return (result.data ?? [])
    .filter((site) => site.id)
    .map((site) => ({
      id: site.id!,
      name: site.hosts?.[0]?.name ?? site.name ?? '',
      displayName: site.displayName ?? site.name ?? '',
      languages: site.languages ?? [],
    }));
}
