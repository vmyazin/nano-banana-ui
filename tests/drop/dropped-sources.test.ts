import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DROP_EMPTY_ERROR,
  DROP_FETCH_ERROR,
  filesFromDataTransfer,
  urlFromDataTransfer,
} from '../../lib/drop/dropped-sources';

function dataTransfer({
  files = [],
  data = {},
}: {
  files?: File[];
  data?: Record<string, string>;
}): DataTransfer {
  return {
    files: files as unknown as FileList,
    types: [...(files.length ? ['Files'] : []), ...Object.keys(data)],
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer;
}

function imageResponse(body: string, type = 'image/png') {
  return new Response(new Blob([body], { type }), {
    status: 200,
    headers: { 'Content-Type': type },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('urlFromDataTransfer', () => {
  it('prefers the uri-list payload', () => {
    const transfer = dataTransfer({
      data: {
        'text/uri-list': '# comment\nhttps://example.com/cat.png\n',
        'text/plain': 'https://example.com/other.png',
      },
    });
    expect(urlFromDataTransfer(transfer)).toBe('https://example.com/cat.png');
  });

  it('reads the src out of a dragged img element', () => {
    const transfer = dataTransfer({
      data: { 'text/html': '<meta charset="utf-8"><img src="https://example.com/a.png?w=1&amp;h=2">' },
    });
    expect(urlFromDataTransfer(transfer)).toBe('https://example.com/a.png?w=1&h=2');
  });

  it('ignores payloads that are not http(s) URLs', () => {
    expect(urlFromDataTransfer(dataTransfer({ data: { 'text/plain': 'just some words' } }))).toBeUndefined();
    expect(
      urlFromDataTransfer(dataTransfer({ data: { 'text/uri-list': 'file:///etc/passwd' } }))
    ).toBeUndefined();
    expect(
      urlFromDataTransfer(dataTransfer({ data: { 'text/plain': 'data:image/png;base64,AAAA' } }))
    ).toBeUndefined();
  });
});

describe('filesFromDataTransfer', () => {
  it('returns dropped files without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'local.png', { type: 'image/png' });

    const result = await filesFromDataTransfer(
      dataTransfer({ files: [file], data: { 'text/plain': '/Users/me/local.png' } })
    );

    expect(result.files).toEqual([file]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a dropped URL through the proxy and names the file from its path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageResponse('bytes', 'image/webp'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await filesFromDataTransfer(
      dataTransfer({ data: { 'text/uri-list': 'https://example.com/photos/sunset.jpg?v=2' } })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fetch-image',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://example.com/photos/sunset.jpg?v=2' }) })
    );
    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(1);
    // The proxy's content type wins over the extension the URL claimed.
    expect(result.files[0].name).toBe('sunset.webp');
    expect(result.files[0].type).toBe('image/webp');
  });

  it('surfaces the proxy error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'That address cannot be fetched.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await filesFromDataTransfer(
      dataTransfer({ data: { 'text/uri-list': 'http://169.254.169.254/latest/meta-data/' } })
    );

    expect(result.files).toHaveLength(0);
    expect(result.error).toBe('That address cannot be fetched.');
  });

  it('rejects a proxy response that is not an allowed image type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse('<html>', 'text/html')));

    const result = await filesFromDataTransfer(
      dataTransfer({ data: { 'text/uri-list': 'https://example.com/page' } })
    );

    expect(result.files).toHaveLength(0);
    expect(result.error).toBe(DROP_FETCH_ERROR);
  });

  it('reports an empty drop', async () => {
    const result = await filesFromDataTransfer(dataTransfer({ data: { 'text/plain': 'hello' } }));
    expect(result).toEqual({ files: [], error: DROP_EMPTY_ERROR });
  });
});
