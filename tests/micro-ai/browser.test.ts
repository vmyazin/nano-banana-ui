import { beforeEach, describe, expect, it, vi } from 'vitest';

import { describeMicroTask, requestPromptSlug } from '../../lib/micro-ai/browser';
import { useMicroAiUsageStore } from '../../store/useMicroAiUsageStore';

describe('describeMicroTask', () => {
  it('names the shared-tier model and what the call cost', () => {
    expect(
      describeMicroTask('slug', {
        source: 'micro-ai',
        model: 'meta-llama/Llama-3.1-8B-Instruct',
        usage: { promptTokens: 120, completionTokens: 8, costUsd: 0.00000256 },
      })
    ).toBe('[micro-ai] slug → Llama-3.1-8B-Instruct (shared tier) · 128 tokens · ~$0.000003');
  });

  it('names the Gemini fallback, which reports no token counts', () => {
    expect(
      describeMicroTask('example', { source: 'gemini', model: 'gemini-2.5-flash-lite' })
    ).toBe('[micro-ai] example → gemini-2.5-flash-lite (your Gemini key)');
  });

  it('says plainly when no model was involved at all', () => {
    expect(describeMicroTask('slug', { source: 'deterministic' })).toBe(
      '[micro-ai] slug → no model — deterministic fallback'
    );
  });
});

describe('requestPromptSlug usage accounting', () => {
  beforeEach(() => {
    useMicroAiUsageStore.getState().reset();
  });

  it('accumulates reported usage and remembers the model that served it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          slug: 'quiet-ocean-at-dusk',
          source: 'micro-ai',
          model: 'meta-llama/Llama-3.1-8B-Instruct',
          usage: { promptTokens: 100, completionTokens: 10, costUsd: 0.0000022 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ));

    expect(await requestPromptSlug('A quiet ocean at dusk', '')).toBe('quiet-ocean-at-dusk');

    const state = useMicroAiUsageStore.getState();
    expect(state.requests).toBe(1);
    expect(state.promptTokens).toBe(100);
    expect(state.completionTokens).toBe(10);
    expect(state.costUsd).toBe(0.0000022);
    expect(state.lastModel).toBe('meta-llama/Llama-3.1-8B-Instruct');
  });

  it('records nothing when a fallback served the request for free', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: 'a-quiet-ocean', source: 'deterministic' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));

    expect(await requestPromptSlug('A quiet ocean at dusk', '')).toBe('a-quiet-ocean');
    expect(useMicroAiUsageStore.getState().requests).toBe(0);
  });
});
