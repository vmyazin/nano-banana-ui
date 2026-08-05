// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isMicroAiConfigured, runMicroTask } from '../../lib/micro-ai/server';
import { slugTask } from '../../lib/micro-ai/tasks';

const TOKEN = 'hf_secret_token';

function completion(content: string, usage?: Record<string, number>) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: usage ?? { prompt_tokens: 120, completion_tokens: 8 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('runMicroTask', () => {
  beforeEach(() => {
    process.env.HF_TOKEN = TOKEN;
    delete process.env.HF_BASE_URL;
  });

  afterEach(() => {
    delete process.env.HF_TOKEN;
    delete process.env.HF_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('reports configuration from the presence of a non-blank token', () => {
    expect(isMicroAiConfigured()).toBe(true);
    process.env.HF_TOKEN = '   ';
    expect(isMicroAiConfigured()).toBe(false);
  });

  it('sends system and user as separate roles and returns validated output with cost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('cyberpunk-neon-purple-alley'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runMicroTask(slugTask('Cyberpunk neon alley with glowing purple rain'));

    expect(result?.value).toBe('cyberpunk-neon-purple-alley');
    expect(result?.model).toBe('meta-llama/Llama-3.1-8B-Instruct');
    expect(result?.usage).toEqual({
      promptTokens: 120,
      completionTokens: 8,
      // 128 tokens on the micro tier at $0.02 / 1M.
      costUsd: (120 / 1_000_000) * 0.02 + (8 / 1_000_000) * 0.02,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('meta-llama/Llama-3.1-8B-Instruct');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: 'Cyberpunk neon alley with glowing purple rain',
    });
    expect(body.max_tokens).toBe(30);
    expect(body.temperature).toBe(0.1);
  });

  it('returns null without calling out when no token is configured', async () => {
    delete process.env.HF_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await runMicroTask(slugTask('A quiet ocean'))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-2xx response', () => Promise.resolve(new Response('nope', { status: 503 }))],
    ['a network failure', () => Promise.reject(new Error('ECONNRESET'))],
    ['an empty completion', () => Promise.resolve(completion('   '))],
    ['output the validator rejects', () => Promise.resolve(completion('!!!'))],
    ['a malformed body', () => Promise.resolve(new Response('not json', { status: 200 }))],
  ])('falls back to null on %s', async (_label, impl) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(impl));
    expect(await runMicroTask(slugTask('A quiet ocean at dusk'))).toBeNull();
  });

  it('truncates an oversized prompt instead of billing for it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('long-prompt-becomes-short'));
    vi.stubGlobal('fetch', fetchMock);

    await runMicroTask(slugTask('a'.repeat(5_000)));

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages[1].content).toHaveLength(2_000);
  });

  it('aborts a hung request rather than hanging the caller', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
          })
      );
      vi.stubGlobal('fetch', fetchMock);

      const pending = runMicroTask(slugTask('A quiet ocean at dusk'));
      await vi.advanceTimersByTimeAsync(8_000);

      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours a base URL override', async () => {
    process.env.HF_BASE_URL = 'https://example.test/v1/chat/completions';
    const fetchMock = vi.fn().mockResolvedValue(completion('quiet-ocean-at-dusk'));
    vi.stubGlobal('fetch', fetchMock);

    await runMicroTask(slugTask('A quiet ocean at dusk'));

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/v1/chat/completions');
  });
});
