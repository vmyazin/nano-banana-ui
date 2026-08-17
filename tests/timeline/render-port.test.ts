import { describe, expect, it } from 'vitest';

import {
  fitRect,
  selectRenderEngine,
  type RenderEngine,
  type RenderRequest,
} from '../../lib/timeline/render/port';

const request = { output: { width: 1920, height: 1080, fps: 30, auto: true }, clips: [] };

function engine(id: 'webcodecs' | 'server', reason: string | null): RenderEngine {
  return {
    id,
    unavailableReason: async () => reason,
    render: async () => new Blob(),
  };
}

describe('fitRect', () => {
  it('fills the frame exactly when the aspects match', () => {
    expect(fitRect({ width: 1280, height: 720 }, { width: 1920, height: 1080 }, 'contain'))
      .toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('letterboxes a vertical clip into a landscape frame, centred', () => {
    const r = fitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 'contain');
    expect(r).toEqual({ x: 656, y: 0, width: 608, height: 1080 });
  });

  it('overflows both axes when covering, so no bars are visible', () => {
    const r = fitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 'cover');
    expect(r.width).toBeGreaterThanOrEqual(1920);
    expect(r.height).toBeGreaterThanOrEqual(1080);
    expect(r.x).toBe(0);
  });
});

describe('selectRenderEngine', () => {
  it('prefers the browser engine when it can run', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', null), engine('server', null)], request as RenderRequest);
    expect(result.chosen?.id).toBe('webcodecs');
    expect(result.rejected).toEqual([]);
  });

  it('falls through to the server and keeps the browser reason for the UI', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', 'Safari cannot encode H.264 here'), engine('server', null)],
      request as RenderRequest);
    expect(result.chosen?.id).toBe('server');
    expect(result.rejected).toEqual([
      { id: 'webcodecs', reason: 'Safari cannot encode H.264 here' },
    ]);
  });

  it('chooses nothing and reports every reason when neither can run', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', 'no WebCodecs'), engine('server', 'not configured')],
      request as RenderRequest);
    expect(result.chosen).toBeNull();
    expect(result.rejected).toHaveLength(2);
  });
});
