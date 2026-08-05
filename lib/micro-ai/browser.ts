import { SEED_TONES } from '@/lib/example-prompts';
import type { MicroAiUsageReport } from '@/lib/micro-ai/types';
import { useMicroAiUsageStore } from '@/store/useMicroAiUsageStore';

/**
 * Browser-side entry points for the micro-task routes. Both record any usage
 * the server reports so the Connections panel can show what the session cost.
 */

function isUsageReport(value: unknown): value is MicroAiUsageReport {
  const usage = value as MicroAiUsageReport | undefined;
  return (
    !!usage &&
    typeof usage.promptTokens === 'number' &&
    typeof usage.completionTokens === 'number' &&
    typeof usage.costUsd === 'number'
  );
}

function recordUsage(value: unknown) {
  if (isUsageReport(value)) useMicroAiUsageStore.getState().record(value);
}

/**
 * Short evocative filename slug for a prompt. The route always answers — it
 * falls back to a regex slugifier — so this only returns null when the request
 * itself fails, which leaves the caller's own fallback in charge.
 */
export async function requestPromptSlug(
  prompt: string,
  apiKey: string,
  options: { signal?: AbortSignal } = {}
): Promise<string | null> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return null;

  try {
    const response = await fetch('/api/slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: trimmedPrompt, apiKey }),
      signal: options.signal,
    });
    const data = (await response.json()) as { slug?: string; usage?: unknown };
    if (!response.ok || typeof data.slug !== 'string') return null;
    recordUsage(data.usage);
    return data.slug || null;
  } catch {
    return null;
  }
}

/**
 * Fresh, feature-tailored example prompt. Picks the variety seed so every
 * caller behaves the same. Throws with the route's message when neither the
 * shared tier nor the user's own key can serve it.
 */
export async function requestExamplePrompt(featureId: string, apiKey: string): Promise<string> {
  const seed = SEED_TONES[Math.floor(Math.random() * SEED_TONES.length)];
  const response = await fetch('/api/example', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featureId, apiKey, seed }),
  });
  const data = (await response.json()) as { prompt?: string; error?: string; usage?: unknown };
  if (!response.ok || !data.prompt) {
    throw new Error(data.error || 'Could not generate an example prompt.');
  }
  recordUsage(data.usage);
  return data.prompt;
}
