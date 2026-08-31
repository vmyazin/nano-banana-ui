/**
 * Which format image bytes should end up in, and nothing else.
 *
 * Kept pure and separate from `convert.ts` for two reasons: the rules are the
 * part worth testing, and jsdom has no canvas encoder — so anything that shares
 * a module with the encoder cannot be unit tested at all.
 *
 * Deliberately free of imports: `lib/media-download.ts` reads the download
 * policy, so borrowing its `normalizedMimeType` here would close an import
 * cycle through this module.
 */

/** Strips any `;charset=…` parameter and casing, as `media-download` does. */
function bareMime(mimeType?: string | null): string {
  return mimeType?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

export const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** `'auto'` lets the policy decide; the rest force a format. */
export type ImageFormatPreference = 'auto' | ImageFormat;

/** Where the bytes are headed. Auto behaves the same everywhere today. */
export type ImageDestination = 'reference' | 'download' | 'library';

/** Filename extension per format; `jpeg` is spelled `jpg` on disk. */
export const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const FORMAT_BY_MIME: Record<string, ImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

/**
 * Quality for the lossy encoders. 0.92 is high enough that a re-encode is
 * visually indistinguishable at normal viewing size, which matters because the
 * library conversion is one-way — see the design doc.
 */
export const DEFAULT_QUALITY = 0.92;

/** The format a MIME type names, or undefined for anything we cannot encode. */
export function formatForMime(mimeType?: string | null): ImageFormat | undefined {
  return FORMAT_BY_MIME[bareMime(mimeType)];
}

/**
 * The format these bytes should become, or undefined to leave them untouched.
 *
 * Under `'auto'` only PNG is rewritten, and it becomes WebP. JPEG, WebP and
 * AVIF are already compact and already accepted everywhere this app sends
 * images, so re-encoding them would spend quality for no payload win — the
 * whole point of the feature.
 *
 * WebP is the automatic target rather than JPEG because it carries an alpha
 * channel (no transparency trap), beats JPEG at equal visual quality, and is in
 * every allowlist this repo enforces: `app/api/fal/upload/route.ts`,
 * `app/api/fetch-image/route.ts`, and `lib/drop/dropped-sources.ts`.
 */
export function targetFormat(args: {
  sourceMime?: string | null;
  destination: ImageDestination;
  preference: ImageFormatPreference;
}): ImageFormat | undefined {
  const source = formatForMime(args.sourceMime);

  if (args.preference !== 'auto') {
    // An explicit choice is honored even for a source we cannot decode a format
    // name for; `convertImageBlob` still refuses anything it cannot decode.
    return args.preference === source ? undefined : args.preference;
  }

  return source === 'png' ? 'webp' : undefined;
}
