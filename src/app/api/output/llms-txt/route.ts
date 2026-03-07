import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { generateLlmTxtStream } from '@/lib/sitecore/llms-txt';

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

  const { siteName, siteId, targetField, language } = await request.json();
  console.log('siteName', siteName);
  console.log('siteId', siteId);
  console.log('targetField', targetField);
  console.log('language', language);

  if (!siteName || !siteId || !targetField || !language) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const xmcClient = await experimental_createXMCClient({
    getAccessToken: async () => accessToken,
  });

  try {
    const response = await generateLlmTxtStream(xmcClient, contextId, siteName, siteId, targetField, language);
    return response;
  } catch (error: any) {
    console.error('Error generating llms.txt', error);
    return NextResponse.json({ error: error.message || 'Failed to generate llms.txt' }, { status: 500 });
  }
}
