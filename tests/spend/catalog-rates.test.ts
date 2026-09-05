import { describe, expect, it } from 'vitest';

import { PROVIDER_MODELS } from '@/lib/providers/catalog';

describe('provider catalog rates', () => {
  it('gives every Atlas model with a flat published price a structured rate', () => {
    const atlas = Object.fromEntries(PROVIDER_MODELS.atlas.map((model) => [model.id, model.rate]));
    expect(atlas).toEqual({
      'black-forest-labs/flux-schnell': { usd: 0.003, per: 'image' },
      'z-image/turbo': { usd: 0.005, per: 'image' },
      'qwen-image-3.0/text-to-image': { usd: 0.04, per: 'image' },
      'qwen-image-3.0/edit': { usd: 0.04, per: 'image' },
      'ltx-2.3-quality/text-to-video': { usd: 0.002, per: 'second' },
      'bytedance/seedance-v1-pro-fast/image-to-video': { usd: 0.009, per: 'second' },
      'bytedance/seedream-v5.0-pro/text-to-image': { usd: 0.036, per: 'image' },
      'bytedance/seedream-v5.0-pro/edit': { usd: 0.036, per: 'image' },
      'bytedance/seedance-2.0-mini/text-to-video': { usd: 0.011, per: 'second' },
      'bytedance/seedance-2.0-mini/image-to-video': { usd: 0.011, per: 'second' },
      'bytedance/seedance-2.0-mini/reference-to-video': { usd: 0.011, per: 'second' },
      'bytedance/seedance-2.0-fast/text-to-video': { usd: 0.027, per: 'second' },
      'bytedance/seedance-2.0-fast/image-to-video': { usd: 0.027, per: 'second' },
      'bytedance/seedance-2.0-fast/reference-to-video': { usd: 0.027, per: 'second' },
    });
  });

  it('leaves metered Comet models without a rate', () => {
    expect(PROVIDER_MODELS.comet.every((model) => model.rate === undefined)).toBe(true);
  });

  it('never gives a rate to a model whose price string is not a flat figure', () => {
    for (const models of Object.values(PROVIDER_MODELS)) {
      for (const model of models) {
        if (model.rate) expect(model.price).toMatch(/^\$\d/);
      }
    }
  });
});
