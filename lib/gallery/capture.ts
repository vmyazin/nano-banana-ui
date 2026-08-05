import {
  boundedMediaBlob,
  isDownloadableMediaUrl,
  MAX_REMOTE_IMAGE_BYTES,
  MAX_REMOTE_VIDEO_BYTES,
  normalizedMimeType,
} from '@/lib/media-download';
import type { GalleryKind } from '@/lib/gallery/storage';

/**
 * Turning a finished result into bytes the gallery can hold.
 *
 * Results arrive in two shapes: Gemini, Pollinations and Cloudflare hand back a
 * base64 `data:` URL, while fal and Kie hand back a provider URL that will
 * expire. Both have to become a Blob before anything durable can happen.
 */

/** Decodes locally — no network, and no dependence on `fetch` accepting data URLs. */
export function blobFromDataUrl(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',', 2);
  if (!header?.startsWith('data:') || encoded === undefined) {
    throw new Error('Not a data URL');
  }
  const mimeType = normalizedMimeType(header.slice(5).replace(/;base64$/, '')) || 'image/png';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Pulls a provider-hosted result down, bounded by the same caps as downloads. */
export async function fetchResultBlob(
  url: string,
  kind: GalleryKind,
  options: { signal?: AbortSignal } = {}
): Promise<Blob> {
  if (!isDownloadableMediaUrl(url)) throw new Error('Result URL is not downloadable');

  const signal = options.signal ?? new AbortController().signal;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Result could not be fetched');

  const mimeType = normalizedMimeType(response.headers.get('Content-Type'));
  return boundedMediaBlob(
    response,
    mimeType,
    signal,
    kind === 'video' ? MAX_REMOTE_VIDEO_BYTES : MAX_REMOTE_IMAGE_BYTES
  );
}

/** Whichever shape the result came in, get its bytes. */
export function resultBlob(
  result: string,
  kind: GalleryKind,
  options: { signal?: AbortSignal } = {}
): Promise<Blob> {
  return result.startsWith('data:')
    ? Promise.resolve(blobFromDataUrl(result))
    : fetchResultBlob(result, kind, options);
}
