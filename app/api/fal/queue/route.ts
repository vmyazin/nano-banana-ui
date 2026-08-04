import { NextRequest, NextResponse } from 'next/server';

import {
  cancelFalTask,
  FalApiError,
  getFalTask,
  submitFalTask,
} from '@/lib/fal/server';
import type { FalInputMode, FalMediaType, FalValue } from '@/lib/fal/types';

const GENERIC_FAL_ERROR = 'Something went wrong while contacting fal.';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isMediaType(value: unknown): value is FalMediaType {
  return value === 'image' || value === 'video';
}

function isInputMode(value: unknown): value is FalInputMode {
  return value === 'text' || value === 'image';
}

function isFalValue(value: unknown): value is FalValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isFalValues(value: unknown): value is Record<string, FalValue> {
  return isPlainObject(value) && Object.values(value).every(isFalValue);
}

function isUploadUrls(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((url) => typeof url === 'string');
}

function errorResponse(error: unknown) {
  if (error instanceof FalApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: GENERIC_FAL_ERROR }, { status: 500 });
}

function invalidRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest('The request body must be valid JSON.');
  }

  if (!isPlainObject(body)) {
    return invalidRequest('The request body must be a JSON object.');
  }
  if (body.operation !== 'submit' && body.operation !== 'status' && body.operation !== 'cancel') {
    return invalidRequest('A supported queue operation is required.');
  }

  try {
    if (body.operation === 'submit') {
      if (
        !isNonBlankString(body.apiKey) ||
        !isNonBlankString(body.modelId) ||
        !isMediaType(body.mediaType) ||
        !isInputMode(body.inputMode) ||
        !isNonBlankString(body.prompt) ||
        !isUploadUrls(body.uploadUrls) ||
        !isFalValues(body.values)
      ) {
        return invalidRequest('The submit request contains missing or invalid fields.');
      }

      const { requestId } = await submitFalTask({
        apiKey: body.apiKey.trim(),
        modelId: body.modelId.trim(),
        mediaType: body.mediaType,
        inputMode: body.inputMode,
        prompt: body.prompt.trim(),
        uploadUrls: body.uploadUrls,
        values: body.values,
      });
      return NextResponse.json({ success: true, requestId });
    }

    if (
      !isNonBlankString(body.apiKey) ||
      !isNonBlankString(body.modelId) ||
      !isMediaType(body.mediaType) ||
      !isInputMode(body.inputMode) ||
      typeof body.requestId !== 'string' ||
      !REQUEST_ID_PATTERN.test(body.requestId)
    ) {
      return invalidRequest('The queue request contains missing or invalid fields.');
    }

    const taskArgs = {
      apiKey: body.apiKey.trim(),
      modelId: body.modelId.trim(),
      mediaType: body.mediaType,
      inputMode: body.inputMode,
      requestId: body.requestId,
    };

    if (body.operation === 'status') {
      const task = await getFalTask(taskArgs);
      return NextResponse.json({ success: true, task });
    }

    await cancelFalTask(taskArgs);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
