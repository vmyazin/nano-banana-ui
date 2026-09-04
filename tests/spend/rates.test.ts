import { describe, expect, it } from 'vitest';

import { FAL_IMAGE_MODEL, FAL_VIDEO_MODELS } from '@/lib/fal/catalog';
import {
  FAL_RATES,
  falPublishedCost,
  geminiResolutionCost,
  geminiTokenCost,
  KIE_USD_PER_CREDIT,
} from '@/lib/spend/rates';

describe('Gemini image rates', () => {
  it('prices output tokens at the published rate', () => {
    expect(geminiTokenCost(0, 1120)).toBeCloseTo(0.1344, 6);
    expect(geminiTokenCost(0, 2000)).toBeCloseTo(0.24, 6);
  });

  it('adds input tokens at the input rate', () => {
    expect(geminiTokenCost(560, 0)).toBeCloseTo(0.00112, 6);
  });

  it('estimates a resolution the same way the studio always has', () => {
    expect(geminiResolutionCost('1K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('2K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('4K', 2)).toBeCloseTo(0.24 + 2 * 0.00112, 6);
    expect(geminiResolutionCost(undefined, 0)).toBeCloseTo(0.1344, 6);
  });

  it('never returns a negative or non-finite figure', () => {
    expect(geminiTokenCost(Number.NaN, -5)).toBe(0);
  });

  it('publishes the Kie credit rate', () => {
    expect(KIE_USD_PER_CREDIT).toBe(0.005);
  });
});

describe('fal published rates', () => {
  it('covers every endpoint the fal catalog can submit to', () => {
    const endpoints = [FAL_IMAGE_MODEL, ...FAL_VIDEO_MODELS].flatMap((model) =>
      model.variants.map((variant) => variant.endpointId)
    );
    expect(endpoints.filter((endpointId) => !FAL_RATES[endpointId])).toEqual([]);
  });

  it('prices a Nano Banana 2 image by resolution and web search', () => {
    expect(falPublishedCost('fal-ai/nano-banana-2', { resolution: '1K' })).toEqual({
      costUsd: 0.08,
      unit: 'image',
      quantity: 1,
    });
    expect(falPublishedCost('fal-ai/nano-banana-2/edit', { resolution: '4K' })?.costUsd).toBeCloseTo(0.16, 6);
    expect(
      falPublishedCost('fal-ai/nano-banana-2', { resolution: '2K', webSearch: true })?.costUsd
    ).toBeCloseTo(0.135, 6);
  });

  it('prices Veo per second, with audio and 4K charged more', () => {
    expect(
      falPublishedCost('fal-ai/veo3.1/fast', { resolution: '1080p', audio: true, durationSeconds: 8 })
    ).toEqual({ costUsd: expect.closeTo(1.2, 6), unit: 'second', quantity: 8 });
    expect(
      falPublishedCost('fal-ai/veo3.1/fast', { resolution: '1080p', audio: false, durationSeconds: 8 })?.costUsd
    ).toBeCloseTo(0.8, 6);
    expect(
      falPublishedCost('fal-ai/veo3.1', { resolution: '4k', audio: true, durationSeconds: 4 })?.costUsd
    ).toBeCloseTo(2.4, 6);
  });

  it('prices a Kling run, which has no resolution control', () => {
    expect(
      falPublishedCost('fal-ai/kling-video/v3/pro/text-to-video', { audio: true, durationSeconds: 5 })?.costUsd
    ).toBeCloseTo(0.84, 6);
  });

  it('prices Hailuo per run, by duration where it has one', () => {
    expect(
      falPublishedCost('fal-ai/minimax/hailuo-2.3/standard/text-to-video', { durationSeconds: 10 })
    ).toEqual({ costUsd: 0.56, unit: 'video', quantity: 1 });
    expect(falPublishedCost('fal-ai/minimax/hailuo-2.3/pro/image-to-video', {})).toEqual({
      costUsd: 0.49,
      unit: 'video',
      quantity: 1,
    });
  });

  it('answers null for a run fal never published a price for', () => {
    // Seedance bills 480p per output token, which needs a frame size we lack.
    expect(
      falPublishedCost('bytedance/seedance-2.0/text-to-video', { resolution: '480p', durationSeconds: 5 })
    ).toBeNull();
    // A per-second endpoint whose duration control read "auto".
    expect(falPublishedCost('fal-ai/wan/v2.7/text-to-video', { resolution: '720p' })).toBeNull();
    expect(falPublishedCost('fal-ai/some-new-model', { durationSeconds: 5 })).toBeNull();
  });
});
