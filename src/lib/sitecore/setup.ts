import { ClientSDK } from '@sitecore-marketplace-sdk/client';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const GQL_GET_ITEM_TEMPLATE_BY_ID = `
  query GetItemTemplateById($itemId: ID!, $language: String!) {
    item(where: { itemId: $itemId, language: $language }) {
      itemId
      template { templateId name }
    }
  }
`;

const GQL_GET_TEMPLATE_CHILDREN = `
  query GetTemplateChildren($templateId: ID!, $language: String!) {
    item(where: { itemId: $templateId, language: $language }) {
      itemId name
      children { nodes { name itemId
        children { nodes { name itemId } }
      }}
    }
  }
`;

const GQL_GET_ITEM_BY_PATH = `
  query GetItemByPath($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      template { templateId name }
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

const TEMPLATE_FIELD_TEMPLATE_ID = '{455A3E98-A627-4B40-8035-E683A0331AC7}';
const TEMPLATE_SECTION_TEMPLATE_ID = '{E269FBB5-3750-427A-9149-7AA950B49301}';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

type GQLResult<T> = { data?: { data?: T; errors?: Array<{ message: string }> } };

async function gql<T>(
  client: ClientSDK,
  contextId: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ data: T | null; errors?: Array<{ message: string }> }> {
  const result = (await client.mutate('xmc.authoring.graphql', {
    params: {
      body: { query, variables },
      query: { sitecoreContextId: contextId },
    },
  })) as GQLResult<T>;
  return { data: result?.data?.data ?? null, errors: result?.data?.errors };
}

function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('security') || lower.includes('access denied') || lower.includes('permission');
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function checkPageTemplateFields(
  client: ClientSDK,
  contextId: string,
  siteId: string,
  requiredFields: string[]
): Promise<{
  templateId: string | null;
  templateName: string | null;
  missingFields: string[];
  checked: boolean;
}> {
  // Get site details and take the first page location (home page)
  let templateId: string | null = null;
  let templateName: string | null = null;

  try {
    const siteResult = await client.query('xmc.agent.sitesGetSiteDetails', {
      params: {
        path: { siteId },
        query: { sitecoreContextId: contextId },
      },
    });
    const siteInfo = siteResult.data?.data as
      | { itemId: string; page_locations: Array<{ itemId: string }> }
      | null
      | undefined;
    const homeItemId = siteInfo?.page_locations?.[0]?.itemId;

    if (!homeItemId) {
      return { templateId: null, templateName: null, missingFields: [], checked: false };
    }

    const { data: itemData } = await gql<{
      item: { itemId: string; template: { templateId: string; name: string } } | null;
    }>(client, contextId, GQL_GET_ITEM_TEMPLATE_BY_ID, {
      itemId: homeItemId,
      language: 'en',
    });

    if (!itemData?.item?.template) {
      return { templateId: null, templateName: null, missingFields: [], checked: false };
    }

    templateId = itemData.item.template.templateId;
    templateName = itemData.item.template.name;
  } catch {
    return { templateId: null, templateName: null, missingFields: [], checked: false };
  }

  if (!templateId) {
    return { templateId: null, templateName: null, missingFields: [], checked: false };
  }

  try {
    const { data: tplData } = await gql<{
      item: {
        itemId: string;
        name: string;
        children: {
          nodes: Array<{
            name: string;
            itemId: string;
            children: { nodes: Array<{ name: string; itemId: string }> };
          }>;
        };
      } | null;
    }>(client, contextId, GQL_GET_TEMPLATE_CHILDREN, { templateId, language: 'en' });

    const existingFields = new Set<string>();
    for (const section of tplData?.item?.children?.nodes ?? []) {
      for (const field of section.children?.nodes ?? []) {
        existingFields.add(field.name.toLowerCase());
      }
    }

    const missingFields = requiredFields.filter((f) => !existingFields.has(f.toLowerCase()));
    return { templateId, templateName, missingFields, checked: true };
  } catch {
    return { templateId, templateName, missingFields: [], checked: false };
  }
}

export async function addFieldsToTemplate(
  client: ClientSDK,
  contextId: string,
  templateId: string,
  sectionName: string,
  fields: Array<{ name: string; type: string, source?: string }>
): Promise<{ success: boolean; permissionDenied: boolean; error?: string }> {
  try {
    const { data: tplData, errors: tplErrors } = await gql<{
      item: {
        itemId: string;
        children: {
          nodes: Array<{
            name: string;
            itemId: string;
            children: { nodes: Array<{ name: string; itemId: string }> };
          }>;
        };
      } | null;
    }>(client, contextId, GQL_GET_TEMPLATE_CHILDREN, { templateId, language: 'en' });

    if (tplErrors?.length) {
      const msg = tplErrors[0].message;
      return { success: false, permissionDenied: isPermissionError(msg), error: msg };
    }
    if (!tplData?.item) {
      return { success: false, permissionDenied: false, error: 'Template not found' };
    }

    // Collect all existing field names across all sections (case-insensitive)
    const existingFieldNames = new Set<string>();
    for (const section of tplData.item.children.nodes) {
      for (const field of section.children?.nodes ?? []) {
        existingFieldNames.add(field.name.toLowerCase());
      }
    }

    // Only add fields that don't already exist
    const fieldsToAdd = fields.filter((f) => !existingFieldNames.has(f.name.toLowerCase()));
    if (fieldsToAdd.length === 0) {
      return { success: true, permissionDenied: false };
    }

    // Find or create the section
    let sectionId = tplData.item.children.nodes.find((n) => n.name === sectionName)?.itemId;

    if (!sectionId) {
      const { data: sectionData, errors: sectionErrors } = await gql<{
        createItem: { item: { itemId: string } };
      }>(client, contextId, GQL_CREATE_ITEM, {
        name: sectionName,
        templateId: TEMPLATE_SECTION_TEMPLATE_ID,
        parent: tplData.item.itemId,
        language: 'en',
        fields: [],
      });

      if (sectionErrors?.length) {
        const msg = sectionErrors[0].message;
        return { success: false, permissionDenied: isPermissionError(msg), error: msg };
      }
      sectionId = sectionData?.createItem?.item?.itemId;
      if (!sectionId) {
        return { success: false, permissionDenied: false, error: 'Failed to create section' };
      }
    }

    // Create each field under the section
    for (const field of fieldsToAdd) {
      const { errors: fieldErrors } = await gql<unknown>(client, contextId, GQL_CREATE_ITEM, {
        name: field.name,
        templateId: TEMPLATE_FIELD_TEMPLATE_ID,
        parent: sectionId,
        language: 'en',
        fields: [
          { name: 'Type', value: field.type, },
          { name: 'Source', value: field.source || '' }
        ],
      });

      if (fieldErrors?.length) {
        const msg = fieldErrors[0].message;
        return { success: false, permissionDenied: isPermissionError(msg), error: msg };
      }
    }

    return { success: true, permissionDenied: false };
  } catch (err) {
    return { success: false, permissionDenied: false, error: String(err) };
  }
}

export async function checkSiteSettingsField(
  client: ClientSDK,
  contextId: string,
  siteId: string,
  fieldName: string
): Promise<{
  settingsItemId: string | null;
  settingsTemplateId: string | null;
  hasField: boolean;
  checked: boolean;
}> {
  const siteResult = await client.query('xmc.sites.retrieveSite', {
    params: {
      path: { siteId },
      query: { sitecoreContextId: contextId },
    }
  });
  console.log('[SETUP] siteResult', siteResult);

  const siteDefinitionId = siteResult.data?.data?.hosts?.[0]?.properties?.siteDefinitionID;
  console.log('[SETUP] siteDefinitionId', siteDefinitionId);
  for (const id of [siteDefinitionId]) {
    try {
      const { data } = await gql<{
        item: {
          itemId: string;
          template: { templateId: string; name: string };
        } | null;
      }>(client, contextId, GQL_GET_ITEM_TEMPLATE_BY_ID, { itemId: id, language: 'en' });

      console.log('[SETUP] item template data', data);
      if (!data?.item) continue;

      const { itemId: settingsItemId, template } = data.item;
      const settingsTemplateId = template.templateId;

      const { data: tplData } = await gql<{
        item: {
          children: {
            nodes: Array<{
              name: string;
              itemId: string;
              children: { nodes: Array<{ name: string; itemId: string }> };
            }>;
          };
        } | null;
      }>(client, contextId, GQL_GET_TEMPLATE_CHILDREN, {
        templateId: settingsTemplateId,
        language: 'en',
      });

      const hasField = (tplData?.item?.children?.nodes ?? []).some((section) =>
        section.children?.nodes?.some((f) => f.name.toLowerCase() === fieldName.toLowerCase())
      );

      return { settingsItemId, settingsTemplateId, hasField, checked: true };
    } catch {
      // try next candidate
    }
  }

  return { settingsItemId: null, settingsTemplateId: null, hasField: false, checked: false };
}
