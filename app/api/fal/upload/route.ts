import { NextRequest, NextResponse } from 'next/server';

import { FalApiError, uploadFalFile } from '@/lib/fal/server';

const GENERIC_FAL_ERROR = 'Something went wrong while contacting fal.';

function errorResponse(error: unknown) {
  if (error instanceof FalApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: GENERIC_FAL_ERROR }, { status: 500 });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'The request body must be valid multipart form data.' },
      { status: 400 }
    );
  }

  const apiKey = form.get('apiKey');
  const file = form.get('file');
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json(
      { success: false, error: 'A fal API key is required.' },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: 'A source file is required.' },
      { status: 400 }
    );
  }

  try {
    const url = await uploadFalFile({ apiKey: apiKey.trim(), file });
    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
