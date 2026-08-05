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
    return new Blob([blob], { type: mimeType });
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

/**
 * Ask gemini-2.5-flash-lite (via /api/slug) for a short evocative filename slug.
 * Returns null when no Gemini key is connected or the model is unavailable —
 * callers fall back to {@link fallbackFilenameBase}.
 */
export async function requestPromptSlug(
  prompt: string,
  apiKey: string,
  options: { signal?: AbortSignal } = {}
): Promise<string | null> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt || !apiKey) return null;

  try {
    const response = await fetch('/api/slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: trimmedPrompt, apiKey }),
      signal: options.signal,
    });
    const data = (await response.json()) as { slug?: string };
    if (!response.ok || typeof data.slug !== 'string') return null;
    return data.slug || null;
  } catch {
    return null;
  }
}

/** Deterministic name used when the model slug is unavailable. */
export function fallbackFilenameBase(prompt: string, mediaType: DownloadMediaType) {
  return slugify(prompt) || `generated-${mediaType}`;
}

/**
 * Download a provider-hosted result under `${base}.${ext}`.
 *
 * Cross-origin CDNs make the anchor `download` attribute a no-op, so the bytes
 * are pulled into a blob first. If that fetch is blocked (CORS, expired URL)
 * the browser's own navigation is used as a last resort so the user still gets
 * the file — just under the provider's opaque name.
 */
export async function downloadRemoteMedia(args: {
  url: string;
  mediaType: DownloadMediaType;
  filenameBase: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { url, mediaType, filenameBase, mimeType, signal } = args;
  let objectUrl: string | null = null;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Remote media request failed');

    const responseMime =
      normalizedMimeType(response.headers.get('Content-Type')) || normalizedMimeType(mimeType);
    if (mediaType === 'image' && !SUPPORTED_RASTER_MIMES.has(responseMime)) {
      throw new Error('Unsupported image media type');
    }
    if (mediaType === 'video' && !responseMime.startsWith('video/')) {
      throw new Error('Unsupported video media type');
    }

    const blob = await boundedMediaBlob(
      response,
      responseMime,
      signal ?? new AbortController().signal,
      mediaType === 'image' ? MAX_REMOTE_IMAGE_BYTES : MAX_REMOTE_VIDEO_BYTES
    );
    objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, `${filenameBase}.${extensionForMedia(mediaType, responseMime)}`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    triggerAnchorDownload(url, `${filenameBase}.${extensionForMedia(mediaType, mimeType)}`);
    return false;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function triggerAnchorDownload(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}
