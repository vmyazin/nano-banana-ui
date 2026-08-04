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

function formRequest(entries: Array<[string, FormDataEntryValue]>): NextRequest {
  const form = new Map<string, FormDataEntryValue>(entries);
  return { formData: async () => form } as unknown as NextRequest;
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
    it('uploads a File and returns only its URL', async () => {
      uploadFalFile.mockResolvedValue('https://fal.media/source.png');
      const file = new File(['source'], 'source.png', { type: 'image/png' });

      const response = await uploadPost(
        formRequest([
          ['apiKey', 'id:secret'],
          ['file', file],
        ])
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        url: 'https://fal.media/source.png',
      });
      expect(uploadFalFile).toHaveBeenCalledWith({ apiKey: 'id:secret', file });
    });

    it.each([
      { entries: [['file', new File(['source'], 'source.png')]] },
      {
        entries: [
          ['apiKey', '   '],
          ['file', new File(['source'], 'source.png')],
        ],
      },
      { entries: [['apiKey', 'id:secret']] },
      {
        entries: [
          ['apiKey', 'id:secret'],
          ['file', 'not-a-file'],
        ],
      },
    ] as Array<{ entries: Array<[string, FormDataEntryValue]> }>)(
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
  });

  describe('queue', () => {
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
        ['file', new File(['source'], 'source.png')],
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
        ['file', new File(['source'], 'source.png')],
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
