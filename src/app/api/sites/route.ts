import { NextRequest, NextResponse } from 'next/server';
import { experimental_createXMCClient } from '@sitecore-marketplace-sdk/xmc';
import { listSites } from '@/lib/sitecore/sites';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const contextId = url.searchParams.get('contextid');
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
    const sites = await listSites(xmcClient, contextId);
    return NextResponse.json(sites);
  } catch (error) {
    console.error('Error fetching sites', error);
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 });
  }
}
