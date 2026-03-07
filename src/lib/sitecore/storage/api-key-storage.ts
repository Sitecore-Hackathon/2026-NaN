import { ClientSDK } from '@sitecore-marketplace-sdk/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KVStorePathSegment {
  name: string;
  icon?: string;
}

export interface KVStoreConfig {
  /** Template ID for leaf (value) items */
  templateId: string;
  /** Template ID for folder items */
  folderTemplateId: string;
  /** Sitecore path that is guaranteed to exist (e.g. "/sitecore/system/Modules") */
  basePath: string;
  /** Folder segments to create/traverse below basePath */
  pathSegments: KVStorePathSegment[];
  /** Field name on the item that holds the value */
  valueField: string;
  /** Language for all GraphQL operations */
  language?: string;
  /** Icon for individual value items */
  itemIcon?: string;
}

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// GraphQL fragments (shared)
// ---------------------------------------------------------------------------

const GQL_GET_ITEM = `
  query GetItem($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      name
      fields(excludeStandardFields: true) {
        nodes { name value }
      }
    }
  }
`;

const GQL_UPDATE_ITEM = `
  mutation UpdateItem($itemId: ID!, $language: String!, $fields: [FieldValueInput]!) {
    updateItem(input: { itemId: $itemId, language: $language, fields: $fields }) {
      item { itemId }
    }
  }
`;

const GQL_CREATE_ITEM = `
  mutation CreateItem(
    $name: String!
    $templateId: ID!
    $parent: ID!
    $language: String!
    $fields: [FieldValueInput!]!
  ) {
    createItem(
      input: { name: $name, templateId: $templateId, parent: $parent, language: $language, fields: $fields }
    ) {
      item { itemId }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GraphQLResult<T> = { data?: { data?: T } };

async function gql<T>(
  client: ClientSDK,
  contextId: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  const result = (await client.mutate('xmc.authoring.graphql', {
    params: {
      body: { query, variables },
      query: { sitecoreContextId: contextId },
    },
  })) as GraphQLResult<T>;
  return result?.data?.data ?? null;
}

/** Simple mutex to prevent race conditions during path creation */
class Mutex {
  private queue: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => { });
    return next;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a key-value store backed by Sitecore XMC content items.
 *
 * Each key maps to a single item whose value is stored in `cfg.valueField`.
 * Folder structure is created on demand.
 *
 * @example
 * const store = createKVStore(client, contextId, apiKeyStoreConfig);
 * await store.set('vercel', 'v1:...');
 * const key = await store.get('vercel');
 */
export function createKVStore(
  client: ClientSDK,
  contextId: string,
  cfg: KVStoreConfig
): KVStore {
  const lang = cfg.language ?? 'en';
  const mutex = new Mutex();

  const rootPath = [cfg.basePath, ...cfg.pathSegments.map((s) => s.name)].join(
    '/'
  );

  /** Ensures all path segments exist; returns the parent item ID */
  async function ensureRoot(): Promise<string> {
    return mutex.run(async () => {
      const base = await gql<{ item: { itemId: string } }>(
        client,
        contextId,
        GQL_GET_ITEM,
        { path: cfg.basePath, language: lang }
      );
      if (!base?.item?.itemId) {
        throw new Error(`Base path does not exist: ${cfg.basePath}`);
      }

      let parentId = base.item.itemId;
      let currentPath = cfg.basePath;

      for (const segment of cfg.pathSegments) {
        currentPath += `/${segment.name}`;
        const existing = await gql<{ item: { itemId: string } }>(
          client,
          contextId,
          GQL_GET_ITEM,
          { path: currentPath, language: lang }
        );

        if (existing?.item?.itemId) {
          parentId = existing.item.itemId;
        } else {
          const fields = segment.icon
            ? [{ name: '__Icon', value: segment.icon }]
            : [];
          const created = await gql<{
            createItem: { item: { itemId: string } };
          }>(client, contextId, GQL_CREATE_ITEM, {
            name: segment.name,
            templateId: cfg.folderTemplateId,
            parent: parentId,
            language: lang,
            fields,
          });
          const id = created?.createItem?.item?.itemId;
          if (!id) throw new Error(`Failed to create folder: ${segment.name}`);
          parentId = id;
        }
      }

      return parentId;
    });
  }

  return {
    async get(key: string): Promise<string | null> {
      try {
        const data = await gql<{
          item: { fields: { nodes: { name: string; value: string }[] } };
        }>(client, contextId, GQL_GET_ITEM, {
          path: `${rootPath}/${key}`,
          language: lang,
        });
        return (
          data?.item?.fields?.nodes?.find((f) => f.name === cfg.valueField)
            ?.value ?? null
        );
      } catch {
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      const parentId = await ensureRoot();
      const itemPath = `${rootPath}/${key}`;

      const existing = await gql<{ item: { itemId: string } }>(
        client,
        contextId,
        GQL_GET_ITEM,
        { path: itemPath, language: lang }
      );

      if (existing?.item?.itemId) {
        await gql(client, contextId, GQL_UPDATE_ITEM, {
          itemId: existing.item.itemId,
          language: lang,
          fields: [{ name: cfg.valueField, value }],
        });
      } else {
        const fields: { name: string; value: string }[] = [
          { name: cfg.valueField, value },
        ];
        if (cfg.itemIcon) fields.push({ name: '__Icon', value: cfg.itemIcon });

        await gql(client, contextId, GQL_CREATE_ITEM, {
          name: key,
          templateId: cfg.templateId,
          parent: parentId,
          language: lang,
          fields,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Pre-configured stores
// ---------------------------------------------------------------------------

/** Store config for setup flag under /sitecore/system/Modules/AEO Helper/Setup */
export const setupFlagStoreConfig: KVStoreConfig = {
  templateId: '{97D75760-CF8B-4740-810B-7727B564EF4D}',
  folderTemplateId: '{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}',
  basePath: '/sitecore/system/Modules',
  pathSegments: [
    { name: 'AEO Helper', icon: 'Office/32x32/window_gear.png' },
    { name: 'Setup', icon: 'Office/32x32/window_gear.png' },
  ],
  valueField: 'Value',
  language: 'en',
};

/** Store config for API keys under /sitecore/system/Modules/AEO Helper/Api Keys */
export const apiKeyStoreConfig: KVStoreConfig = {
  templateId: '{97D75760-CF8B-4740-810B-7727B564EF4D}',
  folderTemplateId: '{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}',
  basePath: '/sitecore/system/Modules',
  pathSegments: [
    { name: 'AEO Helper', icon: 'Office/32x32/window_gear.png' },
    { name: 'Api Keys', icon: 'Office/32x32/keys.png' },
  ],
  valueField: 'Value',
  language: 'en',
  itemIcon: 'Office/32x32/key.png',
};

// ---------------------------------------------------------------------------
// JSON Store — stores one object as JSON in a single Sitecore item
// ---------------------------------------------------------------------------

export interface JsonStoreConfig {
  /** Template ID for the single value item */
  templateId: string;
  /** Template ID for folder items */
  folderTemplateId: string;
  /** Sitecore path that is guaranteed to exist */
  basePath: string;
  /** Folder segments to create/traverse below basePath */
  pathSegments: KVStorePathSegment[];
  /** Name of the single item that holds the JSON value */
  itemName: string;
  /** Field on that item containing the JSON string */
  valueField: string;
  language?: string;
}

export interface JsonStore<T> {
  get(): Promise<T | null>;
  set(value: T): Promise<void>;
}

/**
 * Creates a store that persists a single object as JSON in one Sitecore item.
 *
 * @example
 * const store = createJsonStore<AppConfig>(client, contextId, appConfigJsonStoreConfig);
 * await store.set({ targetFieldName: 'AiMarkdown', metaFieldName: 'AiMarkdownMeta' });
 * const cfg = await store.get();
 */
export function createJsonStore<T>(
  client: ClientSDK,
  contextId: string,
  cfg: JsonStoreConfig
): JsonStore<T> {
  const lang = cfg.language ?? 'en';
  const mutex = new Mutex();

  const folderPath = [cfg.basePath, ...cfg.pathSegments.map((s) => s.name)].join('/');
  const itemPath = `${folderPath}/${cfg.itemName}`;

  async function ensureFolder(): Promise<string> {
    return mutex.run(async () => {
      const base = await gql<{ item: { itemId: string } }>(
        client, contextId, GQL_GET_ITEM, { path: cfg.basePath, language: lang }
      );
      if (!base?.item?.itemId) {
        throw new Error(`Base path does not exist: ${cfg.basePath}`);
      }

      let parentId = base.item.itemId;
      let currentPath = cfg.basePath;

      for (const segment of cfg.pathSegments) {
        currentPath += `/${segment.name}`;
        const existing = await gql<{ item: { itemId: string } }>(
          client, contextId, GQL_GET_ITEM, { path: currentPath, language: lang }
        );
        if (existing?.item?.itemId) {
          parentId = existing.item.itemId;
        } else {
          const fields = segment.icon ? [{ name: '__Icon', value: segment.icon }] : [];
          const created = await gql<{ createItem: { item: { itemId: string } } }>(
            client, contextId, GQL_CREATE_ITEM,
            { name: segment.name, templateId: cfg.folderTemplateId, parent: parentId, language: lang, fields }
          );
          const id = created?.createItem?.item?.itemId;
          if (!id) throw new Error(`Failed to create folder: ${segment.name}`);
          parentId = id;
        }
      }
      return parentId;
    });
  }

  return {
    async get(): Promise<T | null> {
      try {
        const data = await gql<{
          item: { fields: { nodes: { name: string; value: string }[] } };
        }>(client, contextId, GQL_GET_ITEM, { path: itemPath, language: lang });
        const raw = data?.item?.fields?.nodes?.find((f) => f.name === cfg.valueField)?.value;
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },

    async set(value: T): Promise<void> {
      const parentId = await ensureFolder();
      const json = JSON.stringify(value);

      const existing = await gql<{ item: { itemId: string } }>(
        client, contextId, GQL_GET_ITEM, { path: itemPath, language: lang }
      );

      if (existing?.item?.itemId) {
        await gql(client, contextId, GQL_UPDATE_ITEM, {
          itemId: existing.item.itemId,
          language: lang,
          fields: [{ name: cfg.valueField, value: json }],
        });
      } else {
        await gql(client, contextId, GQL_CREATE_ITEM, {
          name: cfg.itemName,
          templateId: cfg.templateId,
          parent: parentId,
          language: lang,
          fields: [{ name: cfg.valueField, value: json }],
        });
      }
    },
  };
}

/** JSON store config for AEO Helper app config */
export const appConfigJsonStoreConfig: JsonStoreConfig = {
  templateId: '{97D75760-CF8B-4740-810B-7727B564EF4D}',
  folderTemplateId: '{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}',
  basePath: '/sitecore/system/Modules',
  pathSegments: [
    {
      name: 'AEO Helper', icon: 'Office/32x32/window_gear.png',
    },
    { name: 'Config', icon: 'Office/32x32/window_gear.png', }
  ],
  itemName: 'Config',
  valueField: 'Value',
  language: 'en',
};

// ---------------------------------------------------------------------------
// Backwards-compatible helpers (used by app-settings-provider)
// ---------------------------------------------------------------------------

export async function getApiKey(
  client: ClientSDK,
  contextId: string,
  name: string
): Promise<string | null> {
  return createKVStore(client, contextId, apiKeyStoreConfig).get(name);
}

export async function saveApiKey(
  client: ClientSDK,
  contextId: string,
  name: string,
  value: string
): Promise<void> {
  return createKVStore(client, contextId, apiKeyStoreConfig).set(name, value);
}
