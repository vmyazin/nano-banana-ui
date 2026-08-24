import type { TimelineOutput } from '@/store/useTimelineStore';

export interface FfmpegInput {
  path: string;
  fit: 'contain' | 'cover';
  /** In/out points in source seconds; absent means the whole file. */
  trimStart?: number;
  trimEnd?: number;
  /** Whether this file has an audio track. Absent reads as "no". */
  hasAudio?: boolean;
  /** Trimmed length in seconds — how much silence a mute input needs. */
  durationSeconds?: number;
}

/** What both engines normalise audio to before muxing. */
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = '192k';

/**
 * Pure: builds the argv, runs nothing. That is what makes the filter graph
 * testable without a binary, and it is the only way this graph is verified
 * until a real render happens at the smoke-test gate.
 *
 * Audio follows `output.keepAudio`, and must keep answering it the same way
 * the browser engine does (`lib/timeline/render/webcodecs.ts`) — one timeline
 * producing a file with sound from one engine and without it from the other is
 * a divergence discovered by ear rather than by a test.
 */
export function buildFfmpegArgs(args: {
  inputs: FfmpegInput[];
  output: TimelineOutput;
  outputPath: string;
}): string[] {
  const { inputs, output, outputPath } = args;
  const { width, height, fps } = output;

  /**
   * `-ss`/`-to` before `-i` so ffmpeg seeks the input rather than decoding the
   * whole file and discarding frames — and the timestamps each input hands the
   * concat filter then start at zero, which is what concat requires.
   */
  const inputArgs = inputs.flatMap((input) => [
    ...(typeof input.trimStart === 'number' && input.trimStart > 0
      ? ['-ss', input.trimStart.toFixed(3)]
      : []),
    ...(typeof input.trimEnd === 'number' && input.trimEnd > 0 ? ['-to', input.trimEnd.toFixed(3)] : []),
    '-i',
    input.path,
  ]);

  const chains = inputs.map((input, index) =>
    input.fit === 'contain'
      ? `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`
      : `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps}[v${index}]`
  );

  const audio = planAudio(inputs, output.keepAudio);

  const concatInputs = inputs
    .map((_, index) => (audio ? `[v${index}][a${index}]` : `[v${index}]`))
    .join('');
  const graph = [
    ...chains,
    ...(audio?.chains ?? []),
    `${concatInputs}concat=n=${inputs.length}:v=1:a=${audio ? 1 : 0}` +
      (audio ? '[outv][outa]' : '[outv]'),
  ].join(';');

  return [
    '-y',
    ...inputArgs,
    ...(audio?.inputArgs ?? []),
    '-filter_complex', graph,
    '-map', '[outv]',
    ...(audio
      ? ['-map', '[outa]', '-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', String(AUDIO_SAMPLE_RATE), '-ac', String(AUDIO_CHANNELS)]
      : ['-an']),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}

interface AudioPlan {
  /** Extra `-f lavfi` silence inputs, appended after the real ones. */
  inputArgs: string[];
  /** One `[aN]` chain per timeline input, in timeline order. */
  chains: string[];
}

/**
 * The audio half of the graph, or `null` for a silent render.
 *
 * `concat` requires every segment to carry the same streams, so a timeline
 * where only some clips have sound needs silence *generated* for the rest —
 * `anullsrc` is infinite, so each one is bounded by `-t` at exactly the length
 * of the clip it stands in for. That length comes from the client, which
 * probed the file; a mute clip whose length is unknown has nothing to bound
 * its silence with and would hang the concat forever, so the whole render
 * falls back to silent rather than producing a graph that never finishes.
 */
function planAudio(inputs: FfmpegInput[], keepAudio: boolean): AudioPlan | null {
  if (!keepAudio) return null;
  // Nothing to keep. A silent track added to every clip's worth of silence is
  // a bigger file saying the same thing.
  if (!inputs.some((input) => input.hasAudio)) return null;

  const inputArgs: string[] = [];
  const chains: string[] = [];
  let silenceIndex = inputs.length;

  for (const [index, input] of inputs.entries()) {
    if (input.hasAudio) {
      // `aresample` first so a stream whose samples start late is padded
      // rather than shifting everything after it; `asetpts` then rebases the
      // segment onto zero, which is what concat expects from each input.
      chains.push(
        `[${index}:a]aresample=${AUDIO_SAMPLE_RATE}:async=1:first_pts=0,` +
          `aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`
      );
      continue;
    }

    const seconds = input.durationSeconds;
    if (!(typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0)) return null;

    inputArgs.push(
      '-f', 'lavfi',
      '-t', seconds.toFixed(3),
      '-i', `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`
    );
    chains.push(`[${silenceIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`);
    silenceIndex += 1;
  }

  return { inputArgs, chains };
}
