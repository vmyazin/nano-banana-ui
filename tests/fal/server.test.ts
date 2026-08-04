import { afterEach, describe, expect, it, vi } from 'vitest';

type FalClient = ReturnType<typeof import('@fal-ai/client').createFalClient>;
type FalClientConfig = Parameters<typeof import('@fal-ai/client').createFalClient>[0];
type FalClientDouble = {
  queue?: Partial<FalClient['queue']>;
  storage?: Partial<FalClient['storage']>;
};

const { createFalClient } = vi.hoisted(() => ({
  createFalClient: vi.fn<(config?: FalClientConfig) => FalClientDouble>(),
}));

vi.mock('@fal-ai/client', () => ({ createFalClient }));

import {
  FalApiError,
  cancelFalTask,
  getFalTask,
  submitFalTask,
  uploadFalFile,
  validateFalApiKey,
} from '../../lib/fal/server';

const apiKey = 'id:secret';
const validSubmitArgs = {
  apiKey,
  modelId: 'nano-banana-2',
  mediaType: 'image' as const,
  inputMode: 'text' as const,
  prompt: 'A yellow banana',
  uploadUrls: [],
  values: {},
};

function falError(status: number, message = 'raw provider failure') {
  return Object.assign(new Error(message), {
    status,
    body: { detail: `body containing ${apiKey}` },
  });
}

function queuedResponse(requestId: string) {
  return {
    status: 'IN_QUEUE' as const,
    request_id: requestId,
    response_url: `https://queue.fal.run/requests/${requestId}`,
    status_url: `https://queue.fal.run/requests/${requestId}/status`,
    cancel_url: `https://queue.fal.run/requests/${requestId}/cancel`,
    queue_position: 0,
  };
}

function activeStatus(
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED',
  requestId: string,
  logs: Array<{ message: string; timestamp: string }> = []
) {
  const base = {
    status,
    request_id: requestId,
    response_url: `https://queue.fal.run/requests/${requestId}`,
    status_url: `https://queue.fal.run/requests/${requestId}/status`,
    cancel_url: `https://queue.fal.run/requests/${requestId}/cancel`,
  };
  if (status === 'IN_QUEUE') return { ...base, queue_position: 0 };
  return {
    ...base,
    logs: logs.map((log) => ({ ...log, level: 'INFO' as const, source: 'USER' as const })),
  };
}

describe('fal server adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('matches the installed SDK surface without making a network request', async () => {
    const actual = await vi.importActual<typeof import('@fal-ai/client')>('@fal-ai/client');
    const client = actual.createFalClient({ credentials: 'contract-test:dummy' });

    expect(client.queue).toEqual(
      expect.objectContaining({
        submit: expect.any(Function),
        status: expect.any(Function),
        result: expect.any(Function),
        cancel: expect.any(Function),
      })
    );
    expect(client.storage.upload).toEqual(expect.any(Function));
  });

  it.each(['502 response', 'transport failure'] as const)(
    'allows only one actual submit POST after a %s',
    async (failure) => {
      const actual = await vi.importActual<typeof import('@fal-ai/client')>('@fal-ai/client');
      const transport =
        failure === '502 response'
          ? vi.fn().mockImplementation(() =>
              Promise.resolve(
                new Response(JSON.stringify({ message: `upstream ${apiKey}` }), {
                  status: 502,
                  headers: { 'Content-Type': 'application/json' },
                })
              )
            )
          : vi.fn().mockRejectedValue(
              Object.assign(new TypeError(`fetch failed ${apiKey}`), {
                cause: { code: 'ECONNRESET' },
              })
            );
      vi.stubGlobal('fetch', transport);
      createFalClient.mockImplementation((config) =>
        actual.createFalClient({ ...config, suppressLocalCredentialsWarning: true })
      );
      vi.useFakeTimers();

      const outcome = submitFalTask(validSubmitArgs).catch((caught: unknown) => caught);
      await vi.runAllTimersAsync();
      const error = await outcome;

      expect(error).toBeInstanceOf(FalApiError);
      expect(error).toMatchObject({
        status: 502,
        message: 'fal is temporarily unavailable. Please try again.',
      });
      expect(String(error)).not.toContain(apiKey);
      expect(transport).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledWith(
        'https://queue.fal.run/fal-ai/nano-banana-2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Key ${apiKey}`,
            'x-fal-store-io': '0',
            'x-fal-object-lifecycle-preference': JSON.stringify({
              expiration_duration_seconds: 604800,
            }),
          }),
          body: JSON.stringify({
            prompt: 'A yellow banana',
            aspect_ratio: 'auto',
            resolution: '1K',
            enable_web_search: false,
          }),
        })
      );
    }
  );

  it('validates the key with the non-billable pricing endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateFalApiKey(apiKey)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fnano-banana-2',
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    expect(createFalClient).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'Your fal API key is invalid, revoked, or lacks access to this model.'],
    [403, 'Your fal API key is invalid, revoked, or lacks access to this model.'],
    [402, 'Your fal account needs additional credits.'],
    [422, 'fal rejected one or more model settings. Review the controls and try again.'],
    [429, 'fal is rate limiting requests. Please wait and try again.'],
    [500, 'fal is temporarily unavailable. Please try again.'],
    [503, 'fal is temporarily unavailable. Please try again.'],
    [400, 'fal could not complete that request.'],
  ])('maps key-validation status %i to a safe public error', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(`upstream body ${apiKey}`, { status }))
    );

    const error = await validateFalApiKey(apiKey).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FalApiError);
    expect(error).toMatchObject({ status, message });
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain('upstream body');
  });

  it('uploads with a fresh credential-scoped client and one-day lifecycle', async () => {
    const upload = vi.fn().mockResolvedValue('https://v3.fal.media/input.png');
    createFalClient.mockReturnValue({ storage: { upload } });
    const file = new File(['image'], 'input.png', { type: 'image/png' });

    await expect(uploadFalFile({ apiKey, file })).resolves.toBe(
      'https://v3.fal.media/input.png'
    );

    expect(createFalClient).toHaveBeenCalledOnce();
    expect(createFalClient).toHaveBeenCalledWith({ credentials: apiKey });
    expect(upload).toHaveBeenCalledWith(file, { lifecycle: { expiresIn: '1d' } });
  });

  it('submits only the catalog endpoint with allow-listed input and privacy settings', async () => {
    const submit = vi.fn().mockResolvedValue(queuedResponse('req_0123'));
    createFalClient.mockReturnValue({ queue: { submit } });

    await expect(
      submitFalTask({
        apiKey,
        modelId: 'veo-3-1-fast',
        mediaType: 'video',
        inputMode: 'text',
        prompt: '  A crane flying over a lake  ',
        uploadUrls: [],
        values: {
          duration: '8s',
          resolution: '720p',
          generate_audio: true,
          endpoint: 'attacker/endpoint',
        },
      })
    ).resolves.toEqual({ requestId: 'req_0123' });

    expect(createFalClient).toHaveBeenCalledWith({
      credentials: apiKey,
      fetch: expect.any(Function),
    });
    expect(submit).toHaveBeenCalledWith('fal-ai/veo3.1/fast', {
      input: {
        prompt: 'A crane flying over a lake',
        duration: '8s',
        resolution: '720p',
        generate_audio: true,
        aspect_ratio: '16:9',
      },
      headers: { 'X-Fal-Store-IO': '0' },
      storageSettings: { expiresIn: '7d' },
    });
  });

  it('normalizes the alternate submit requestId and rejects a missing identifier safely', async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ requestId: 'req_camel' })
      .mockResolvedValueOnce({ provider_message: `accepted with ${apiKey}` });
    createFalClient.mockReturnValue({ queue: { submit } });
    const args = {
      apiKey,
      modelId: 'nano-banana-2',
      mediaType: 'image' as const,
      inputMode: 'text' as const,
      prompt: 'A yellow banana',
      uploadUrls: [],
      values: {},
    };

    await expect(submitFalTask(args)).resolves.toEqual({ requestId: 'req_camel' });

    const error = await submitFalTask(args).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 502 });
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain('provider_message');
  });

  const attackerText = `attacker-controlled ${apiKey} raw provider failure body containing`;
  const invalidCatalogValues = [
    ['model', { modelId: attackerText }],
    ['media type', { mediaType: attackerText as never }],
    ['input mode', { inputMode: attackerText as never }],
  ] as const;
  const catalogOperations = [
    [
      'submit',
      (overrides: Record<string, unknown>) =>
        submitFalTask({
          apiKey,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'text',
          prompt: 'Do not submit invalid catalog values',
          uploadUrls: [],
          values: {},
          ...overrides,
        } as Parameters<typeof submitFalTask>[0]),
    ],
    [
      'status',
      (overrides: Record<string, unknown>) =>
        getFalTask({
          apiKey,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'text',
          requestId: 'req_invalid_catalog',
          ...overrides,
        } as Parameters<typeof getFalTask>[0]),
    ],
    [
      'cancel',
      (overrides: Record<string, unknown>) =>
        cancelFalTask({
          apiKey,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'text',
          requestId: 'req_invalid_catalog',
          ...overrides,
        } as Parameters<typeof cancelFalTask>[0]),
    ],
  ] as const;

  for (const [operation, call] of catalogOperations) {
    it.each(invalidCatalogValues)(
      `sanitizes an attacker-controlled %s before ${operation}`,
      async (_field, overrides) => {
        const sdkOperation = vi.fn().mockRejectedValue(falError(422));
        createFalClient.mockReturnValue({
          storage: { upload: sdkOperation },
          queue: {
            submit: sdkOperation,
            status: sdkOperation,
            result: sdkOperation,
            cancel: sdkOperation,
          },
        });

        const error = await call(overrides).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(FalApiError);
        expect(error).toMatchObject({
          status: 400,
          message: 'fal could not complete that request.',
        });
        expect(String(error)).not.toContain('attacker-controlled');
        expect(String(error)).not.toContain(apiKey);
        expect(String(error)).not.toContain('raw provider failure');
        expect(String(error)).not.toContain('body containing');
        expect(createFalClient).not.toHaveBeenCalled();
        expect(sdkOperation).not.toHaveBeenCalled();
      }
    );
  }

  const invalidRequestIds = [
    ['too short', 'short'],
    ['too long', 'r'.repeat(129)],
    ['traversal', '../../../other'],
    ['slash', 'request/other'],
    ['query', 'request_123?logs=1'],
    ['hash', 'request_123#other'],
    ['whitespace', 'request 123'],
  ] as const;
  const callerIdOperations = [
    [
      'status',
      (requestId: string) =>
        getFalTask({
          apiKey,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'text',
          requestId,
        }),
    ],
    [
      'cancel',
      (requestId: string) =>
        cancelFalTask({
          apiKey,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'text',
          requestId,
        }),
    ],
  ] as const;

  for (const [operation, call] of callerIdOperations) {
    it.each(invalidRequestIds)(`rejects a %s caller request ID before ${operation}`, async (_case, id) => {
      const sdkOperation = vi.fn();
      createFalClient.mockReturnValue({
        queue: { status: sdkOperation, cancel: sdkOperation },
      });

      const error = await call(id).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FalApiError);
      expect(error).toMatchObject({
        status: 400,
        message: 'fal could not complete that request.',
      });
      expect(String(error)).not.toContain(id);
      expect(createFalClient).not.toHaveBeenCalled();
      expect(sdkOperation).not.toHaveBeenCalled();
    });
  }

  it.each(invalidRequestIds)(
    'rejects a %s provider submit request ID without returning it',
    async (_case, id) => {
      const submit = vi.fn().mockResolvedValue(queuedResponse(id));
      createFalClient.mockReturnValue({ queue: { submit } });

      const error = await submitFalTask(validSubmitArgs).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FalApiError);
      expect(error).toMatchObject({
        status: 502,
        message: 'fal is temporarily unavailable. Please try again.',
      });
      expect(String(error)).not.toContain(id);
    }
  );

  it.each([
    ['IN_QUEUE', 'queued'],
    ['IN_PROGRESS', 'running'],
  ] as const)('maps %s status and documented logs to %s', async (status, state) => {
    const logs =
      status === 'IN_PROGRESS'
        ? [
            { message: 'Preparing request', timestamp: '2026-08-04T12:00:00.000Z' },
            { message: 'Rendering frame', timestamp: '2026-08-04T12:00:01.000Z' },
          ]
        : [];
    const queueStatus = vi.fn().mockResolvedValue(activeStatus(status, 'req_status', logs));
    createFalClient.mockReturnValue({ queue: { status: queueStatus } });

    await expect(
      getFalTask({
        apiKey,
        modelId: 'veo-3-1-fast',
        mediaType: 'video',
        inputMode: 'text',
        requestId: 'req_status',
      })
    ).resolves.toEqual({
      requestId: 'req_status',
      state,
      logs: logs.map((log) => log.message),
    });

    expect(createFalClient).toHaveBeenCalledWith({ credentials: apiKey });
    expect(queueStatus).toHaveBeenCalledWith('fal-ai/veo3.1/fast', {
      requestId: 'req_status',
      logs: true,
    });
  });

  it('fetches and normalizes the result for a completed image task', async () => {
    const status = vi.fn().mockResolvedValue(
      activeStatus('COMPLETED', 'req_image', [
        { message: 'Complete', timestamp: '2026-08-04T12:00:02.000Z' },
      ])
    );
    const result = vi.fn().mockResolvedValue({
      data: {
        images: [
          {
            url: 'https://v3.fal.media/output.png',
            content_type: 'image/png',
            width: 1024,
            height: 1024,
          },
        ],
      },
      requestId: 'req_image',
    });
    createFalClient.mockReturnValue({ queue: { status, result } });

    await expect(
      getFalTask({
        apiKey,
        modelId: 'nano-banana-2',
        mediaType: 'image',
        inputMode: 'text',
        requestId: 'req_image',
      })
    ).resolves.toEqual({
      requestId: 'req_image',
      state: 'success',
      logs: ['Complete'],
      resultUrl: 'https://v3.fal.media/output.png',
      mimeType: 'image/png',
    });

    expect(status).toHaveBeenCalledWith('fal-ai/nano-banana-2', {
      requestId: 'req_image',
      logs: true,
    });
    expect(result).toHaveBeenCalledWith('fal-ai/nano-banana-2', {
      requestId: 'req_image',
    });
  });

  it('normalizes a completed video result and rejects malformed results safely', async () => {
    const status = vi.fn().mockResolvedValue(activeStatus('COMPLETED', 'req_video'));
    const result = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          video: {
            url: 'https://v3.fal.media/output.mp4',
            content_type: 'video/mp4',
            file_size: 1234,
          },
        },
        requestId: 'req_video',
      })
      .mockResolvedValueOnce({ data: { provider_body: apiKey }, requestId: 'req_video' });
    createFalClient.mockReturnValue({ queue: { status, result } });
    const args = {
      apiKey,
      modelId: 'veo-3-1-fast',
      mediaType: 'video' as const,
      inputMode: 'text' as const,
      requestId: 'req_video',
    };

    await expect(getFalTask(args)).resolves.toMatchObject({
      state: 'success',
      resultUrl: 'https://v3.fal.media/output.mp4',
      mimeType: 'video/mp4',
    });

    const error = await getFalTask(args).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 502 });
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain('provider_body');
  });

  it.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:video/mp4;base64,AAAA'],
    ['insecure HTTP', 'http://v3.fal.media/output.mp4'],
    ['relative URL', '/files/output.mp4'],
    ['malformed URL', '::not a URL::'],
    ['credentials', 'https://user:password@v3.fal.media/output.mp4'],
    ['embedded whitespace', 'https://v3.fal.media/out put.mp4'],
    ['surrounding whitespace', ' https://v3.fal.media/output.mp4 '],
    ['non-fal host', 'https://example.com/output.mp4'],
    ['lookalike fal host', 'https://fal.media.example.com/output.mp4'],
  ])('rejects a result URL with %s', async (_case, url) => {
    const requestId = 'req_url_check';
    const status = vi.fn().mockResolvedValue(activeStatus('COMPLETED', requestId));
    const result = vi.fn().mockResolvedValue({
      data: { video: { url, content_type: 'video/mp4', file_size: 1234 } },
      requestId,
    });
    createFalClient.mockReturnValue({ queue: { status, result } });

    const error = await getFalTask({
      apiKey,
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'text',
      requestId,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FalApiError);
    expect(error).toMatchObject({
      status: 502,
      message: 'fal is temporarily unavailable. Please try again.',
    });
    expect(String(error)).not.toContain(url);
  });

  it('accepts a credential-free HTTPS result on the fal CDN', async () => {
    const requestId = 'req_safe_url';
    const status = vi.fn().mockResolvedValue(activeStatus('COMPLETED', requestId));
    const result = vi.fn().mockResolvedValue({
      data: {
        video: {
          url: 'https://fal.media/files/output.mp4',
          content_type: 'video/mp4',
          file_size: 1234,
        },
      },
      requestId,
    });
    createFalClient.mockReturnValue({ queue: { status, result } });

    await expect(
      getFalTask({
        apiKey,
        modelId: 'veo-3-1-fast',
        mediaType: 'video',
        inputMode: 'text',
        requestId,
      })
    ).resolves.toMatchObject({ resultUrl: 'https://fal.media/files/output.mp4' });
  });

  it('rejects missing request and result identifiers safely', async () => {
    const status = vi.fn().mockResolvedValue(activeStatus('COMPLETED', 'req_missing_result_id'));
    const result = vi.fn().mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/output.png', content_type: 'image/png' }] },
      requestId: '',
    });
    createFalClient.mockReturnValue({ queue: { status, result } });

    await expect(
      getFalTask({
        apiKey,
        modelId: 'nano-banana-2',
        mediaType: 'image',
        inputMode: 'text',
        requestId: '',
      })
    ).rejects.toMatchObject({ status: 400, message: 'fal could not complete that request.' });
    expect(createFalClient).not.toHaveBeenCalled();

    const error = await getFalTask({
      apiKey,
      modelId: 'nano-banana-2',
      mediaType: 'image',
      inputMode: 'text',
      requestId: 'req_missing_result_id',
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 502 });
    expect(String(error)).not.toContain('https://v3.fal.media/output.png');
  });

  it('resolves cancellation through the catalog with a fresh credential-scoped client', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    createFalClient.mockReturnValue({ queue: { cancel } });

    await expect(
      cancelFalTask({
        apiKey,
        modelId: 'veo-3-1-fast',
        mediaType: 'video',
        inputMode: 'image',
        requestId: 'req_cancel',
      })
    ).resolves.toBeUndefined();

    expect(createFalClient).toHaveBeenCalledOnce();
    expect(createFalClient).toHaveBeenCalledWith({ credentials: apiKey });
    expect(cancel).toHaveBeenCalledWith('fal-ai/veo3.1/fast/image-to-video', {
      requestId: 'req_cancel',
    });
  });

  it('creates a fresh client for every SDK operation instead of sharing credentials', async () => {
    const upload = vi.fn().mockResolvedValue('https://v3.fal.media/input.png');
    const submit = vi.fn().mockResolvedValue(queuedResponse('req_fresh'));
    const status = vi.fn().mockResolvedValue(activeStatus('IN_QUEUE', 'req_fresh'));
    const cancel = vi.fn().mockResolvedValue(undefined);
    createFalClient.mockReturnValue({ storage: { upload }, queue: { submit, status, cancel } });

    await uploadFalFile({ apiKey: 'key:one', file: new File(['1'], 'one.png') });
    await submitFalTask({
      apiKey: 'key:two',
      modelId: 'nano-banana-2',
      mediaType: 'image',
      inputMode: 'text',
      prompt: 'Banana',
      uploadUrls: [],
      values: {},
    });
    await getFalTask({
      apiKey: 'key:three',
      modelId: 'nano-banana-2',
      mediaType: 'image',
      inputMode: 'text',
      requestId: 'req_fresh',
    });
    await cancelFalTask({
      apiKey: 'key:four',
      modelId: 'nano-banana-2',
      mediaType: 'image',
      inputMode: 'text',
      requestId: 'req_fresh',
    });

    expect(createFalClient.mock.calls).toEqual([
      [{ credentials: 'key:one' }],
      [{ credentials: 'key:two', fetch: expect.any(Function) }],
      [{ credentials: 'key:three' }],
      [{ credentials: 'key:four' }],
    ]);
  });

  it.each([
    [401, 'Your fal API key is invalid, revoked, or lacks access to this model.'],
    [403, 'Your fal API key is invalid, revoked, or lacks access to this model.'],
    [402, 'Your fal account needs additional credits.'],
    [422, 'fal rejected one or more model settings. Review the controls and try again.'],
    [429, 'fal is rate limiting requests. Please wait and try again.'],
    [502, 'fal is temporarily unavailable. Please try again.'],
  ])('maps SDK status %i without exposing provider data', async (status, message) => {
    const submit = vi.fn().mockRejectedValue(falError(status));
    createFalClient.mockReturnValue({ queue: { submit } });

    const error = await submitFalTask({
      apiKey,
      modelId: 'nano-banana-2',
      mediaType: 'image',
      inputMode: 'text',
      prompt: 'Banana',
      uploadUrls: [],
      values: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FalApiError);
    expect(error).toMatchObject({ status, message });
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain('raw provider failure');
    expect(String(error)).not.toContain('body containing');
  });

  it('normalizes network and arbitrary SDK exceptions to a safe 502 error', async () => {
    const upload = vi.fn().mockRejectedValue(new Error(`socket failed for Key ${apiKey}`));
    createFalClient.mockReturnValue({ storage: { upload } });

    const error = await uploadFalFile({
      apiKey,
      file: new File(['image'], 'input.png'),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FalApiError);
    expect(error).toMatchObject({
      status: 502,
      message: 'fal is temporarily unavailable. Please try again.',
    });
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain('socket failed');
  });
});
