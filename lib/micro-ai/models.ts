/**
 * Model tiering for small helper tasks (filenames, example prompts).
 *
 * These run on open-weight Llama models through Hugging Face's OpenAI-compatible
 * router rather than a closed-source frontier model, because the work is tiny
 * and latency matters more than reasoning depth.
 */

export type MicroAiTier = 'micro' | 'pro';

export interface MicroAiModel {
  /** Hugging Face repo id, sent verbatim as the `model` field. */
  id: string;
  /** USD per 1M tokens. See PRICING_NOTE — treat readouts as estimates. */
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Published input pricing at the time of writing. Output pricing is assumed
 * equal to input pending verified per-model figures, so every cost figure the
 * UI shows is labelled an estimate. Update both numbers together from the
 * provider's current price list — this table is the single source of truth.
 */
export const PRICING_NOTE = 'Estimated from list pricing; output priced as input.';

export const MICRO_AI_MODELS: Record<MicroAiTier, MicroAiModel> = {
  // Simple, deterministic work: file naming, slugs, keyword extraction.
  micro: {
    id: 'meta-llama/Llama-3.1-8B-Instruct',
    inputPer1M: 0.02,
    outputPer1M: 0.02,
  },
  // Reserved for prompt expansion and style breakdown. Defined so the tier
  // exists in one place; no task routes here yet.
  pro: {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    inputPer1M: 0.12,
    outputPer1M: 0.12,
  },
};

export interface MicroAiUsage {
  promptTokens: number;
  completionTokens: number;
  /** Estimated USD for this single request. */
  costUsd: number;
}

export function usageCost(tier: MicroAiTier, promptTokens: number, completionTokens: number): number {
  const model = MICRO_AI_MODELS[tier];
  const cost =
    (promptTokens / 1_000_000) * model.inputPer1M +
    (completionTokens / 1_000_000) * model.outputPer1M;
  return Number.isFinite(cost) ? cost : 0;
}

/** Normalize the OpenAI-shaped `usage` block into our own accounting. */
export function readUsage(tier: MicroAiTier, raw: unknown): MicroAiUsage {
  const usage = (raw ?? {}) as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens);
  const completionTokens = Number(usage.completion_tokens);
  const safePrompt = Number.isFinite(promptTokens) && promptTokens >= 0 ? Math.trunc(promptTokens) : 0;
  const safeCompletion =
    Number.isFinite(completionTokens) && completionTokens >= 0 ? Math.trunc(completionTokens) : 0;

  return {
    promptTokens: safePrompt,
    completionTokens: safeCompletion,
    costUsd: usageCost(tier, safePrompt, safeCompletion),
  };
}
