import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadKieFile, validateKieApiKey } from '../../lib/kie/server';

describe('Kie server helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates an API key through the credit endpoint without creating media', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: 42 }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateKieApiKey('kie_test_key')).resolves.toEqual({ credits: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kie.ai/api/v1/chat/credit',
      expect.objectContaining({ headers: { Authorization: 'Bearer kie_test_key' } })
    );
  });

  it('uploads a file as multipart data and returns Kie’s temporary download URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: { downloadUrl: 'https://tempfile.redpandaai.co/files/source.png' },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const source = new File(['source image'], 'source.png', { type: 'image/png' });

    await expect(uploadKieFile({ apiKey: 'kie_test_key', file: source })).resolves.toBe(
      'https://tempfile.redpandaai.co/files/source.png'
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kieai.redpandaai.co/api/file-stream-upload',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer kie_test_key' } })
    );
    expect(init.body).toBeInstanceOf(FormData);
  });
});
