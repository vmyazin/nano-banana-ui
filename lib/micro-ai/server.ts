import { MICRO_AI_MODELS, readUsage, type MicroAiUsage } from '@/lib/micro-ai/models';
import type { MicroAiTask } from '@/lib/micro-ai/tasks';

/**
 * Server-only client for the OpenAI-compatible Hugging Face router.
 *
 * The token is an app-owned server secret and never reaches the browser, nor do
 * provider error bodies: every failure collapses to `null` so callers fall back
 * to Gemini or a deterministic result instead of surfacing upstream detail.
 */
const DEFAULT_BASE_URL = 'https://router.huggingface.co/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 8_000;
/** Micro-tasks summarize short prompts; anything longer is truncated, not billed. */
const MAX_USER_CHARS = 2_000;

export function microAiToken(): string {
  return process.env.HF_TOKEN?.trim() ?? '';
}

/** True when the deployment has an app-owned token configured. */
export function isMicroAiConfigured(): boolean {
  return microAiToken().length > 0;
}

function baseUrl(): string {
  return process.env.HF_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export interface MicroAiResult<T> {
  value: T;
  usage: MicroAiUsage;
  model: string;
}

function firstMessageText(payload: unknown): string {
  const choices = (payload as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Run one micro-task. Resolves to `null` for every failure mode — unconfigured,
 * network error, timeout, non-2xx, empty completion, or output the task's own
 * validator rejects — so the caller always has a single fallback branch.
 */
export async function runMicroTask<T>(task: MicroAiTask<T>): Promise<MicroAiResult<T> | null> {
  const token = microAiToken();
  if (!token) return null;

  const userContent = task.user.trim().slice(0, MAX_USER_CHARS);
  if (!userContent) return null;

  const model = MICRO_AI_MODELS[task.tier];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        // Strict scoping: the system role is a static constant, and user text
        // only ever appears as a separate user-role message.
        messages: [
          { role: 'system', content: task.system },
          { role: 'user', content: userContent },
        ],
        temperature: task.temperature,
        max_tokens: task.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    const text = firstMessageText(payload);
    if (!text.trim()) return null;

    const value = task.validate(text);
    if (value === null) return null;

    return {
      value,
      usage: readUsage(task.tier, (payload as { usage?: unknown })?.usage),
      model: model.id,
    };
  } catch {
    // Network failure, abort, or malformed JSON — all fall back identically.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
