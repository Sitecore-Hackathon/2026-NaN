import { ClientSDK } from '@sitecore-marketplace-sdk/client';

type PathSegment = {
  name: string;
  icon?: string;
};

const config = {
  templateId: '{97D75760-CF8B-4740-810B-7727B564EF4D}', // Template ID for API Key items
  folderTemplateId: '{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}',
  basePath: '/sitecore/system/Modules', // Base path that always exists
  pathSegments: [
    { name: 'Editors Chat', icon: 'Office/32x32/window_gear.png' },
    { name: 'Api Keys', icon: 'Office/32x32/keys.png' },
  ] as PathSegment[],
  field: 'Value', // Field name where the key is stored
  language: 'en',
  apiKeyIcon: 'Office/32x32/key.png', // Icon for individual API key items (empty by default)
};

const queries = {
  getItem: `query GetItem($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
        itemId
        name
        fields(excludeStandardFields: true) {
            nodes {
                name
                value
            }
        }
    }
}`,
  updateItem: `mutation UpdateItem(
    $itemId: ID!
    $language: String!
    $fields: [FieldValueInput]!
) {
    updateItem(input: { itemId: $itemId, language: $language, fields: $fields }) {
        item {
            itemId
        }
    }
}
`,
  createItem: `mutation CreateItem(
    $name: String!
    $templateId: ID!
    $parent: ID!
    $language: String!
    $fields: [FieldValueInput!]!
) {
    createItem(
        input: {
            name: $name
            templateId: $templateId
            parent: $parent
            language: $language
            fields: $fields
        }
    ) {
        item {
            itemId
        }
    }
}`,
};

/**
 * Simple mutex to prevent race conditions during path creation
 */
class PathCreationMutex {
  private queue: Promise<unknown> = Promise.resolve();

  async lock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let resolve!: (value: unknown) => void;

    this.queue = new Promise((r) => (resolve = r));

    try {
      await previous;
      return await fn();
    } finally {
      resolve(undefined);
    }
  }
}

const pathMutex = new PathCreationMutex();

/**
 * Computes the full storage path from config
 */
function getStorageRoot(): string {
  const segments = config.pathSegments.map((s) => s.name).join('/');
  return `${config.basePath}/${segments}`;
}

/**
 * Ensures that the storage path exists, creating segments if necessary
 * Throws an error if path creation fails
 */
async function ensurePathExists(
  client: ClientSDK,
  sitecoreContextId: string
): Promise<string> {
  // Use mutex to prevent race conditions when creating paths concurrently
  return pathMutex.lock(async () => {
    let currentPath = config.basePath;
    let parentId: string | null = null;

    // Get the base path item ID
    const baseResult = await client.mutate('xmc.authoring.graphql', {
      params: {
        body: {
          query: queries.getItem,
          variables: { path: currentPath, language: config.language },
        },
        query: { sitecoreContextId },
      },
    });

    const baseData = baseResult?.data?.data as { item: { itemId: string } };
    if (!baseData?.item?.itemId) {
      throw new Error(`Base path does not exist: ${config.basePath}`);
    }

    parentId = baseData.item.itemId;

    // Check/create each path segment
    for (const segment of config.pathSegments) {
      currentPath += `/${segment.name}`;

      // Check if this segment exists
      const checkResult = await client.mutate('xmc.authoring.graphql', {
        params: {
          body: {
            query: queries.getItem,
            variables: { path: currentPath, language: config.language },
          },
          query: { sitecoreContextId },
        },
      });

      const checkData = checkResult?.data?.data as { item: { itemId: string } };
      if (checkData?.item?.itemId) {
        parentId = checkData.item.itemId;
      } else {
        // Create this segment with its icon
        const fields: { name: string; value: string }[] = [];
        if (segment.icon) {
          fields.push({ name: '__Icon', value: segment.icon });
        }

        const createResult = await client.mutate('xmc.authoring.graphql', {
          params: {
            body: {
              query: queries.createItem,
              variables: {
                name: segment.name,
                templateId: config.folderTemplateId,
                parent: parentId,
                language: config.language,
                fields,
              },
            },
            query: { sitecoreContextId },
          },
        });

        const createData = createResult?.data?.data as {
          createItem: { item: { itemId: string } };
        };
        parentId = createData?.createItem?.item?.itemId;
        if (!parentId) {
          throw new Error(`Failed to create path segment: ${segment.name}`);
        }
      }
    }

    if (!parentId) {
      throw new Error('Failed to create storage path: parentId is null');
    }

    return parentId;
  });
}

/**
 * Fetches an API key from Sitecore using GraphQL
 */
export async function getApiKey(
  client: ClientSDK,
  sitecoreContextId: string,
  name: string
): Promise<string | null> {
  try {
    const itemPath = `${getStorageRoot()}/${name}`;
    const result = await client.mutate('xmc.authoring.graphql', {
      params: {
        body: {
          query: queries.getItem,
          variables: {
            path: itemPath,
            language: config.language,
          },
        },
        query: {
          sitecoreContextId,
        },
      },
    });

    if (result?.data?.data) {
      const data = result.data?.data as {
        item: { fields: { nodes: { name: string; value: string }[] } };
      };
      if (data?.item?.fields) {
        const field = data.item.fields?.nodes?.find(
          (f: { name: string; value: string }) => f.name === config.field
        );
        if (field?.value) {
          return field.value as string;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching API key:', error);
    return null;
  }
}

/**
 * Saves an API key to Sitecore using GraphQL
 */
export async function saveApiKey(
  client: ClientSDK,
  sitecoreContextId: string,
  name: string,
  key: string
): Promise<boolean> {
  try {
    // Ensure the storage path exists (throws if fails)
    const parentId = await ensurePathExists(client, sitecoreContextId);

    const itemPath = `${getStorageRoot()}/${name}`;
    const checkResult = await client.mutate('xmc.authoring.graphql', {
      params: {
        body: {
          query: queries.getItem,
          variables: {
            path: itemPath,
            language: config.language,
          },
        },
        query: {
          sitecoreContextId,
        },
      },
    });

    let itemId: string | null = null;

    if (checkResult?.data?.data) {
      const data = checkResult.data?.data as { item: { itemId: string } };
      if (data?.item?.itemId) {
        itemId = data.item.itemId;
      }
    }

    if (itemId) {
      // Item exists, update it (no icon update)
      await client.mutate('xmc.authoring.graphql', {
        params: {
          body: {
            query: queries.updateItem,
            variables: {
              itemId,
              language: config.language,
              version: 1,
              fields: [
                {
                  name: config.field,
                  value: key,
                },
              ],
            },
          },
          query: {
            sitecoreContextId,
          },
        },
      });
    } else {
      // Item doesn't exist, create it with apiKeyIcon
      const fieldsToCreate: { name: string; value: string }[] = [
        {
          name: config.field,
          value: key,
        },
      ];

      if (config.apiKeyIcon) {
        fieldsToCreate.push({
          name: '__Icon',
          value: config.apiKeyIcon,
        });
      }

      await client.mutate('xmc.authoring.graphql', {
        params: {
          body: {
            query: queries.createItem,
            variables: {
              name,
              templateId: config.templateId,
              parent: parentId,
              language: config.language,
              fields: fieldsToCreate,
            },
          },
          query: {
            sitecoreContextId,
          },
        },
      });
    }

    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    // Re-throw to propagate path creation errors
    throw error;
  }
}

/**
 * Configuration for API key storage
 */
export function getApiKeyStorageConfig() {
  return { ...config };
}

/**
 * Updates the storage configuration
 */
export function setApiKeyStorageConfig(newConfig: Partial<typeof config>) {
  Object.assign(config, newConfig);
}

/**
 * Type definitions
 */
export type { PathSegment };

export type ApiKeyStorageConfig = {
  templateId: string;
  basePath: string;
  pathSegments: PathSegment[];
  field: string;
  language: string;
  apiKeyIcon: string;
};
