import { NextRequest, NextResponse } from 'next/server';

import { getAdapter, isProviderId } from '@/lib/providers';
import {
  findModel,
  resolveDuration,
  resolveModel,
  resolveSize,
  resolveVideoInput,
} from '@/lib/providers/catalog';
import { ProviderError, type ProviderMode } from '@/lib/providers/types';

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

function isProviderMode(value: unknown): value is ProviderMode {
  return value === 'text' || value === 'image' || value === 'frames' || value === 'reference';
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
  const hasExplicitInputMode = body.inputMode !== undefined;
  const inputMode = hasExplicitInputMode
    ? body.inputMode
    : images.length === 0
      ? 'text'
      : 'image';
  if (!isProviderMode(inputMode)) {
    return NextResponse.json(
      { success: false, error: 'A supported video input mode is required' },
      { status: 400 }
    );
  }
  const modelRecord = findModel(body.provider, model);
  // Old clients did not send a semantic mode; preserve their route behavior.
  // New clients always send it and receive capability/count validation here.
  if (hasExplicitInputMode && !modelRecord?.modes.includes(inputMode)) {
    return NextResponse.json(
      { success: false, error: `Model ${model} does not support ${inputMode} video input` },
      { status: 400 }
    );
  }
  if (hasExplicitInputMode && inputMode === 'text' && images.length > 0) {
    return NextResponse.json(
      { success: false, error: 'Text video input cannot include images' },
      { status: 400 }
    );
  }
  const videoInput = resolveVideoInput(body.provider, model, inputMode);
  if (hasExplicitInputMode && inputMode !== 'text') {
    if (!videoInput) {
      return NextResponse.json(
        { success: false, error: 'This model has no supported video image input' },
        { status: 400 }
      );
    }
    const required = inputMode === 'frames' ? 2 : 1;
    if (images.length < required) {
      return NextResponse.json(
        {
          success: false,
          error:
            inputMode === 'frames'
              ? 'Exactly two frame images are required'
              : 'At least one image is required',
        },
        { status: 400 }
      );
    }
    if (images.length > videoInput.maxImages) {
      return NextResponse.json(
        { success: false, error: `This model accepts at most ${videoInput.maxImages} images` },
        { status: 400 }
      );
    }
  }

  // Whitelisted per model: Runware answers an unlisted width/height with
  // "Unsupported width/height combination for this model architecture".
  const size = resolveSize(
    body.provider,
    model,
    typeof body.size === 'string' ? body.size : undefined
  );

  try {
    const { taskId } = await adapter.createVideo({
      apiKey,
      model,
      prompt,
      images,
      inputMode,
      inputField: videoInput?.field,
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
