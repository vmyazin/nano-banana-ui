import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs } from '../../lib/timeline/render/ffmpeg-args';

const base = {
  inputs: [
    { path: '/tmp/j/0.mp4', fit: 'contain' as const },
    { path: '/tmp/j/1.mp4', fit: 'cover' as const },
  ],
  output: { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: false },
  outputPath: '/tmp/j/out.mp4',
};

const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1];

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

  it('is silent when the timeline asks for silence', () => {
    expect(buildFfmpegArgs(base)).toContain('-an');
  });

  it('writes to the given output path last', () => {
    const args = buildFfmpegArgs(base);
    expect(args[args.length - 1]).toBe('/tmp/j/out.mp4');
  });
});

/**
 * `concat` refuses a timeline whose segments do not all carry the same
 * streams, so the interesting cases are all about what happens to a clip with
 * no sound sitting next to one that has some.
 */
describe('buildFfmpegArgs, keeping the clips own audio', () => {
  const withAudio = { ...base, output: { ...base.output, keepAudio: true } };

  const audible = (path: string, fit: 'contain' | 'cover' = 'contain') => ({
    path,
    fit,
    hasAudio: true,
    durationSeconds: 8,
  });

  it('concatenates an audio stream alongside the video and encodes it as AAC', () => {
    const args = buildFfmpegArgs({
      ...withAudio,
      inputs: [audible('/tmp/j/0.mp4'), audible('/tmp/j/1.mp4', 'cover')],
    });

    expect(graphOf(args)).toContain('concat=n=2:v=1:a=1[outv][outa]');
    expect(graphOf(args)).toContain('[0:a]');
    expect(graphOf(args)).toContain('[1:a]');
    expect(args).toContain('[outa]');
    expect(args).toContain('aac');
    expect(args).not.toContain('-an');
  });

  it('generates silence of the clips own length for an input with no audio', () => {
    const args = buildFfmpegArgs({
      ...withAudio,
      inputs: [
        audible('/tmp/j/0.mp4'),
        { path: '/tmp/j/1.mp4', fit: 'cover' as const, hasAudio: false, durationSeconds: 3.5 },
      ],
    });

    // The generated input is appended after the real ones, so it is index 2 —
    // and it is bounded, since anullsrc is otherwise infinite and would hang
    // the concat forever.
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(args[args.indexOf('-t') + 1]).toBe('3.500');
    expect(graphOf(args)).toContain('[2:a]');
    expect(graphOf(args)).toContain('[a1]');
    expect(graphOf(args)).toContain('concat=n=2:v=1:a=1');
  });

  it('stays silent when nothing on the timeline has any audio to keep', () => {
    const args = buildFfmpegArgs({
      ...withAudio,
      inputs: [
        { path: '/tmp/j/0.mp4', fit: 'contain' as const, hasAudio: false, durationSeconds: 4 },
        { path: '/tmp/j/1.mp4', fit: 'cover' as const, hasAudio: false, durationSeconds: 4 },
      ],
    });

    expect(args).toContain('-an');
    expect(graphOf(args)).toContain('a=0');
  });

  /**
   * The fallback that matters: without a length there is nothing to bound the
   * generated silence with, and an unbounded `anullsrc` in a concat never
   * finishes. A quieter file than asked for beats a render that hangs.
   */
  it('falls back to a silent render when a mute clips length is unknown', () => {
    const args = buildFfmpegArgs({
      ...withAudio,
      inputs: [audible('/tmp/j/0.mp4'), { path: '/tmp/j/1.mp4', fit: 'cover' as const, hasAudio: false }],
    });

    expect(args).toContain('-an');
    expect(args).not.toContain('-f');
  });
});
