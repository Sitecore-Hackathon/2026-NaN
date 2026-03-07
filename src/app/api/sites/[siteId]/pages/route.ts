import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { listAllPages } from '@/lib/sitecore/pages';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const url = new URL(request.url);
  const contextId = url.searchParams.get('contextid');
  const siteName = url.searchParams.get('site') ?? '';
  const targetField = url.searchParams.get('targetField') ?? 'AiMarkdown';
  const metaField = url.searchParams.get('metaField') ?? 'AiMarkdownMeta';
  const language = url.searchParams.get('language') ?? undefined;
  const accessToken = request.headers.get('authorization')?.split(' ')[1];

  if (!contextId) {
    return NextResponse.json({ error: 'Context ID is required' }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 401 });
  }

  const xmcClient = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const pages = await listAllPages(
      xmcClient,
      contextId,
      siteId,
      siteName,
      targetField,
      metaField,
      language
    );
    return NextResponse.json(pages);
  } catch (error) {
    console.error('Error fetching pages', error);
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}
