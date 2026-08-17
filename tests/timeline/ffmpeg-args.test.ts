import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs } from '../../lib/timeline/render/ffmpeg-args';

const base = {
  inputs: [
    { path: '/tmp/j/0.mp4', fit: 'contain' as const },
    { path: '/tmp/j/1.mp4', fit: 'cover' as const },
  ],
  output: { width: 1920, height: 1080, fps: 30, auto: true },
  outputPath: '/tmp/j/out.mp4',
};

describe('buildFfmpegArgs', () => {
  it('passes every input in timeline order', () => {
    const args = buildFfmpegArgs(base);
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    expect(args.indexOf('/tmp/j/0.mp4')).toBeLessThan(args.indexOf('/tmp/j/1.mp4'));
  });

  it('letterboxes a contain input with scale then pad', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('force_original_aspect_ratio=decrease');
    expect(graph).toContain('pad=1920:1080');
  });

  it('crops a cover input instead of padding it', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('force_original_aspect_ratio=increase');
    expect(graph).toContain('crop=1920:1080');
  });

  it('normalises every input to the output framerate before concatenating', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('fps=30');
    expect(graph).toContain('concat=n=2:v=1:a=0');
  });

  it('is silent by design — audio is slice 4', () => {
    expect(buildFfmpegArgs(base)).toContain('-an');
  });

  it('writes to the given output path last', () => {
    const args = buildFfmpegArgs(base);
    expect(args[args.length - 1]).toBe('/tmp/j/out.mp4');
  });
});
