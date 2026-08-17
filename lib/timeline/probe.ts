/**
 * Dimensions from a video element, the same object-URL trick lib/video-frame.ts
 * uses: a blob: URL is same-origin, so nothing is tainted and no crossOrigin
 * attribute is needed. Framerate is not here — HTMLVideoElement cannot report it,
 * so `probeFramerate` below reaches for the demuxer instead.
 */
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
 */
const COMMON_RATES = [8, 10, 12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120];

/** Within 2% of a common rate is that rate; anything else keeps two decimals. */
function snapFramerate(raw: number): number {
  const nearest = COMMON_RATES.find((rate) => Math.abs(raw - rate) <= rate * 0.02);
  return nearest ?? Number(raw.toFixed(2));
}

/**
 * The clip's framerate, or `undefined` when it cannot be read.
 *
 * Best-effort on purpose: a clip that cannot answer simply does not vote in
 * `deriveOutputFormat`'s framerate decision, which already falls back to 30 when
 * nobody votes. This never throws, never rejects, and never takes longer than
 * `PROBE_TIMEOUT_MS` — acquisition awaits it, and a cadence hint is not worth
 * making someone wait on a container the demuxer is struggling with.
 *
 * The demuxer is loaded with a dynamic `import()` so mediabunny stays out of the
 * main bundle — it arrives with the timeline workspace or not at all.
 */
export function probeFramerate(blob: Blob): Promise<number | undefined> {
  // The loser of this race keeps running to its own `finally`, so the Input is
  // disposed even when the timeout has already answered for it.
  return Promise.race([
    readFramerate(blob),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), PROBE_TIMEOUT_MS)),
  ]);
}

async function readFramerate(blob: Blob): Promise<number | undefined> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });

    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return undefined;

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
      const metrics = await track.computeFrameRateMetrics();
      const rate = metrics.underlyingFrameRate;
      if (rate === null || !Number.isFinite(rate) || rate <= 0) return undefined;
      return snapFramerate(rate);
    } finally {
      input.dispose();
    }
  } catch {
    return undefined;
  }
}
