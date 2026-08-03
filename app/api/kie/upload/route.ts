import { NextRequest, NextResponse } from 'next/server';
import { uploadKieFile } from '@/lib/kie/server';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const apiKey = form.get('apiKey');
    const file = form.get('file');

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ success: false, error: 'Kie API key is required' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A source file is required' }, { status: 400 });
    }

    const url = await uploadKieFile({ apiKey: apiKey.trim(), file });
    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    const status =
      error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    const message = error instanceof Error ? error.message : 'Could not upload the source file to Kie.';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
