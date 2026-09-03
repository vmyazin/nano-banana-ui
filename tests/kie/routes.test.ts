import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { validateKieApiKey, uploadKieFile, createKieTask, getKieTask } = vi.hoisted(() => ({
  validateKieApiKey: vi.fn(),
  uploadKieFile: vi.fn(),
  createKieTask: vi.fn(),
  getKieTask: vi.fn(),
}));

vi.mock('../../lib/kie/server', () => ({ validateKieApiKey, uploadKieFile }));
vi.mock('../../lib/kie/client', () => ({ createKieTask, getKieTask }));

import { POST as validatePost } from '../../app/api/kie/validate/route';
import { POST as uploadPost } from '../../app/api/kie/upload/route';
import { POST as generatePost } from '../../app/api/generate/route';
import { POST as creditsPost } from '../../app/api/kie/credits/route';

describe('Kie API routes', () => {
  afterEach(() => vi.clearAllMocks());

  it('validates a Kie key without creating media', async () => {
    validateKieApiKey.mockResolvedValue({ credits: 37 });
    const request = new Request('http://localhost/api/kie/validate', {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'kie_test_key' }),
    });

    const response = await validatePost(request as NextRequest);

    await expect(response.json()).resolves.toEqual({ success: true, credits: 37 });
    expect(validateKieApiKey).toHaveBeenCalledWith('kie_test_key');
  });

  it('uploads the submitted source file through the authenticated Kie route', async () => {
    uploadKieFile.mockResolvedValue('https://tempfile.redpandaai.co/source.png');
    const file = new File(['source'], 'source.png', { type: 'image/png' });
    const formData = new Map<string, FormDataEntryValue>([
      ['apiKey', 'kie_test_key'],
      ['file', file],
    ]);

    const response = await uploadPost(
      { formData: async () => formData } as unknown as NextRequest
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      url: 'https://tempfile.redpandaai.co/source.png',
    });
  });

  it('submits and polls Kie tasks through the existing generation endpoint', async () => {
    createKieTask.mockResolvedValue({ taskId: 'task_123', protocol: 'market' });
    getKieTask.mockResolvedValue({
      taskId: 'task_123',
      state: 'generating',
      progress: 0.5,
      resultUrls: [],
    });

    const submit = await generatePost(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          engine: 'kie',
          operation: 'submit',
          apiKey: 'kie_test_key',
          modelId: 'nano-banana-pro',
          inputMode: 'text',
          prompt: 'An editorial banana still life',
          uploadUrls: [],
          values: { aspect_ratio: '1:1' },
        }),
      }) as NextRequest
    );
    const status = await generatePost(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          engine: 'kie',
          operation: 'status',
          apiKey: 'kie_test_key',
          protocol: 'market',
          taskId: 'task_123',
        }),
      }) as NextRequest
    );

    await expect(submit.json()).resolves.toEqual({ success: true, taskId: 'task_123', protocol: 'market' });
    await expect(status.json()).resolves.toMatchObject({ success: true, task: { state: 'generating', progress: 0.5 } });
    expect(createKieTask).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'kie_test_key',
        prompt: 'An editorial banana still life',
        values: { aspect_ratio: '1:1' },
      })
    );
  });

  it('reads the credit balance without validating anything else', async () => {
    validateKieApiKey.mockResolvedValue({ credits: 940 });
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({ apiKey: 'kie_test_key' }) }) as NextRequest
    );
    await expect(response.json()).resolves.toEqual({ success: true, credits: 940 });
  });

  it('answers 200 with a null balance when Kie fails', async () => {
    validateKieApiKey.mockRejectedValue(new Error('down'));
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({ apiKey: 'kie_test_key' }) }) as NextRequest
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, credits: null });
  });

  it('rejects a credits request without a key', async () => {
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({}) }) as NextRequest
    );
    expect(response.status).toBe(400);
  });
});
