// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { geminiGenerate } from '@/lib/engines/gemini';
import { POST } from '@/app/api/generate/route';

const IMAGE_RESPONSE = {
  candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
  usageMetadata: { promptTokenCount: 560, candidatesTokenCount: 1120 },
};

afterEach(() => generateContent.mockReset());

describe('geminiGenerate usage', () => {
  it('reports prompt and output tokens from usageMetadata', async () => {
    generateContent.mockResolvedValue(IMAGE_RESPONSE);
    const result = await geminiGenerate({ prompt: 'a banana', apiKey: 'k' });
    expect(result.usage).toEqual({ promptTokens: 560, outputTokens: 1120 });
  });

  it('omits usage when the response has no metadata', async () => {
    generateContent.mockResolvedValue({ candidates: IMAGE_RESPONSE.candidates });
    const result = await geminiGenerate({ prompt: 'a banana', apiKey: 'k' });
    expect(result.usage).toBeUndefined();
  });
});

describe('POST /api/generate — Gemini', () => {
  it('passes usage through to the client', async () => {
    generateContent.mockResolvedValue(IMAGE_RESPONSE);
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'gemini', prompt: 'a banana', apiKey: 'k', config: {} }),
      }) as never
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      imageData: 'AAAA',
      usage: { promptTokens: 560, outputTokens: 1120 },
    });
  });
});
