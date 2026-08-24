/**
 * Dimensions from a video element, the same object-URL trick lib/video-frame.ts
 * uses: a blob: URL is same-origin, so nothing is tainted and no crossOrigin
 * attribute is needed. Framerate and decodability are not here — HTMLVideoElement
 * can report neither, so `probeWithDemuxer` below reaches for the demuxer instead.
 */
// Types only — `import type` is erased at compile time, so mediabunny stays out
// of this module's bundle. The runtime import is the dynamic one below.
import type { InputVideoTrack } from 'mediabunny';

const PROBE_TIMEOUT_MS = 15_000;

export interface ProbedDimensions {
  width: number;
  height: number;
  durationSeconds: number;
}

export function probeDimensions(blob: Blob): Promise<ProbedDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const settle = (finish: () => void) => () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
      finish();
    };
    const onLoaded = settle(() =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      })
    );
    const onError = settle(() => reject(new Error('Unable to read this video.')));

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    const timer = setTimeout(onError, PROBE_TIMEOUT_MS);
    video.src = objectUrl;
  });
}

/**
 * Rates a person would recognise. `deriveOutputFormat` groups clips by
 * `String(clip.fps)`, so two clips shot at the same rate must produce the same
 * number or they vote against each other instead of together.
 *
 * Ordering is load-bearing where two entries are within tolerance of each other
 * (23.976/24, 29.97/30, 59.94/60): the first match wins, so the NTSC rate is the
 * one both collapse onto. That is deliberate — a 23.976 clip and a 24 clip on one
 * timeline must land in the same bucket, and picking either consistently is what
 * makes them vote together instead of splitting the vote and losing to a third.
 *
 * Exported for its own test: this is the whole framerate feature's decision, and
 * it is pure, so it is the one part of the probe that can be tested without a
 * demuxer jsdom cannot run.
 */
export const COMMON_RATES = [8, 10, 12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120];

/** Within 2% of a common rate is that rate; anything else keeps two decimals. */
export function snapFramerate(raw: number): number {
  const nearest = COMMON_RATES.find((rate) => Math.abs(raw - rate) <= rate * 0.02);
  return nearest ?? Number(raw.toFixed(2));
}

/** What one pass over the demuxer can answer that a video element cannot. */
export interface DemuxProbe {
  /** Snapped framerate, or absent when it cannot be read. */
  fps?: number;
  /**
   * `false` only when `VideoDecoder.isConfigSupported` said no. Absent means
   * "could not answer" — no WebCodecs in this browser, no readable decoder
   * config, an unopenable container — never "yes by omission".
   */
  decodable?: boolean;
  /**
   * Whether the container holds an audio track at all. Absent means the probe
   * could not answer — never "no by omission". Both engines re-check the real
   * file at render time; this is what lets the UI say "with audio" or "silent"
   * before anything is encoded, and what tells the server engine which of its
   * inputs need silence padded in (ffmpeg's `concat` refuses a timeline that
   * mixes audio and no-audio segments).
   */
  hasAudio?: boolean;
}

/**
 * Everything the demuxer can tell us about a clip, in one open.
 *
 * Best-effort on purpose: a clip that cannot answer simply does not vote in
 * `deriveOutputFormat`'s framerate decision (which already falls back to 30 when
 * nobody votes) and is not claimed to be undecodable either — render-time
 * detection in `lib/timeline/render/webcodecs.ts` still catches that. This never
 * throws, never rejects, and never takes longer than `PROBE_TIMEOUT_MS`:
 * acquisition awaits it, and neither a cadence hint nor an early decode warning
 * is worth making someone wait on a container the demuxer is struggling with.
 *
 * The demuxer is loaded with a dynamic `import()` so mediabunny stays out of the
 * main bundle — it arrives with the timeline workspace or not at all.
 */
export function probeWithDemuxer(blob: Blob): Promise<DemuxProbe> {
  // The loser of this race keeps running to its own `finally`, so the Input is
  // disposed even when the timeout has already answered for it.
  return Promise.race([
    readWithDemuxer(blob),
    new Promise<DemuxProbe>((resolve) => setTimeout(() => resolve({}), PROBE_TIMEOUT_MS)),
  ]);
}

async function readWithDemuxer(blob: Blob): Promise<DemuxProbe> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });

    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return {};

      // Asked before the early return below can matter, and separately from the
      // video questions: a clip whose framerate and decodability are both
      // unreadable can still have perfectly good sound in it.
      const hasAudio = await input
        .getPrimaryAudioTrack()
        .then((audio) => audio !== null)
        .catch(() => undefined);

      // One demuxer open answers both questions. Decodability is asked here
      // rather than at render time because the codec string is already in hand
      // the moment the container is open — surfacing "your browser cannot
      // decode this clip" at add time, next to "expired", beats discovering it
      // minutes into an export.
      const [fps, decodable] = await Promise.all([readFramerate(track), readDecodable(track)]);
      const probe: DemuxProbe = {};
      if (fps !== undefined) probe.fps = fps;
      if (decodable !== undefined) probe.decodable = decodable;
      if (hasAudio !== undefined) probe.hasAudio = hasAudio;
      return probe;
    } finally {
      input.dispose();
    }
  } catch {
    return {};
  }
}

async function readFramerate(track: InputVideoTrack): Promise<number | undefined> {
  // computeFrameRateMetrics is purpose-built for this and handles the cases a
  // naive samples-over-duration division gets wrong: it excludes outliers and
  // survives dropped frames.
  //
  // Only `underlyingFrameRate` is used, and only when it is non-null. That is
  // the field mediabunny sets when it is confident it has found the video's
  // real rate; it is null precisely for variable-framerate sources. Every
  // sibling field — `bestGuessFrameRate`, `medianFrameRate`,
  // `averageFrameRate`, and `computePacketStats().averagePacketRate` — is
  // non-nullable and answers a VFR clip with a heuristic middle number. That
  // number would be cast as a real vote in `deriveOutputFormat` and could
  // decide the whole timeline's output rate. A clip with no fixed rate has no
  // opinion to offer, so it abstains.
  try {
    const metrics = await track.computeFrameRateMetrics();
    const rate = metrics.underlyingFrameRate;
    if (rate === null || !Number.isFinite(rate) || rate <= 0) return undefined;
    return snapFramerate(rate);
  } catch {
    return undefined;
  }
}

/**
 * Whether this browser can decode this clip's codec, asked of the browser
 * itself rather than guessed from the codec string. Answers `undefined` — not
 * `true` — for every way of not knowing, so a silent probe never reads as a
 * clean bill of health.
 */
async function readDecodable(track: InputVideoTrack): Promise<boolean | undefined> {
  if (typeof VideoDecoder === 'undefined') return undefined;
  try {
    const config = await track.getDecoderConfig();
    if (!config) return undefined;
    const support = await VideoDecoder.isConfigSupported(config);
    return support.supported === true;
  } catch {
    // isConfigSupported throws TypeError on a config it considers malformed
    // rather than answering `supported: false`, and that is a "cannot tell",
    // not a verdict — the render path is a better judge than a guess here.
    return undefined;
  }
}
