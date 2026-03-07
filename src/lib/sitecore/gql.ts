import { ClientSDK } from '@sitecore-marketplace-sdk/client';

type GQLResult<T> = { data?: { data?: T; errors?: Array<{ message: string }> } };

export async function gql<T>(
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

export const GQL_CREATE_ITEM = `
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
