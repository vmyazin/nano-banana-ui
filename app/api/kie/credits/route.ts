import { NextRequest, NextResponse } from 'next/server';

import { validateKieApiKey } from '@/lib/kie/server';

/**
 * Current Kie credit balance. The spend ledger reads it before a submit and
 * after a success and bills the difference, so a vendor failure here answers
 * 200 with `null`: the run is already done and only the readout is affected.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { apiKey?: unknown } | null;
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Kie API key is required' }, { status: 400 });
  }
  try {
    const { credits } = await validateKieApiKey(apiKey);
    return NextResponse.json({ success: true, credits });
  } catch {
    return NextResponse.json({ success: true, credits: null });
  }
}
