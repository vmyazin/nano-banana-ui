import { describe, expect, it } from 'vitest';

import { findModel, PROVIDER_MODELS } from '@/lib/providers/catalog';

import { resolveCatalogRate } from '@/lib/spend/resolve';

describe('provider catalog rates', () => {
  it('gives Atlas models flat or resolution-specific published rates', () => {
    const atlas = Object.fromEntries(PROVIDER_MODELS.atlas.map((model) => [model.id, model.rate]));
    expect(atlas).toEqual({
      'black-forest-labs/flux-schnell': { usd: 0.003, per: 'image' },
      'z-image/turbo': { usd: 0.005, per: 'image' },
      'qwen-image-3.0/text-to-image': { usd: 0.04, per: 'image' },
      'qwen-image-3.0/edit': { usd: 0.04, per: 'image' },
      'ltx-2.3-quality/text-to-video': { usd: 0.002, per: 'second' },
      'bytedance/seedance-v1-pro-fast/image-to-video': { usd: 0.009, per: 'second' },
      'bytedance/seedream-v5.0-pro/text-to-image': { usd: 0.036, per: 'image' },
      'bytedance/seedream-v5.0-pro/edit': { usd: 0.036, per: 'image', extraInputImageUsd: 0.003 },
      'bytedance/seedance-2.0-mini/text-to-video': { usdByResolution: { '480p': 0.0113, '720p': 0.0242, '1080p-SR': 0.0435 }, per: 'second' },
      'bytedance/seedance-2.0-mini/image-to-video': { usdByResolution: { '480p': 0.0113, '720p': 0.0242, '1080p-SR': 0.0435 }, per: 'second' },
      'bytedance/seedance-2.0-mini/reference-to-video': { usdByResolution: { '480p': 0.0113, '720p': 0.0242, '1080p-SR': 0.0435 }, per: 'second' },
      'bytedance/seedance-2.0-fast/text-to-video': { usdByResolution: { '480p': 0.027, '720p': 0.0581 }, per: 'second' },
      'bytedance/seedance-2.0-fast/image-to-video': { usdByResolution: { '480p': 0.027, '720p': 0.0581 }, per: 'second' },
      'bytedance/seedance-2.0-fast/reference-to-video': { usdByResolution: { '480p': 0.027, '720p': 0.0581 }, per: 'second' },
    });
  });

  it('leaves metered Comet models without a rate', () => {
    expect(PROVIDER_MODELS.comet.every((model) => model.rate === undefined)).toBe(true);
  });

  it('shows a published price for each structured rate', () => {
    for (const models of Object.values(PROVIDER_MODELS)) {
      for (const model of models) {
        if (model.rate) expect(model.price).toMatch(/^\$\d/);
      }
    }
  });
});


describe('Atlas billing settings', () => {
  it.each([
    ['mini', '480p', 0.0565],
    ['mini', '720p', 0.121],
    ['mini', '1080p (upscaled)', 0.2175],
    ['fast', '480p', 0.135],
    ['fast', '720p', 0.2905],
  ])('prices a 5-second %s clip at %s across all input modes', (tier, size, expected) => {
    for (const mode of ['text-to-video', 'image-to-video', 'reference-to-video']) {
      const model = findModel('atlas', `bytedance/seedance-2.0-${tier}/${mode}`);
      const figure = resolveCatalogRate(model, 5, 1, { size });
      expect(figure.costUsd).toBeCloseTo(Number(expected), 6);
      expect(figure.confidence).toBe('estimated');
    }
  });

  it.each([
    ['mini', undefined], ['mini', '1440p (upscaled)'], ['mini', '4K'],
    ['fast', '1080p (upscaled)'], ['fast', '1440p (upscaled)'],
  ])('does not substitute the cheapest %s price for size %s', (tier, size) => {
    expect(resolveCatalogRate(findModel('atlas', `bytedance/seedance-2.0-${tier}/text-to-video`), 5, 1, { size }))
      .toMatchObject({ costUsd: null, confidence: 'unknown' });
  });

  it.each([undefined, 0, -1, NaN, Infinity])('requires a finite positive duration (%s)', duration => {
    expect(resolveCatalogRate(findModel('atlas', 'bytedance/seedance-2.0-mini/text-to-video'), duration, 1, { size: '720p' }))
      .toMatchObject({ costUsd: null, confidence: 'unknown' });
  });

  it.each([[1, 0.036], [3, 0.042], [10, 0.063]])('includes the first of %s Seedream references', (inputImages, expected) => {
    expect(resolveCatalogRate(findModel('atlas', 'bytedance/seedream-v5.0-pro/edit'), undefined, 1, { inputImages }).costUsd)
      .toBeCloseTo(expected, 6);
  });

  it('does not multiply reference input charges by the number of outputs', () => {
    expect(resolveCatalogRate(findModel('atlas', 'bytedance/seedream-v5.0-pro/edit'), undefined, 2, { inputImages: 3 }).costUsd)
      .toBeCloseTo(0.078, 6);
  });

  it('does not silently omit an unknown reference surcharge', () => {
    expect(resolveCatalogRate(findModel('atlas', 'bytedance/seedream-v5.0-pro/edit')))
      .toMatchObject({ costUsd: null, confidence: 'unknown' });
  });
});
