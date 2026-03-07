import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];
  const urlParams = request.nextUrl.searchParams;
  const contextId = urlParams.get('contextid');
  const language = urlParams.get('language') || 'en';

  if (!accessToken || !contextId) {
    return NextResponse.json({ error: 'Auth and contextId required' }, { status: 401 });
  }

  const client = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const siteResult = await client.sites.retrieveSite({
      path: { siteId },
      query: { sitecoreContextId: contextId },
    });
    
    const siteGroupingId = siteResult.data?.hosts?.[0]?.properties?.siteDefinitionID;
    
    if (!siteGroupingId) {
       return NextResponse.json({ markdown: '' });
    }

    const itemResult = await client.authoring.graphql({
      body: {
        query: `
          query GetSiteGroupingLLM($itemId: ID!, $language: String!) {
            item(where: { itemId: $itemId, language: $language }) {
              field(name: "LLM") { value }
            }
          }
        `,
        variables: { itemId: siteGroupingId, language },
      },
      query: { sitecoreContextId: contextId },
    });

    const markdown = (itemResult.data?.data as any)?.item?.field?.value || '';
    return NextResponse.json({ markdown });
  } catch (error) {
    console.error('Failed to get LLM content', error);
    return NextResponse.json({ error: 'Failed to retrieve LLM content' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  let body: { contextId?: string; language?: string; markdown?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contextId, language = 'en', markdown = '' } = body;

  if (!contextId) {
    return NextResponse.json({ error: 'contextId required' }, { status: 400 });
  }

  const client = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const siteResult = await client.sites.retrieveSite({
      path: { siteId },
      query: { sitecoreContextId: contextId },
    });
    
    const siteGroupingId = siteResult.data?.hosts?.[0]?.properties?.siteDefinitionID;
    if (!siteGroupingId) {
      return NextResponse.json({ error: 'Site Grouping ID not found' }, { status: 400 });
    }

    // Attempt to add a version just in case it doesn't exist
    const versionResult = await client.authoring.graphql({
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
    const versionData = (versionResult.data?.data as any)?.item;

    if (!versionData || versionData.version === 0) {
      await client.authoring.graphql({
        body: {
          query: `
            mutation AddLanguageVersion($itemId: ID!, $language: String!) {
              addVersion(input: {
                itemId: $itemId,
                language: $language
              }) {
                item { itemId }
              }
            }
          `,
          variables: { itemId: siteGroupingId, language },
        },
        query: { sitecoreContextId: contextId },
      });
    }

    await client.authoring.graphql({
      body: {
        query: `
          mutation UpdateLLMField($itemId: ID!, $language: String!, $value: String!) {
            updateItem(input: {
              itemId: $itemId,
              language: $language,
              fields: [{ name: "LLM", value: $value }]
            }) {
              item { itemId }
            }
          }
        `,
        variables: { itemId: siteGroupingId, language, value: markdown },
      },
      query: { sitecoreContextId: contextId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save manual LLM content', error);
    return NextResponse.json({ error: 'Failed to update LLM content' }, { status: 500 });
  }
}
