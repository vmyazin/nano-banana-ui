import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadRemoteMedia, sniffMediaMime } from '../lib/media-download';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const HTML_BYTES = new TextEncoder().encode('<!doctype html><title>nope</title>');

const RESULT_URL = 'https://tempfile.example.com/result';

function response(bytes: Uint8Array, contentType?: string) {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: contentType ? { 'Content-Type': contentType } : {},
  });
}

let clickSpy: ReturnType<typeof vi.spyOn>;
let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createObjectURL = vi.fn(() => 'blob:result');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** What the anchor was actually told to save, and under what name. */
function savedAs() {
  const link = clickSpy.mock.instances[0] as HTMLAnchorElement;
  return { href: link.href, download: link.download };
}

describe('sniffMediaMime', () => {
  it.each([
    ['png', PNG_BYTES, 'image/png'],
    ['jpeg', JPEG_BYTES, 'image/jpeg'],
  ])('reads %s from its leading bytes', (_name, bytes, expected) => {
    expect(sniffMediaMime(bytes)).toBe(expected);
  });

  it('reads the container brands that share the ftyp header', () => {
    const ftyp = (brand: string) =>
      new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode(`ftyp${brand}`)]);
    expect(sniffMediaMime(ftyp('avif'))).toBe('image/avif');
    expect(sniffMediaMime(ftyp('isom'))).toBe('video/mp4');
  });

  it('says nothing about bytes it does not recognize', () => {
    expect(sniffMediaMime(HTML_BYTES)).toBeUndefined();
  });
});

describe('downloadRemoteMedia', () => {
  it('names the file from the sniffed bytes when the store sends a generic type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(JPEG_BYTES, 'application/octet-stream')));

    const saved = await downloadRemoteMedia({
      url: RESULT_URL,
      mediaType: 'image',
      filenameBase: 'quiet-ocean-at-dusk-gpt-image-2',
    });

    expect(saved).toBe(true);
    expect(savedAs()).toEqual({
      href: 'blob:result',
      download: 'quiet-ocean-at-dusk-gpt-image-2.jpg',
    });
  });

  it('retries an image through the server when the CDN refuses the browser', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === RESULT_URL) throw new TypeError('Failed to fetch');
      return response(PNG_BYTES, 'image/png');
    });
    vi.stubGlobal('fetch', fetchMock);

    const saved = await downloadRemoteMedia({
      url: RESULT_URL,
      mediaType: 'image',
      filenameBase: 'quiet-ocean-at-dusk-gpt-image-2',
    });

    expect(saved).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/fetch-image', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url: RESULT_URL }),
    }));
    // The blob, not the provider URL — a cross-origin href would open a tab.
    expect(savedAs()).toEqual({
      href: 'blob:result',
      download: 'quiet-ocean-at-dusk-gpt-image-2.png',
    });
  });

  it('refuses a document dressed up as a result, on either route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(HTML_BYTES, 'application/octet-stream')));

    const saved = await downloadRemoteMedia({
      url: RESULT_URL,
      mediaType: 'image',
      filenameBase: 'quiet-ocean-at-dusk',
    });

    expect(saved).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    // Last resort only: the browser gets the URL itself.
    expect(savedAs().href).toBe(RESULT_URL);
  });

  it('leaves a video to the browser rather than the image proxy', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const saved = await downloadRemoteMedia({
      url: RESULT_URL,
      mediaType: 'video',
      filenameBase: 'neon-tiger-wan-2_7',
    });

    expect(saved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(savedAs()).toEqual({ href: RESULT_URL, download: 'neon-tiger-wan-2_7.mp4' });
  });
});
