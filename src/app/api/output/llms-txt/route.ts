import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { generateAndStoreLlmTxt } from '@/lib/sitecore/llms-txt';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const contextId = url.searchParams.get('contextid');
  const accessToken = request.headers.get('authorization')?.split(' ')[1];

  if (!contextId) {
    return NextResponse.json({ error: 'Context ID is required' }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 401 });
  }

  const { siteName, siteId, targetField } = await request.json();

  if (!siteName || !siteId || !targetField) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const xmcClient = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const result = await generateAndStoreLlmTxt(xmcClient, contextId, siteName, siteId, targetField);
    console.log('result', JSON.stringify(result));
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error generating llms.txt', error);
    return NextResponse.json({ error: error.message || 'Failed to generate llms.txt' }, { status: 500 });
  }
}
