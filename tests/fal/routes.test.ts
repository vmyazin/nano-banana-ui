// @vitest-environment node

import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  FalApiError,
  validateFalApiKey,
  uploadFalFile,
  submitFalTask,
  getFalTask,
  cancelFalTask,
} = vi.hoisted(() => ({
  FalApiError: class FalApiError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
  validateFalApiKey: vi.fn(),
  uploadFalFile: vi.fn(),
  submitFalTask: vi.fn(),
  getFalTask: vi.fn(),
  cancelFalTask: vi.fn(),
}));

vi.mock('../../lib/fal/server', () => ({
  FalApiError,
  validateFalApiKey,
  uploadFalFile,
  submitFalTask,
  getFalTask,
  cancelFalTask,
}));

import { POST as queuePost } from '../../app/api/fal/queue/route';
import { POST as uploadPost } from '../../app/api/fal/upload/route';
import { POST as validatePost } from '../../app/api/fal/validate/route';

function jsonRequest(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as NextRequest;
}

function formRequest(entries: Array<[string, string | Blob]>): NextRequest {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return new Request('http://localhost/api/fal/upload', {
    method: 'POST',
    body: form,
  }) as NextRequest;
}

const submitBody = {
  operation: 'submit',
  apiKey: 'id:secret',
  modelId: 'wan-2-7',
  mediaType: 'video',
  inputMode: 'text',
  prompt: 'A storm over the desert',
  uploadUrls: [],
  values: { duration: 5, resolution: '1080p' },
};

const taskBody = {
  apiKey: 'id:secret',
  modelId: 'wan-2-7',
  mediaType: 'video',
  inputMode: 'text',
  requestId: 'req_wan_1234',
};

describe('fal API routes', () => {
  afterEach(() => vi.clearAllMocks());

  describe('validate', () => {
    it('rejects an oversized declared body before parsing JSON', async () => {
      const json = vi.fn().mockResolvedValue({ apiKey: 'id:secret' });
      const response = await validatePost({
        headers: new Headers({ 'content-length': String(4 * 1024 + 1) }),
        json,
      } as unknown as NextRequest);

      expect(response.status).toBe(413);
      expect(json).not.toHaveBeenCalled();
      expect(validateFalApiKey).not.toHaveBeenCalled();
    });

    it('validates an API key and returns no provider data', async () => {
      validateFalApiKey.mockResolvedValue(undefined);

      const response = await validatePost(jsonRequest('/api/fal/validate', { apiKey: 'id:secret' }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(validateFalApiKey).toHaveBeenCalledWith('id:secret');
    });

    it.each([{}, { apiKey: '' }, { apiKey: '   ' }, { apiKey: 42 }])(
      'rejects an invalid key before calling the adapter: %j',
      async (body) => {
        const response = await validatePost(jsonRequest('/api/fal/validate', body));

        expect(response.status).toBe(400);
        expect(validateFalApiKey).not.toHaveBeenCalled();
      }
    );

    it('bounds the API key after parsing when Content-Length is unavailable', async () => {
      validateFalApiKey.mockResolvedValue(undefined);
      const response = await validatePost({
        headers: new Headers(),
        json: async () => ({ apiKey: 'k'.repeat(1025) }),
      } as unknown as NextRequest);

      expect(response.status).toBe(400);
      expect(validateFalApiKey).not.toHaveBeenCalled();
    });

    it('returns a safe 400 for malformed JSON', async () => {
      const response = await validatePost(
        new Request('http://localhost/api/fal/validate', {
          method: 'POST',
          body: '{not-json',
        }) as NextRequest
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'The request body must be valid JSON.',
      });
      expect(validateFalApiKey).not.toHaveBeenCalled();
    });
  });

  describe('upload', () => {
    it('rejects an oversized declared multipart body before parsing it', async () => {
      const formData = vi.fn();
      const response = await uploadPost({
        headers: new Headers({ 'content-length': String(21 * 1024 * 1024 + 1) }),
        formData,
      } as unknown as NextRequest);

      expect(response.status).toBe(413);
      expect(formData).not.toHaveBeenCalled();
      expect(uploadFalFile).not.toHaveBeenCalled();
    });

    it('uploads a File and returns only its URL', async () => {
      uploadFalFile.mockResolvedValue('https://fal.media/source.png');

      const response = await uploadPost(
        formRequest([
          ['apiKey', 'id:secret'],
          ['file', new File(['source'], 'source.png', { type: 'image/png' })],
        ])
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        url: 'https://fal.media/source.png',
      });
      expect(uploadFalFile).toHaveBeenCalledWith({
        apiKey: 'id:secret',
        file: expect.objectContaining({ name: 'source.png', size: 6, type: 'image/png' }),
      });
    });

    it.each([
      { entries: [['file', 'not-a-file']] },
      {
        entries: [
          ['apiKey', '   '],
          ['file', 'not-a-file'],
        ],
      },
      { entries: [['apiKey', 'id:secret']] },
      {
        entries: [
          ['apiKey', 'id:secret'],
          ['file', 'not-a-file'],
        ],
      },
    ] as Array<{ entries: Array<[string, string | Blob]> }>)(
      'rejects invalid multipart fields before calling the adapter',
      async ({ entries }) => {
        const response = await uploadPost(formRequest(entries));

        expect(response.status).toBe(400);
        expect(uploadFalFile).not.toHaveBeenCalled();
      }
    );

    it('returns a safe 400 for an unreadable multipart body', async () => {
      const response = await uploadPost({
        formData: async () => {
          throw new TypeError('boundary contained secret=id:secret');
        },
      } as unknown as NextRequest);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'The request body must be valid multipart form data.',
      });
      expect(uploadFalFile).not.toHaveBeenCalled();
    });

    it('rejects an unsupported file MIME type from real multipart parsing', async () => {
      const response = await uploadPost(
        formRequest([
          ['apiKey', 'id:secret'],
          ['file', new File(['plain text'], 'source.txt', { type: 'text/plain' })],
        ])
      );

      expect(response.status).toBe(415);
      expect(uploadFalFile).not.toHaveBeenCalled();
    });

    it('rejects a source file larger than 20 MiB', async () => {
      const response = await uploadPost(
        formRequest([
          ['apiKey', 'id:secret'],
          [
            'file',
            new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'source.png', {
              type: 'image/png',
            }),
          ],
        ])
      );

      expect(response.status).toBe(413);
      expect(uploadFalFile).not.toHaveBeenCalled();
    });

    it('bounds the multipart API key after parsing', async () => {
      const response = await uploadPost(
        formRequest([
          ['apiKey', 'k'.repeat(1025)],
          ['file', 'not-a-file'],
        ])
      );

      expect(response.status).toBe(400);
      expect(uploadFalFile).not.toHaveBeenCalled();
    });
  });

  describe('queue', () => {
    it('rejects an oversized declared JSON body before parsing it', async () => {
      const json = vi.fn().mockResolvedValue(submitBody);
      const response = await queuePost({
        headers: new Headers({ 'content-length': String(64 * 1024 + 1) }),
        json,
      } as unknown as NextRequest);

      expect(response.status).toBe(413);
      expect(json).not.toHaveBeenCalled();
      expect(submitFalTask).not.toHaveBeenCalled();
    });

    it('submits only allow-listed, validated fields', async () => {
      submitFalTask.mockResolvedValue({ requestId: 'req_wan_1234' });

      const response = await queuePost(
        jsonRequest('/api/fal/queue', {
          ...submitBody,
          endpointId: 'attacker/model',
          endpointUrl: 'https://attacker.example/steal',
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, requestId: 'req_wan_1234' });
      expect(submitFalTask).toHaveBeenCalledWith({
        apiKey: 'id:secret',
        modelId: 'wan-2-7',
        mediaType: 'video',
        inputMode: 'text',
        prompt: 'A storm over the desert',
        uploadUrls: [],
        values: { duration: 5, resolution: '1080p' },
      });
    });

    it.each([
      {},
      { operation: 'discover' },
      { operation: 'SUBMIT' },
      { operation: 1 },
    ])('rejects unsupported operations before calling an adapter: %j', async (body) => {
      const response = await queuePost(jsonRequest('/api/fal/queue', body));

      expect(response.status).toBe(400);
      expect(submitFalTask).not.toHaveBeenCalled();
      expect(getFalTask).not.toHaveBeenCalled();
      expect(cancelFalTask).not.toHaveBeenCalled();
    });

    it.each([
      { ...submitBody, apiKey: '' },
      { ...submitBody, apiKey: 1 },
      { ...submitBody, modelId: '' },
      { ...submitBody, modelId: null },
      { ...submitBody, mediaType: 'audio' },
      { ...submitBody, inputMode: 'video' },
      { ...submitBody, prompt: '' },
      { ...submitBody, prompt: false },
      { ...submitBody, uploadUrls: 'https://fal.media/source.png' },
      { ...submitBody, uploadUrls: [1] },
      { ...submitBody, values: null },
      { ...submitBody, values: [] },
      { ...submitBody, values: { nested: { secret: true } } },
      { ...submitBody, values: { nullable: null } },
    ])('rejects an invalid submit body before calling the adapter', async (body) => {
      const response = await queuePost(jsonRequest('/api/fal/queue', body));

      expect(response.status).toBe(400);
      expect(submitFalTask).not.toHaveBeenCalled();
    });

    it('accepts string, finite number, and boolean values', async () => {
      submitFalTask.mockResolvedValue({ requestId: 'request_12345678' });
      const body = {
        ...submitBody,
        values: { text: 'value', count: 3.5, enabled: false },
      };

      const response = await queuePost(jsonRequest('/api/fal/queue', body));

      expect(response.status).toBe(200);
      expect(submitFalTask).toHaveBeenCalledWith(expect.objectContaining({ values: body.values }));
    });

    it.each([
      {
        name: 'image mode without a reference',
        body: {
          ...submitBody,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'image',
          uploadUrls: [],
          values: {},
        },
      },
      {
        name: 'Nano edit with more than 14 references',
        body: {
          ...submitBody,
          modelId: 'nano-banana-2',
          mediaType: 'image',
          inputMode: 'image',
          uploadUrls: Array.from({ length: 15 }, (_, index) => `https://fal.media/${index}.png`),
          values: {},
        },
      },
      { name: 'an unknown model', body: { ...submitBody, modelId: 'unknown-model' } },
      {
        name: 'an incompatible model and media type',
        body: { ...submitBody, modelId: 'nano-banana-2', mediaType: 'video' },
      },
      {
        name: 'references supplied to text mode',
        body: { ...submitBody, uploadUrls: ['https://fal.media/reference.png'] },
      },
    ])('rejects $name before calling the billable adapter', async ({ body }) => {
      submitFalTask.mockResolvedValue({ requestId: 'request_12345678' });

      const response = await queuePost(jsonRequest('/api/fal/queue', body));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'The selected fal request is not supported.',
      });
      expect(submitFalTask).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'API key length', body: { ...submitBody, apiKey: 'k'.repeat(1025) }, status: 400 },
      { name: 'model ID length', body: { ...submitBody, modelId: 'm'.repeat(129) }, status: 400 },
      { name: 'prompt length', body: { ...submitBody, prompt: 'p'.repeat(20_001) }, status: 413 },
      {
        name: 'upload URL count',
        body: {
          ...submitBody,
          uploadUrls: Array.from({ length: 17 }, (_, index) => `https://fal.media/${index}.png`),
        },
        status: 413,
      },
      {
        name: 'individual upload URL length',
        body: { ...submitBody, uploadUrls: [`https://fal.media/${'u'.repeat(4097)}`] },
        status: 413,
      },
      {
        name: 'values entry count',
        body: {
          ...submitBody,
          values: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`key${index}`, true])),
        },
        status: 413,
      },
      {
        name: 'value key length',
        body: { ...submitBody, values: { ['k'.repeat(129)]: true } },
        status: 413,
      },
      {
        name: 'string value length',
        body: { ...submitBody, values: { negative_prompt: 'v'.repeat(4097) } },
        status: 413,
      },
    ])('bounds $name after parsing', async ({ body, status }) => {
      submitFalTask.mockResolvedValue({ requestId: 'request_12345678' });

      const response = await queuePost({
        headers: new Headers(),
        json: async () => body,
      } as unknown as NextRequest);

      expect(response.status).toBe(status);
      expect(submitFalTask).not.toHaveBeenCalled();
    });

    it('rejects non-finite numeric values before the adapter', async () => {
      const response = await queuePost({
        headers: new Headers(),
        json: async () => ({ ...submitBody, values: { duration: Number.POSITIVE_INFINITY } }),
      } as unknown as NextRequest);

      expect(response.status).toBe(400);
      expect(submitFalTask).not.toHaveBeenCalled();
    });

    it.each(['status', 'cancel'] as const)('passes catalog and request IDs only for %s', async (operation) => {
      getFalTask.mockResolvedValue({ requestId: 'req_wan_1234', state: 'queued', logs: [] });
      const response = await queuePost(
        jsonRequest('/api/fal/queue', {
          operation,
          ...taskBody,
          endpointId: 'attacker/model',
          endpointUrl: 'https://attacker.example/steal',
        })
      );
      const expectedArgs = {
        apiKey: 'id:secret',
        modelId: 'wan-2-7',
        mediaType: 'video',
        inputMode: 'text',
        requestId: 'req_wan_1234',
      };

      expect(response.status).toBe(200);
      if (operation === 'status') {
        await expect(response.json()).resolves.toEqual({
          success: true,
          task: { requestId: 'req_wan_1234', state: 'queued', logs: [] },
        });
        expect(getFalTask).toHaveBeenCalledWith(expectedArgs);
      } else {
        await expect(response.json()).resolves.toEqual({ success: true });
        expect(cancelFalTask).toHaveBeenCalledWith(expectedArgs);
      }
    });

    it.each(['short', 'a'.repeat(129), 'request id', '../request', 'req/uest123', 'request?x', 'request#x'])
      ('rejects an invalid request ID before calling the adapter', async (requestId) => {
        const response = await queuePost(
          jsonRequest('/api/fal/queue', { operation: 'status', ...taskBody, requestId })
        );

        expect(response.status).toBe(400);
        expect(getFalTask).not.toHaveBeenCalled();
      });

    it.each([
      { ...taskBody, apiKey: '' },
      { ...taskBody, modelId: '' },
      { ...taskBody, mediaType: 'audio' },
      { ...taskBody, inputMode: 'video' },
    ])('rejects invalid status/cancel fields before calling adapters', async (fields) => {
      for (const operation of ['status', 'cancel']) {
        const response = await queuePost(jsonRequest('/api/fal/queue', { operation, ...fields }));
        expect(response.status).toBe(400);
      }
      expect(getFalTask).not.toHaveBeenCalled();
      expect(cancelFalTask).not.toHaveBeenCalled();
    });

    it('returns a safe 400 for malformed JSON', async () => {
      const response = await queuePost(
        new Request('http://localhost/api/fal/queue', { method: 'POST', body: '{not-json' }) as NextRequest
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: 'The request body must be valid JSON.',
      });
    });
  });

  it.each([
    ['validate', validateFalApiKey, () => validatePost(jsonRequest('/api/fal/validate', { apiKey: 'id:secret' }))],
    [
      'upload',
      uploadFalFile,
      () => uploadPost(formRequest([
        ['apiKey', 'id:secret'],
        ['file', new File(['source'], 'source.png', { type: 'image/png' })],
      ])),
    ],
    ['queue', submitFalTask, () => queuePost(jsonRequest('/api/fal/queue', submitBody))],
  ] as const)('propagates safe FalApiError responses from %s', async (_name, adapter, callRoute) => {
    adapter.mockRejectedValue(new FalApiError('fal is rate limiting requests. Please wait and try again.', 429));

    const response = await callRoute();

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'fal is rate limiting requests. Please wait and try again.',
    });
  });

  it.each([
    ['validate', validateFalApiKey, () => validatePost(jsonRequest('/api/fal/validate', { apiKey: 'id:secret' }))],
    [
      'upload',
      uploadFalFile,
      () => uploadPost(formRequest([
        ['apiKey', 'id:secret'],
        ['file', new File(['source'], 'source.png', { type: 'image/png' })],
      ])),
    ],
    ['queue', submitFalTask, () => queuePost(jsonRequest('/api/fal/queue', submitBody))],
  ] as const)('hides unexpected errors from %s', async (_name, adapter, callRoute) => {
    adapter.mockRejectedValue(new Error('secret=id:secret raw upstream body'));

    const response = await callRoute();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Something went wrong while contacting fal.',
    });
  });
});
