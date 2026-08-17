import { describe, expect, it } from 'vitest';

import { deriveOutputFormat, type ClipDimensions } from '../../lib/timeline/derive-output';

const clip = (o: Partial<ClipDimensions> = {}): ClipDimensions => ({
  width: 1920, height: 1080, durationSeconds: 5, ...o,
});

describe('deriveOutputFormat', () => {
  it('falls back to 1920x1080 at 30fps for an empty timeline', () => {
    expect(deriveOutputFormat([])).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it('picks the aspect ratio most clips share', () => {
    const result = deriveOutputFormat([
      clip({ width: 1920, height: 1080 }),
      clip({ width: 1280, height: 720 }),
      clip({ width: 1080, height: 1920 }),
    ]);
    expect(result.width / result.height).toBeCloseTo(16 / 9);
  });

  it('breaks an aspect tie by total duration, not clip count', () => {
    const result = deriveOutputFormat([
      clip({ width: 1920, height: 1080, durationSeconds: 2 }),
      clip({ width: 1080, height: 1920, durationSeconds: 30 }),
    ]);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  it('takes the largest resolution at the winning aspect', () => {
    const result = deriveOutputFormat([
      clip({ width: 1280, height: 720 }),
      clip({ width: 3840, height: 2160 }),
    ]);
    expect(result).toMatchObject({ width: 3840, height: 2160 });
  });

  it('takes the most common framerate so an all-Veo timeline stays at 24', () => {
    const result = deriveOutputFormat([clip({ fps: 24 }), clip({ fps: 24 }), clip({ fps: 30 })]);
    expect(result.fps).toBe(24);
  });

  it('defaults to 30 when no clip reports a framerate', () => {
    expect(deriveOutputFormat([clip(), clip()]).fps).toBe(30);
  });

  it('ignores clips with no framerate rather than counting them as a vote', () => {
    const result = deriveOutputFormat([clip({ fps: 24 }), clip(), clip()]);
    expect(result.fps).toBe(24);
  });

  it('does not crash with a single clip with NaN duration', () => {
    const result = deriveOutputFormat([clip({ durationSeconds: NaN })]);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('does not crash with a single clip with negative duration', () => {
    const result = deriveOutputFormat([clip({ durationSeconds: -5 })]);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('picks real-duration clip aspect when mixed with NaN-duration clip, no crash', () => {
    const result = deriveOutputFormat([
      clip({ width: 1920, height: 1080, durationSeconds: 10 }),
      clip({ width: 1080, height: 1920, durationSeconds: NaN }),
    ]);
    expect(result.width / result.height).toBeCloseTo(16 / 9);
  });

  it('returns derived resolution for zero-duration clips (Task 5 cached-record case)', () => {
    // Task 5 resolves gallery records with durationSeconds: record.durationSeconds ?? 0,
    // so cached clips legitimately have duration 0. Dropping them from usable would make
    // deriveOutputFormat return 1920x1080 fallback for a timeline of real clips whose
    // resolutions we actually know — a visible wrong answer. This test guards against
    // a later "fix" that excludes zero-duration clips.
    const result = deriveOutputFormat([
      clip({ width: 1280, height: 720, durationSeconds: 0 }),
      clip({ width: 3840, height: 2160, durationSeconds: 0 }),
    ]);
    expect(result.width).toBe(3840);
    expect(result.height).toBe(2160);
  });

  it('rounds odd width down to even (H.264/yuv420p requires even dimensions)', () => {
    // Both render engines encode H.264 in yuv420p, which requires even width and height.
    // VP9/WebM permits odd dimensions, so this app accepts WebM clips with odd dimensions.
    // A 1919x1080 source must yield 1918 to stay within codec constraints.
    const result = deriveOutputFormat([clip({ width: 1919, height: 1080 })]);
    expect(result.width).toBe(1918);
    expect(result.height).toBe(1080);
  });

  it('rounds odd height down to even', () => {
    const result = deriveOutputFormat([clip({ width: 1920, height: 1081 })]);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('rounds both dimensions down when both are odd', () => {
    const result = deriveOutputFormat([clip({ width: 1919, height: 1081 })]);
    expect(result.width).toBe(1918);
    expect(result.height).toBe(1080);
  });

  it('leaves already-even dimensions unchanged', () => {
    const result = deriveOutputFormat([clip({ width: 1920, height: 1080 })]);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });
});
