import { describe, expect, it, vi } from 'vitest';

import { convertImageBlob, convertImageFile, type ImageEncoder } from '../../lib/image/convert';
import { MIME_BY_FORMAT, type ImageFormat } from '../../lib/image/policy';

/**
 * jsdom has no canvas encoder, so the four rules are exercised against a fake.
 * Real encoding is checked in the browser smoke test.
 */
function fakeEncoder(overrides: Partial<ImageEncoder> = {}): ImageEncoder {
  return {
    supports: async () => true,
    // Answers with the requested type, and half the size, unless overridden.
    encode: async (blob, format) =>
      new Blob([new Uint8Array(Math.max(1, Math.floor(blob.size / 2)))], {
        type: MIME_BY_FORMAT[format],
      }),
    hasAlpha: async () => false,
    ...overrides,
  };
}

/** A blob of `size` bytes, typed as `mime`. */
function blobOf(size: number, mime: string) {
  return new Blob([new Uint8Array(size)], { type: mime });
}

describe('convertImageBlob', () => {
  it('re-encodes into the requested format', async () => {
    const source = blobOf(1000, 'image/png');
    const result = await convertImageBlob(source, 'webp', 0.92, fakeEncoder());

    expect(result.type).toBe('image/webp');
    expect(result.size).toBeLessThan(source.size);
  });

  it('is idempotent — bytes already in the target format are never re-encoded', async () => {
    // This is what stops a PNG->WebP->WebP generation-loss chain when a library
    // image, already converted on capture, is later added as a reference.
    const encode = vi.fn();
    const source = blobOf(1000, 'image/webp');

    const result = await convertImageBlob(source, 'webp', 0.92, fakeEncoder({ encode }));

    expect(result).toBe(source);
    expect(encode).not.toHaveBeenCalled();
  });

  it('keeps the original when re-encoding would not make it smaller', async () => {
    // Flat-color PNGs routinely grow as WebP; "convert for a smaller payload"
    // must never quietly do the opposite.
    const source = blobOf(100, 'image/png');
    const encoder = fakeEncoder({
      encode: async (_blob, format) => blobOf(400, MIME_BY_FORMAT[format]),
    });

    expect(await convertImageBlob(source, 'webp', 0.92, encoder)).toBe(source);
  });

  it('redirects a JPEG target to WebP when the source is transparent', async () => {
    // JPEG has no alpha channel; encoding a transparent PNG as JPEG puts black
    // behind it.
    const source = blobOf(1000, 'image/png');
    const encoder = fakeEncoder({ hasAlpha: async () => true });

    const result = await convertImageBlob(source, 'jpeg', 0.92, encoder);

    expect(result.type).toBe('image/webp');
  });

  it('still uses JPEG for an opaque source', async () => {
    const result = await convertImageBlob(blobOf(1000, 'image/png'), 'jpeg', 0.92, fakeEncoder());

    expect(result.type).toBe('image/jpeg');
  });

  it('keeps the original when the browser cannot encode the format', async () => {
    const source = blobOf(1000, 'image/png');
    const encoder = fakeEncoder({ supports: async () => false });

    expect(await convertImageBlob(source, 'webp', 0.92, encoder)).toBe(source);
  });

  it('still attempts the encode when the support probe is indeterminate', async () => {
    // A probe that loses its budget to a busy main thread is not evidence the
    // encoder is missing — and the encode validates its own output type anyway.
    const source = blobOf(1000, 'image/png');
    const encoder = fakeEncoder({ supports: async () => undefined });

    expect((await convertImageBlob(source, 'webp', 0.92, encoder)).type).toBe('image/webp');
  });

  it('rejects an encoder that answers with a different type than asked for', async () => {
    // canvas.toBlob does not fail on an unsupported format — it quietly hands
    // back a PNG. Trusting it would produce a .webp file holding PNG bytes.
    const source = blobOf(1000, 'image/jpeg');
    const encoder = fakeEncoder({
      encode: async () => blobOf(100, 'image/png'),
    });

    expect(await convertImageBlob(source, 'webp', 0.92, encoder)).toBe(source);
  });

  it('keeps the original when the bytes cannot be decoded', async () => {
    const source = blobOf(1000, 'image/png');
    const encoder = fakeEncoder({ encode: async () => undefined });

    expect(await convertImageBlob(source, 'webp', 0.92, encoder)).toBe(source);
  });

  it('keeps the original when the encoder throws', async () => {
    // Conversion is an optimization, never a gate: a reference that will not
    // convert must still reach the provider.
    const source = blobOf(1000, 'image/png');
    const encoder = fakeEncoder({
      encode: async () => {
        throw new Error('canvas is gone');
      },
    });

    expect(await convertImageBlob(source, 'webp', 0.92, encoder)).toBe(source);
  });
});

describe('convertImageFile', () => {
  it('renames the file after the format it actually became', async () => {
    const file = new File([new Uint8Array(1000)], 'neon-tiger.png', { type: 'image/png' });

    const result = await convertImageFile(file, 'webp', 0.92, fakeEncoder());

    expect(result.name).toBe('neon-tiger.webp');
    expect(result.type).toBe('image/webp');
  });

  it('spells a JPEG file .jpg', async () => {
    const file = new File([new Uint8Array(1000)], 'shot.png', { type: 'image/png' });

    expect((await convertImageFile(file, 'jpeg', 0.92, fakeEncoder())).name).toBe('shot.jpg');
  });

  it('leaves the filename alone when nothing was converted', async () => {
    const file = new File([new Uint8Array(1000)], 'keep.png', { type: 'image/png' });
    const encoder = fakeEncoder({ supports: async () => false });

    expect(await convertImageFile(file, 'webp', 0.92, encoder)).toBe(file);
  });

  it('survives a name with no extension', async () => {
    const file = new File([new Uint8Array(1000)], 'untitled', { type: 'image/png' });

    expect((await convertImageFile(file, 'webp', 0.92, fakeEncoder())).name).toBe('untitled.webp');
  });
});

describe('prepareReferences', () => {
  it('converts PNG references and leaves the rest untouched', async () => {
    const { prepareReferences } = await import('../../lib/draft/ingest');
    const png = new File([new Uint8Array(1000)], 'a.png', { type: 'image/png' });
    const jpg = new File([new Uint8Array(1000)], 'b.jpg', { type: 'image/jpeg' });

    const [first, second] = await prepareReferences(
      [{ file: png }, { file: jpg, sourceLabel: 'Last frame of clip.mp4' }],
      'auto'
    );

    // jsdom's toBlob never calls its callback, which is precisely the case the
    // encode timeout guards: this resolves rather than hanging, the reference
    // falls back to the original file, and the label survives either way.
    expect(first.file.type).toMatch(/^image\//);
    expect(second.file).toBe(jpg);
    expect(second.sourceLabel).toBe('Last frame of clip.mp4');
  });

  it('leaves every reference alone when the preference matches the source', async () => {
    const { prepareReferences } = await import('../../lib/draft/ingest');
    const webp = new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' });

    const [only] = await prepareReferences([{ file: webp }], 'webp');

    expect(only.file).toBe(webp);
  });
});

describe('format constants', () => {
  it('names a MIME type for every encodable format', () => {
    for (const format of ['png', 'jpeg', 'webp'] as ImageFormat[]) {
      expect(MIME_BY_FORMAT[format]).toMatch(/^image\//);
    }
  });
});
