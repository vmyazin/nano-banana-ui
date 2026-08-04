import { NextRequest, NextResponse } from 'next/server';

import { FalApiError, validateFalApiKey } from '@/lib/fal/server';
import {
  FalRequestBodyTooLarge,
  parseBoundedFalJson,
} from '@/lib/fal/request-body';

const GENERIC_FAL_ERROR = 'Something went wrong while contacting fal.';
const MAX_VALIDATE_BODY_BYTES = 4 * 1024;
const MAX_API_KEY_LENGTH = 1024;

function errorResponse(error: unknown) {
  if (error instanceof FalApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: GENERIC_FAL_ERROR }, { status: 500 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await parseBoundedFalJson(request, MAX_VALIDATE_BODY_BYTES);
  } catch (error) {
    if (error instanceof FalRequestBodyTooLarge) {
      return NextResponse.json(
        { success: false, error: 'The request body is too large.' },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'The request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (
    body === null ||
    typeof body !== 'object' ||
    !('apiKey' in body) ||
    typeof body.apiKey !== 'string' ||
    !body.apiKey.trim() ||
    body.apiKey.length > MAX_API_KEY_LENGTH
  ) {
    return NextResponse.json(
      { success: false, error: 'A fal API key is required.' },
      { status: 400 }
    );
  }

  try {
    await validateFalApiKey(body.apiKey.trim());
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
