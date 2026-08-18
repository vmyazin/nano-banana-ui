import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs } from '@/lib/timeline/render/ffmpeg-args';
import { MIN_TRIMMED_SECONDS, isTrimmed, resolveTrim, trimmedDuration } from '@/lib/timeline/trim';

const clip = (trimStart?: number, trimEnd?: number) => ({ trimStart, trimEnd });

describe('resolving in and out points', () => {
  it('reads absent points as the whole clip', () => {
    expect(resolveTrim(clip(), 8)).toEqual({ start: 0, end: 8 });
    expect(isTrimmed(clip(), 8)).toBe(false);
    expect(trimmedDuration(clip(), 8)).toBe(8);
  });

  it('clamps points to the source that actually arrived', () => {
    // A repaired clip is a *different* file: the points stored against the old
    // one can sit past the end of the new one.
    expect(resolveTrim(clip(2, 30), 8)).toEqual({ start: 2, end: 8 });
    expect(resolveTrim(clip(20, 30), 8).end).toBe(8);
  });

  it('ignores a collapsed or inverted range rather than producing a zero-length clip', () => {
    expect(resolveTrim(clip(5, 5), 8)).toEqual({ start: 5, end: 8 });
    expect(resolveTrim(clip(6, 2), 8).end).toBe(8);
    expect(trimmedDuration(clip(5, 5 + MIN_TRIMMED_SECONDS / 2), 8)).toBeGreaterThan(0);
  });

  it('ignores nonsense instead of trusting it', () => {
    expect(resolveTrim(clip(Number.NaN, undefined), 8)).toEqual({ start: 0, end: 8 });
    expect(resolveTrim(clip(-3, undefined), 8).start).toBe(0);
  });

  it('reports a trimmed clip as trimmed at either end', () => {
    expect(isTrimmed(clip(1, undefined), 8)).toBe(true);
    expect(isTrimmed(clip(undefined, 6), 8)).toBe(true);
    expect(trimmedDuration(clip(1, 6), 8)).toBeCloseTo(5);
  });
});

describe('the server engine cuts where the browser does', () => {
  const output = { width: 1920, height: 1080, fps: 30, auto: true };

  it('seeks the input rather than decoding and discarding', () => {
    const args = buildFfmpegArgs({
      inputs: [{ path: 'a.mp4', fit: 'contain', trimStart: 1.5, trimEnd: 6 }],
      output,
      outputPath: 'out.mp4',
    });

    // Before -i, so ffmpeg seeks: after it, this decodes the whole file first.
    expect(args.slice(args.indexOf('-y') + 1, args.indexOf('-filter_complex'))).toEqual([
      '-ss', '1.500', '-to', '6.000', '-i', 'a.mp4',
    ]);
  });

  it('leaves an untrimmed input exactly as it was', () => {
    const args = buildFfmpegArgs({
      inputs: [{ path: 'a.mp4', fit: 'cover' }],
      output,
      outputPath: 'out.mp4',
    });

    expect(args).not.toContain('-ss');
    expect(args).not.toContain('-to');
  });

  it('keeps each input\'s points with its own input', () => {
    const args = buildFfmpegArgs({
      inputs: [
        { path: 'a.mp4', fit: 'contain', trimStart: 2 },
        { path: 'b.mp4', fit: 'contain', trimEnd: 3 },
      ],
      output,
      outputPath: 'out.mp4',
    });

    const joined = args.join(' ');
    expect(joined).toContain('-ss 2.000 -i a.mp4');
    expect(joined).toContain('-to 3.000 -i b.mp4');
  });
});
