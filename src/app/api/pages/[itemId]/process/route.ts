import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { processPage, VersionNotFoundError } from '@/lib/sitecore/process-page';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];
  const aiApiKey = request.headers.get('x-ai-api-key') ?? undefined;

  if (!accessToken) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 401 });
  }

  let body: { contextId?: string; language?: string; targetField?: string; metaField?: string; saveToSitecore?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    contextId,
    language = 'en',
    targetField = 'AiMarkdown',
    metaField = 'AiMarkdownMeta',
    // Default true: batch dashboard writes directly to Sitecore.
    // Custom-field dialog passes false and saves via client.setValue() instead.
    saveToSitecore = true,
  } = body;

  if (!contextId) {
    return NextResponse.json({ error: 'contextId is required' }, { status: 400 });
  }

  const xmcClient = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const result = await processPage(
      xmcClient,
      contextId,
      itemId,
      language,
      targetField,
      metaField,
      aiApiKey,
      saveToSitecore
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VersionNotFoundError) {
      return NextResponse.json({ status: 'version_not_found' });
    }
    console.error('Error processing page', error);
    return NextResponse.json({ error: 'Failed to process page' }, { status: 500 });
  }
}
