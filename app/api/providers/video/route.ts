import { NextRequest, NextResponse } from 'next/server';

import { getAdapter, isProviderId } from '@/lib/providers';
import { resolveDuration, resolveModel, resolveSize } from '@/lib/providers/catalog';
import { ProviderError } from '@/lib/providers/types';

/**
 * Video for the aggregator providers — one route for all three, because their
 * contracts are the same two calls behind different spellings: submit a job,
 * poll it until a URL appears. The per-vendor differences live in the adapters.
 *
 * Keys arrive per request from the browser and are never stored here, the same
 * BYOK deal the fal and Kie routes already make.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function failure(error: unknown, fallback: string) {
  const status = error instanceof ProviderError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !isProviderId(body.provider)) {
    return NextResponse.json(
      { success: false, error: 'A supported provider is required' },
      { status: 400 }
    );
  }

  const adapter = getAdapter(body.provider);
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: `A ${adapter.label} API key is required` },
      { status: 400 }
    );
  }

  if (body.operation === 'status') {
    if (typeof body.taskId !== 'string' || !body.taskId) {
      return NextResponse.json({ success: false, error: 'A task ID is required' }, { status: 400 });
    }
    try {
      const task = await adapter.pollVideo({ apiKey, taskId: body.taskId });
      return NextResponse.json({ success: true, task });
    } catch (error) {
      return failure(error, `${adapter.label} could not report this task.`);
    }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((image): image is string => typeof image === 'string' && image.startsWith('data:'))
    : [];

  const model = resolveModel(
    body.provider,
    'video',
    typeof body.model === 'string' ? body.model : undefined
  );

  // Whitelisted per model: Runware answers an unlisted width/height with
  // "Unsupported width/height combination for this model architecture".
  const size = resolveSize(body.provider, model, typeof body.size === 'string' ? body.size : undefined);

  try {
    const { taskId } = await adapter.createVideo({
      apiKey,
      model,
      prompt,
      images,
      // Snapped to a length this model accepts — vendors reject anything else,
      // and a model that counts frames instead gets no duration at all.
      durationSeconds: resolveDuration(
        body.provider,
        model,
        typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined
      ),
      width: size?.width,
      height: size?.height,
      resolution: size?.preset,
      aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined,
    });
    return NextResponse.json({ success: true, taskId });
  } catch (error) {
    return failure(error, `${adapter.label} could not start this video.`);
  }
}
