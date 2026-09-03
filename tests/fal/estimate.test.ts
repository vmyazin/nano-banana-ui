// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { estimateFalCost } from '@/lib/fal/server';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('estimateFalCost', () => {
  it('reads the unit, counts the quantity, and asks fal for the total', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ prices: [{ endpoint_id: 'fal-ai/veo3.1', unit_price: 0.05, unit: 'second', currency: 'USD' }] }))
      .mockResolvedValueOnce(jsonResponse({ estimate_type: 'unit_price', total_cost: 0.4, currency: 'USD' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      estimateFalCost({ apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1', durationSeconds: 8 })
    ).resolves.toEqual({ costUsd: 0.4, unit: 'second', quantity: 8 });

    const [pricingUrl, pricingInit] = fetchMock.mock.calls[0];
    expect(String(pricingUrl)).toBe('https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fveo3.1');
    expect(pricingInit.headers.Authorization).toBe('Key fal-key');
    const [, estimateInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(estimateInit.body)).toEqual({
      estimate_type: 'unit_price',
      endpoints: { 'fal-ai/veo3.1': { unit_quantity: 8 } },
    });
  });

  it('falls back to unit price times quantity when the estimate call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ prices: [{ unit_price: 0.039, unit: 'image' }] }))
        .mockResolvedValueOnce(jsonResponse({}, false))
    );
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/nano-banana-2' })).resolves.toEqual({
      costUsd: 0.039,
      unit: 'image',
      quantity: 1,
    });
  });

  it('is unknown when the unit needs a duration it was not given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ prices: [{ unit_price: 0.05, unit: 'second' }] })));
    // A different endpoint from the first test: unit prices are cached per endpoint for the process.
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/kling-video/v3' })).resolves.toEqual({ costUsd: null, unit: 'second' });
  });

  it('is unknown when fal cannot be reached, and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/x' })).resolves.toEqual({ costUsd: null });
  });
});
