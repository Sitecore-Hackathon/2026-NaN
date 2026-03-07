import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];
  const urlParams = request.nextUrl.searchParams;
  const contextId = urlParams.get('contextid');
  const language = urlParams.get('language') || 'en';
  const fieldName = urlParams.get('targetField') || 'AiMarkdown';

  if (!accessToken || !contextId) {
    return NextResponse.json({ error: 'Auth and contextId required' }, { status: 401 });
  }

  const client = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const itemResult = await client.authoring.graphql({
      body: {
        query: `
          query GetPageMarkdown($itemId: ID!, $language: String!, $fieldName: String!) {
            item(where: { itemId: $itemId, language: $language }) {
              field(name: $fieldName) { value }
            }
          }
        `,
        variables: { itemId, language, fieldName },
      },
      query: { sitecoreContextId: contextId },
    });

    const markdown = (itemResult.data?.data as any)?.item?.field?.value || '';
    return NextResponse.json({ markdown });
  } catch (error) {
    console.error('Failed to get markdown', error);
    return NextResponse.json({ error: 'Failed to retrieve page markdown' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  let body: { contextId?: string; language?: string; targetField?: string; markdown?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contextId, language = 'en', targetField = 'AiMarkdown', markdown = '' } = body;

  if (!contextId) {
    return NextResponse.json({ error: 'contextId required' }, { status: 400 });
  }

  const client = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    await client.authoring.graphql({
      body: {
        query: `
          mutation UpdateMarkdownField($itemId: ID!, $language: String!, $value: String!, $fieldName: String!) {
            updateItem(input: {
              itemId: $itemId,
              language: $language,
              fields: [{ name: $fieldName, value: $value }]
            }) {
              item { itemId }
            }
          }
        `,
        variables: { itemId, language, value: markdown, fieldName: targetField },
      },
      query: { sitecoreContextId: contextId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save manual markdown', error);
    return NextResponse.json({ error: 'Failed to update page markdown' }, { status: 500 });
  }
}
