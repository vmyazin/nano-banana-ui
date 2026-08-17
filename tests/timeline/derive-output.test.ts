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
});
