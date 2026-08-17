import type { TimelineOutput } from '@/store/useTimelineStore';

export interface FfmpegInput {
  path: string;
  fit: 'contain' | 'cover';
}

/**
 * Pure: builds the argv, runs nothing. That is what makes the filter graph
 * testable without a binary, and it is the only way this graph is verified
 * until a real render happens at the smoke-test gate.
 *
 * `-an` is deliberate. Audio is slice 4 for both engines at once — letting the
 * server keep sound while the browser drops it would make the two produce
 * different files from the same timeline.
 */
export function buildFfmpegArgs(args: {
  inputs: FfmpegInput[];
  output: TimelineOutput;
  outputPath: string;
}): string[] {
  const { inputs, output, outputPath } = args;
  const { width, height, fps } = output;

  const inputArgs = inputs.flatMap((input) => ['-i', input.path]);

  const chains = inputs.map((input, index) =>
    input.fit === 'contain'
      ? `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`
      : `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps}[v${index}]`
  );

  const concatInputs = inputs.map((_, index) => `[v${index}]`).join('');
  const graph = [...chains, `${concatInputs}concat=n=${inputs.length}:v=1:a=0[out]`].join(';');

  return [
    '-y',
    ...inputArgs,
    '-filter_complex', graph,
    '-map', '[out]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}
