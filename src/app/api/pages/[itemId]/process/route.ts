import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { processPage } from '@/lib/sitecore/process-page';

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

  let body: { contextId?: string; language?: string; targetField?: string; metaField?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contextId, language = 'en', targetField = 'AiMarkdown', metaField = 'AiMarkdownMeta' } =
    body;

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
      aiApiKey
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing page', error);
    return NextResponse.json({ error: 'Failed to process page' }, { status: 500 });
  }
}
