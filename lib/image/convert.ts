import {
  DEFAULT_QUALITY,
  EXTENSION_BY_FORMAT,
  formatForMime,
  MIME_BY_FORMAT,
  type ImageFormat,
} from '@/lib/image/policy';

/**
 * Re-encoding image bytes in the browser.
 *
 * Conversion is an optimization, never a gate: every failure path here returns
 * the original blob rather than throwing. A reference that will not convert is
 * still a usable reference, and nothing in this module may turn a working
 * generation into a failed one.
 *
 * The encoder is a port rather than a direct canvas call for the same reason
 * `lib/gallery/storage.ts` is one — jsdom has no canvas encoder, so the four
 * rules below are only testable against a fake.
 */

export interface ImageEncoder {
  /** Whether this browser can genuinely encode the format. */
  supports(format: ImageFormat): Promise<boolean>;
  /** Re-encode, or undefined when the bytes cannot be decoded. */
  encode(blob: Blob, format: ImageFormat, quality: number): Promise<Blob | undefined>;
  /** Whether the source actually uses its alpha channel. */
  hasAlpha(blob: Blob): Promise<boolean>;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/**
 * OffscreenCanvas where available, a detached element otherwise (Safari < 16.4).
 * Returns undefined during server rendering, where neither exists.
 */
function createCanvas(width: number, height: number): AnyCanvas | undefined {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Encoding must be able to fail, but never to hang.
 *
 * `HTMLCanvasElement.toBlob` is callback-based, and an implementation that
 * declines the format can simply never call back — jsdom does exactly that.
 * Since `supports()` memoizes its probe, one unanswered callback would leave
 * every later conversion awaiting a promise that never settles, stalling
 * reference ingest instead of merely skipping the conversion.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

/** Generous enough for a 4K frame on a slow machine. */
const ENCODE_TIMEOUT_MS = 15_000;
/**
 * The probe encodes a single pixel — microseconds of real work. Kept tight
 * because reference ingest waits on it: an environment that cannot answer this
 * fast is one where the right move is to skip conversion and move on.
 */
const PROBE_TIMEOUT_MS = 250;

function canvasToBlob(
  canvas: AnyCanvas,
  type: string,
  quality: number,
  timeoutMs: number
): Promise<Blob | null> {
  const encoded = new Promise<Blob | null>((resolve, reject) => {
    try {
      if ('convertToBlob' in canvas) {
        canvas.convertToBlob({ type, quality }).then(resolve, reject);
        return;
      }
      canvas.toBlob(resolve, type, quality);
    } catch (error) {
      reject(error);
    }
  });
  return withTimeout(encoded, timeoutMs);
}

/**
 * Lazily memoized, and deliberately not computed at module scope: Next.js
 * prerenders this bundle on the server during `next build`, where
 * `OffscreenCanvas` does not exist, and a top-level probe would fail the build.
 */
const probes = new Map<ImageFormat, Promise<boolean>>();

async function probeFormat(format: ImageFormat): Promise<boolean> {
  try {
    const canvas = createCanvas(1, 1);
    // The context is not optional: an OffscreenCanvas that has never been given
    // one throws InvalidStateError from convertToBlob, which would report every
    // format unsupported and silently disable conversion everywhere.
    if (!canvas?.getContext('2d')) return false;
    const encoded = await canvasToBlob(
      canvas,
      MIME_BY_FORMAT[format],
      DEFAULT_QUALITY,
      PROBE_TIMEOUT_MS
    );
    // A browser without this encoder does not fail — `toBlob` quietly answers
    // with a PNG instead. Comparing the type is the only way to tell.
    return encoded?.type === MIME_BY_FORMAT[format];
  } catch {
    return false;
  }
}

export const canvasEncoder: ImageEncoder = {
  supports(format) {
    let probe = probes.get(format);
    if (!probe) {
      probe = probeFormat(format);
      probes.set(format, probe);
    }
    return probe;
  },

  async encode(blob, format, quality) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob);
      const canvas = createCanvas(bitmap.width, bitmap.height);
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return undefined;
      (context as CanvasRenderingContext2D).drawImage(bitmap, 0, 0);
      return (
        (await canvasToBlob(canvas, MIME_BY_FORMAT[format], quality, ENCODE_TIMEOUT_MS)) ?? undefined
      );
    } catch {
      return undefined;
    } finally {
      bitmap?.close();
    }
  },

  async hasAlpha(blob) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob);
      const canvas = createCanvas(bitmap.width, bitmap.height);
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return false;
      const drawing = context as CanvasRenderingContext2D;
      drawing.drawImage(bitmap, 0, 0);

      // Read in row strips rather than one getImageData over the whole surface:
      // a 4K frame is a 33 MB buffer, and most transparent images reveal
      // themselves in the first strip anyway.
      const stripRows = 64;
      for (let y = 0; y < bitmap.height; y += stripRows) {
        const rows = Math.min(stripRows, bitmap.height - y);
        const { data } = drawing.getImageData(0, y, bitmap.width, rows);
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] !== 255) return true;
        }
      }
      return false;
    } catch {
      // An undecodable image is not something to claim transparency for; the
      // caller treats false as "safe to encode as JPEG", and the encode itself
      // will fail the same way and fall back.
      return false;
    } finally {
      bitmap?.close();
    }
  },
};

/**
 * Convert `blob` to `format`, or return it untouched.
 *
 * Four rules make this safe to call from anywhere:
 *
 * - **Idempotent.** Bytes already in the target format are returned as-is. This
 *   is what stops a PNG→WebP→WebP generation-loss chain when a library image,
 *   already converted on capture, is later added as a reference.
 * - **Alpha-safe.** JPEG has no alpha channel, so a transparent PNG encoded as
 *   JPEG comes back with black behind it. A JPEG target on a transparent source
 *   is redirected to WebP, which carries alpha at no cost.
 * - **No silent mislabeling.** An encoder that answers with a different type
 *   than asked for is treated as unsupported, so a `.webp` filename can never
 *   end up holding PNG bytes.
 * - **Never grow.** A result no smaller than the source is discarded. Flat-color
 *   PNGs — screenshots, diagrams — routinely re-encode *larger*, and converting
 *   for a smaller payload must not quietly do the opposite.
 */
export async function convertImageBlob(
  blob: Blob,
  format: ImageFormat,
  quality: number = DEFAULT_QUALITY,
  encoder: ImageEncoder = canvasEncoder
): Promise<Blob> {
  try {
    let target = format;

    if (target === 'jpeg' && (await encoder.hasAlpha(blob))) {
      target = 'webp';
    }

    if (formatForMime(blob.type) === target) return blob;
    if (!(await encoder.supports(target))) return blob;

    const encoded = await encoder.encode(blob, target, quality);
    if (!encoded) return blob;
    if (encoded.type !== MIME_BY_FORMAT[target]) return blob;
    if (encoded.size >= blob.size) return blob;

    return encoded;
  } catch {
    return blob;
  }
}

/** Same rules, preserving the filename with the extension the bytes deserve. */
export async function convertImageFile(
  file: File,
  format: ImageFormat,
  quality: number = DEFAULT_QUALITY,
  encoder: ImageEncoder = canvasEncoder
): Promise<File> {
  const converted = await convertImageBlob(file, format, quality, encoder);
  if (converted === file || converted.type === file.type) return file;

  const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'image';
  const extension = EXTENSION_BY_FORMAT[formatForMime(converted.type) ?? 'png'];
  return new File([converted], `${base}.${extension}`, { type: converted.type });
}
