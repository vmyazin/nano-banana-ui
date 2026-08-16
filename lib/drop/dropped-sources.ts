/**
 * Turning a drop into Files.
 *
 * A drop carries one of two very different things. Dragging out of Finder hands over
 * real `File` objects. Dragging an image out of another browser tab hands over only a
 * URL — the page is not allowed to read cross-origin image bytes — so those go through
 * `/api/fetch-image`, which fetches them server-side under an SSRF guard.
 */

export const DROP_URL_ENDPOINT = '/api/fetch-image';

/** Mirrors the proxy's allowlist; kept here so a bad drop fails before the round trip. */
const REMOTE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export const DROP_FETCH_ERROR = 'That image could not be fetched from its source.';
export const DROP_EMPTY_ERROR = 'Drop an image file, or an image dragged from a web page.';

export interface DroppedSources {
  files: File[];
  /** Set when the drop carried something, but nothing usable came back. */
  error?: string;
}

/**
 * A dropped `<img>` arrives as an HTML fragment. Parsing it with DOMParser rather than a
 * regex keeps entity-encoded URLs (`&amp;` in a query string) intact, and the fragment is
 * never attached to the document, so the parse itself loads nothing.
 */
function urlFromHtml(html: string): string | undefined {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const source = parsed.querySelector('img')?.getAttribute('src');
    return source ?? undefined;
  } catch {
    return undefined;
  }
}

function firstUrlFromUriList(list: string): string | undefined {
  // text/uri-list is line-based and allows `#` comment lines.
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Absolute http(s) URLs, plus root-relative ones so an image dragged from a page on this
 * origin still works. Deliberately *not* `new URL(candidate, location.href)` for arbitrary
 * text: that resolves "just some words" into a same-origin URL, and a dropped text
 * selection would fire a proxy fetch for a page that was never an image.
 */
function toFetchableUrl(candidate: string): string | undefined {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    // Not absolute.
  }
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return undefined;
  try {
    return new URL(candidate, window.location.href).href;
  } catch {
    return undefined;
  }
}

/** The URL a drop points at, or undefined when it carries no usable URL. */
export function urlFromDataTransfer(dataTransfer: Pick<DataTransfer, 'getData'>): string | undefined {
  const candidates = [
    firstUrlFromUriList(dataTransfer.getData('text/uri-list') || ''),
    urlFromHtml(dataTransfer.getData('text/html') || ''),
    (dataTransfer.getData('text/plain') || '').trim() || undefined,
  ];

  for (const candidate of candidates) {
    const url = candidate && toFetchableUrl(candidate);
    if (url) return url;
  }
  return undefined;
}

function filenameFor(url: string, mimeType: string): string {
  const extension = EXTENSION_BY_TYPE[mimeType] ?? 'png';
  let base = 'dropped-image';
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    // Strip the extension the URL claims: the proxy's content type is the honest one.
    if (last) base = last.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || base;
  } catch {
    // Keep the fallback.
  }
  return `${base}.${extension}`;
}

/** Fetch a dropped URL's bytes through the proxy and wrap them in a File. */
export async function fileFromUrl(url: string, signal?: AbortSignal): Promise<File> {
  const response = await fetch(DROP_URL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });

  if (!response.ok) {
    // The route answers with JSON on every failure path; fall back if that changes.
    const message = await response
      .json()
      .then((body: { error?: unknown }) => (typeof body.error === 'string' ? body.error : undefined))
      .catch(() => undefined);
    throw new Error(message || DROP_FETCH_ERROR);
  }

  const blob = await response.blob();
  const mimeType = (blob.type || '').toLowerCase();
  if (!REMOTE_IMAGE_TYPES.has(mimeType)) throw new Error(DROP_FETCH_ERROR);

  return new File([blob], filenameFor(url, mimeType), { type: mimeType });
}

/**
 * Resolve a drop into Files. Local files win over any URL payload: a Finder drag also
 * carries a `text/plain` path on some platforms, and a round trip for it would fail.
 *
 * Both reads below happen before the first `await`, so they run inside the drop event's
 * own dispatch — a DataTransfer goes inert the moment the handler returns, and reading it
 * from a later microtask yields nothing.
 */
export async function filesFromDataTransfer(
  dataTransfer: DataTransfer,
  options: { signal?: AbortSignal } = {}
): Promise<DroppedSources> {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) return { files };

  const url = urlFromDataTransfer(dataTransfer);
  if (!url) return { files: [], error: DROP_EMPTY_ERROR };

  try {
    return { files: [await fileFromUrl(url, options.signal)] };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { files: [] };
    return { files: [], error: error instanceof Error ? error.message : DROP_FETCH_ERROR };
  }
}
