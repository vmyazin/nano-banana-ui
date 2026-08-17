import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/providers/video/route';
import { modelsFor, resolveDuration, resolveSize } from '@/lib/providers/catalog';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/providers/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CometAPI video catalog', () => {
  it('covers the families that share the /v1/videos route', () => {
    const ids = modelsFor('comet', 'video').map((model) => model.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'seedance-2-5',
        'veo3.1-fast',
        'sora-2',
        'wan2.7',
        'viduq3-turbo',
        'minimax-h3',
        'happyhorse-1.1',
        'flux-3',
      ])
    );
  });

  it('describes every size as a preset, which is what this route takes', () => {
    for (const model of modelsFor('comet', 'video')) {
      for (const size of model.sizes ?? []) {
        expect(size.preset).toMatch(/^\d+x\d+$/);
        expect(size.width).toBeUndefined();
      }
    }
  });

  it('keeps each model inside its own documented lengths', () => {
    // Veo 3.1 takes 4, 6 or 8 — never the 5 that most other models default to.
    expect(resolveDuration('comet', 'veo3.1-fast', 5)).toBe(4);
    // Sora 2 goes to 20 seconds; nothing else here does.
    expect(resolveDuration('comet', 'sora-2', 20)).toBe(20);
  });

  it('sends the vendor’s exact WxH string for the chosen size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'vid-9' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await post({
      provider: 'comet',
      apiKey: 'cm',
      prompt: 'a vertical city timelapse',
      model: 'minimax-h3',
      size: '768P · 9:16',
      durationSeconds: 8,
    });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('size')).toBe('768x1344');
    expect(form.get('seconds')).toBe('8');
    expect(resolveSize('comet', 'minimax-h3', '768P · 9:16')?.preset).toBe('768x1344');
  });
});
