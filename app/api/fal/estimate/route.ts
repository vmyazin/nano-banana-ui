import { NextRequest, NextResponse } from 'next/server';

import { estimateFalCost } from '@/lib/fal/server';
import { FalRequestBodyTooLarge, parseBoundedFalJson } from '@/lib/fal/request-body';

const MAX_ESTIMATE_BODY_BYTES = 4 * 1024;
const MAX_API_KEY_LENGTH = 1024;
/** fal endpoint ids look like `fal-ai/veo3.1/fast/image-to-video`. */
const ENDPOINT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i;

/**
 * Cost estimate for one run. Answers 200 with `costUsd: null` on any vendor
 * failure: the caller has already generated something and can do nothing with
 * an error except show an unknown figure.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await parseBoundedFalJson(request, MAX_ESTIMATE_BODY_BYTES);
  } catch (error) {
    const status = error instanceof FalRequestBodyTooLarge ? 413 : 400;
    return NextResponse.json({ success: false, error: 'The request body must be valid JSON.' }, { status });
  }

  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
  const endpointId = typeof record.endpointId === 'string' ? record.endpointId.trim() : '';
  const durationSeconds =
    typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds) && record.durationSeconds > 0
      ? record.durationSeconds
      : undefined;

  if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH) {
    return NextResponse.json({ success: false, error: 'A fal API key is required.' }, { status: 400 });
  }
  if (!endpointId || endpointId.length > 128 || !ENDPOINT_ID_PATTERN.test(endpointId)) {
    return NextResponse.json({ success: false, error: 'A fal endpoint id is required.' }, { status: 400 });
  }

  try {
    const estimate = await estimateFalCost({ apiKey, endpointId, durationSeconds });
    return NextResponse.json({ success: true, ...estimate });
  } catch {
    return NextResponse.json({ success: true, costUsd: null });
  }
}
