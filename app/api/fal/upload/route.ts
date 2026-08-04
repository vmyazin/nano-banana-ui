import { NextRequest, NextResponse } from 'next/server';

import { FalApiError, uploadFalFile } from '@/lib/fal/server';

const GENERIC_FAL_ERROR = 'Something went wrong while contacting fal.';
const MAX_UPLOAD_BODY_BYTES = 21 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_API_KEY_LENGTH = 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function declaredBodyTooLarge(request: NextRequest): boolean {
  const value = request.headers?.get('content-length');
  return value !== null && /^\d+$/.test(value) && Number(value) > MAX_UPLOAD_BODY_BYTES;
}

function isFile(value: unknown): value is File {
  if (value === null || typeof value !== 'object') return false;
  if (Object.prototype.toString.call(value) !== '[object File]') return false;
  if (
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('size' in value) ||
    typeof value.size !== 'number' ||
    !('type' in value) ||
    typeof value.type !== 'string'
  ) {
    return false;
  }

  try {
    const filePrototype = Object.getPrototypeOf(value);
    const blobPrototype = Object.getPrototypeOf(filePrototype);
    const slice = Reflect.get(blobPrototype, 'slice');
    if (typeof slice !== 'function') return false;
    Reflect.apply(slice, value, [0, 0]);
    return true;
  } catch {
    return false;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof FalApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: GENERIC_FAL_ERROR }, { status: 500 });
}

export async function POST(request: NextRequest) {
  if (declaredBodyTooLarge(request)) {
    return NextResponse.json(
      { success: false, error: 'The request body is too large.' },
      { status: 413 }
    );
  }

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
  if (
    typeof apiKey !== 'string' ||
    !apiKey.trim() ||
    apiKey.length > MAX_API_KEY_LENGTH
  ) {
    return NextResponse.json(
      { success: false, error: 'A fal API key is required.' },
      { status: 400 }
    );
  }
  if (!isFile(file)) {
    return NextResponse.json(
      { success: false, error: 'A source file is required.' },
      { status: 400 }
    );
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { success: false, error: 'The source file must be a supported raster image.' },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { success: false, error: 'The source file is too large.' },
      { status: 413 }
    );
  }

  try {
    const url = await uploadFalFile({ apiKey: apiKey.trim(), file });
    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
