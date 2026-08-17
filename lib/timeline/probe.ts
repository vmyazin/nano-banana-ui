/**
 * Dimensions from a video element, the same object-URL trick lib/video-frame.ts
 * uses: a blob: URL is same-origin, so nothing is tainted and no crossOrigin
 * attribute is needed. Framerate is not here — HTMLVideoElement cannot report it,
 * and the demuxer that can arrives with the browser engine.
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
