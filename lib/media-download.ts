import { slugify } from '@/lib/example-prompts';

export type DownloadMediaType = 'image' | 'video';

export const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_REMOTE_VIDEO_BYTES = 512 * 1024 * 1024;

export const SUPPORTED_RASTER_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const VIDEO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

/**
 * Content types that describe nothing. Object stores hand these back for any
 * blob, so a result served as `application/octet-stream` is not evidence of
 * anything — the bytes get sniffed instead of being rejected outright.
 */
const OPAQUE_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Server-side image fetch, used when the CDN will not answer the browser. */
const IMAGE_PROXY_ENDPOINT = '/api/fetch-image';
const VIDEO_DOWNLOAD_ENDPOINT = '/api/download-video';

export class RemoteMediaTooLarge extends Error {
  constructor() {
    super('Remote media exceeded the download size limit');
    this.name = 'RemoteMediaTooLarge';
  }
}

export function normalizedMimeType(mimeType?: string | null) {
  return mimeType?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

export function extensionForMimeType(mimeType?: string) {
  const normalized = normalizedMimeType(mimeType);
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/avif') return 'avif';
  return 'png';
}

/** Extension for either media kind; videos fall back to mp4, images to png. */
export function extensionForMedia(mediaType: DownloadMediaType, mimeType?: string | null) {
  if (mediaType === 'image') return extensionForMimeType(mimeType ?? undefined);
  return VIDEO_EXTENSIONS[normalizedMimeType(mimeType)] ?? 'mp4';
}

/**
 * The media type the leading bytes actually say this is.
 *
 * A provider that serves its results as `application/octet-stream` used to end
 * up going through the browser's own navigation — which opens the file in a tab
 * instead of saving it — so the magic number decides rather than the header's
 * claim. Unknown bytes return undefined: they are not something to hand back
 * under an image or video name.
 */
export function sniffMediaMime(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (ascii(4, 'ftyp')) {
    if (ascii(8, 'avif') || ascii(8, 'avis')) return 'image/avif';
    if (ascii(8, 'qt  ')) return 'video/quicktime';
    return 'video/mp4';
  }
  return undefined;
}

/** Reject anything that is not a credential-free https URL before we fetch it. */
export function isDownloadableMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function boundedMediaBlob(
  response: Response,
  mimeType: string,
  signal: AbortSignal,
  maxBytes: number
) {
  const declaredLength = response.headers.get('Content-Length')?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const size = Number(declaredLength);
    if (!Number.isSafeInteger(size) || size > maxBytes) {
      throw new RemoteMediaTooLarge();
    }
  }

  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new RemoteMediaTooLarge();
    // Re-typed from its bytes rather than by nesting the blob: a Blob from
    // another realm is not always recognized as a blob part, and gets
    // stringified into the copy instead of copied.
    return new Blob([await blob.arrayBuffer()], { type: mimeType });
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let totalBytes = 0;
  let readerCancelled = false;
  const cancelReader = async () => {
    if (readerCancelled) return;
    readerCancelled = true;
    try {
      await reader.cancel();
    } catch {
      // The stream may already be errored or closed.
    }
  };

  try {
    while (true) {
      if (signal.aborted) {
        await cancelReader();
        throw new DOMException('Download aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (signal.aborted) {
        await cancelReader();
        throw new DOMException('Download aborted', 'AbortError');
      }
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await cancelReader();
        throw new RemoteMediaTooLarge();
      }
      const ownedChunk = new Uint8Array(value.byteLength);
      ownedChunk.set(value);
      chunks.push(ownedChunk.buffer);
    }
  } catch (caught) {
    await cancelReader();
    throw caught;
  } finally {
    reader.releaseLock();
  }

  return new Blob(chunks, { type: mimeType });
}

/** Deterministic name used when the model slug is unavailable. */
export function fallbackFilenameBase(prompt: string, mediaType: DownloadMediaType) {
  return slugify(prompt) || `generated-${mediaType}`;
}

/**
 * Read a response as media of the expected kind, or refuse it.
 *
 * The declared type is trusted only when it says something: a store that labels
 * every object `application/octet-stream` gets its bytes sniffed instead. What
 * comes back is what the file is actually named and typed after, so a genuine
 * JPEG served as a generic binary still saves as `.jpg`.
 */
async function verifiedMediaBlob(
  response: Response,
  mediaType: DownloadMediaType,
  hintedMime: string | undefined,
  signal: AbortSignal
): Promise<Blob> {
  const declared = normalizedMimeType(response.headers.get('Content-Type'));
  const claimed = OPAQUE_MIMES.has(declared) ? normalizedMimeType(hintedMime) : declared;
  const opaque = OPAQUE_MIMES.has(claimed);

  // A concrete claim of the wrong kind is a refusal, not something to sniff past.
  if (!opaque && mediaType === 'image' && !SUPPORTED_RASTER_MIMES.has(claimed)) {
    throw new Error('Unsupported image media type');
  }
  if (!opaque && mediaType === 'video' && !claimed.startsWith('video/')) {
    throw new Error('Unsupported video media type');
  }

  const blob = await boundedMediaBlob(
    response,
    claimed,
    signal,
    mediaType === 'image' ? MAX_REMOTE_IMAGE_BYTES : MAX_REMOTE_VIDEO_BYTES
  );
  if (!opaque) return blob;

  const sniffed = sniffMediaMime(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  if (!sniffed || !sniffed.startsWith(mediaType === 'image' ? 'image/' : 'video/')) {
    throw new Error(`Unsupported ${mediaType} media type`);
  }
  return new Blob([blob], { type: sniffed });
}

/**
 * Download a provider-hosted result under `${base}.${ext}`.
 *
 * Cross-origin CDNs make the anchor `download` attribute a no-op, so the bytes
 * are pulled into a blob first. When the CDN will not answer the browser at all,
 * images retry through the capped image proxy. Videos are handed to a streaming
 * same-origin attachment route by POST: that preserves the semantic filename,
 * keeps signed URLs out of query strings, and never replaces the app tab.
 */
export async function downloadRemoteMedia(args: {
  url: string;
  mediaType: DownloadMediaType;
  filenameBase: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { url, mediaType, filenameBase, mimeType, signal } = args;
  const abortSignal = signal ?? new AbortController().signal;
  let objectUrl: string | null = null;

  const save = (blob: Blob) => {
    objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, `${filenameBase}.${extensionForMedia(mediaType, blob.type)}`);
  };

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Remote media request failed');
    save(await verifiedMediaBlob(response, mediaType, mimeType, abortSignal));
    return true;
  } catch (error) {
    if (isAbort(error)) return false;

    if (mediaType === 'video') {
      submitProxiedVideoDownload({ url, filenameBase, mimeType });
      // The browser now owns the streamed response; unlike the blob path above,
      // this handoff cannot synchronously prove that the remote bytes arrived.
      return false;
    }

    try {
      const proxied = await proxiedMediaBlob(url, mediaType, mimeType, abortSignal, signal);
      if (proxied) {
        save(proxied);
        return true;
      }
    } catch (proxyError) {
      if (isAbort(proxyError)) return false;
    }

    triggerAnchorDownload(url, `${filenameBase}.${extensionForMedia(mediaType, mimeType)}`);
    return false;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Native form submission lets the browser stream a Content-Disposition response
 * directly to disk instead of buffering a potentially large video in JS. The
 * hidden frame contains any JSON error response, so a failed proxy cannot take
 * the user away from their result.
 */
function submitProxiedVideoDownload(args: {
  url: string;
  filenameBase: string;
  mimeType?: string;
}) {
  const frame = document.createElement('iframe');
  const frameName = `video-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  frame.name = frameName;
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = VIDEO_DOWNLOAD_ENDPOINT;
  form.target = frameName;
  form.hidden = true;

  const fields: Record<string, string | undefined> = {
    url: args.url,
    filenameBase: args.filenameBase,
    mimeType: args.mimeType,
  };
  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(frame, form);
  form.submit();
  form.remove();
  // Leave the target alive long enough for slow CDN headers; it contains no
  // visible UI or retained provider URL after the request completes.
  window.setTimeout(() => frame.remove(), 120_000);
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Second attempt at image bytes through the drop zone's existing 20 MB proxy.
 * Video fallback uses the streaming attachment route above instead.
 */
async function proxiedMediaBlob(
  url: string,
  mediaType: DownloadMediaType,
  mimeType: string | undefined,
  abortSignal: AbortSignal,
  signal?: AbortSignal
): Promise<Blob | undefined> {
  if (mediaType !== 'image') return undefined;

  const response = await fetch(IMAGE_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!response.ok) {
    void response.body?.cancel();
    return undefined;
  }
  return verifiedMediaBlob(response, mediaType, mimeType, abortSignal);
}

function triggerAnchorDownload(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}
