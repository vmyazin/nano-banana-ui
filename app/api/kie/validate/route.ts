import { NextRequest, NextResponse } from 'next/server';
import { validateKieApiKey } from '@/lib/kie/server';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Kie API key is required' }, { status: 400 });
    }

    const { credits } = await validateKieApiKey(apiKey);
    return NextResponse.json({ success: true, credits });
  } catch (error: unknown) {
    const status =
      error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    const message = error instanceof Error ? error.message : 'Could not validate the Kie API key.';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
