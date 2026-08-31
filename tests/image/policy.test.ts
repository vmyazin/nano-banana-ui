import { describe, expect, it } from 'vitest';

import { formatForMime, targetFormat } from '../../lib/image/policy';

describe('formatForMime', () => {
  it('reads a format from a MIME type, ignoring case and parameters', () => {
    expect(formatForMime('IMAGE/PNG')).toBe('png');
    expect(formatForMime('image/jpeg; charset=binary')).toBe('jpeg');
  });

  it('has no format for types it cannot encode', () => {
    // AVIF stays decode-only, so it must never be picked as a target.
    expect(formatForMime('image/avif')).toBeUndefined();
    expect(formatForMime('image/gif')).toBeUndefined();
    expect(formatForMime(undefined)).toBeUndefined();
  });
});

describe('targetFormat under auto', () => {
  const auto = (sourceMime: string) =>
    targetFormat({ sourceMime, destination: 'reference', preference: 'auto' });

  it('rewrites PNG to WebP — the whole point of the feature', () => {
    expect(auto('image/png')).toBe('webp');
  });

  it('leaves already-compact formats alone', () => {
    // Re-encoding these spends quality for no payload win.
    expect(auto('image/jpeg')).toBeUndefined();
    expect(auto('image/webp')).toBeUndefined();
    expect(auto('image/avif')).toBeUndefined();
  });

  it('behaves the same at every destination', () => {
    for (const destination of ['reference', 'download', 'library'] as const) {
      expect(targetFormat({ sourceMime: 'image/png', destination, preference: 'auto' })).toBe('webp');
    }
  });
});

describe('targetFormat under an explicit preference', () => {
  it('forces the chosen format', () => {
    expect(
      targetFormat({ sourceMime: 'image/png', destination: 'download', preference: 'jpeg' })
    ).toBe('jpeg');
    expect(
      targetFormat({ sourceMime: 'image/webp', destination: 'download', preference: 'png' })
    ).toBe('png');
  });

  it('is a no-op when the source is already that format', () => {
    expect(
      targetFormat({ sourceMime: 'image/webp', destination: 'download', preference: 'webp' })
    ).toBeUndefined();
  });

  it('still applies to a source whose type it cannot name', () => {
    // An octet-stream that is really a PNG should follow the user's choice;
    // convertImageBlob refuses anything it genuinely cannot decode.
    expect(
      targetFormat({ sourceMime: 'application/octet-stream', destination: 'download', preference: 'webp' })
    ).toBe('webp');
  });
});
