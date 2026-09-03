// lib/spend/ledger.ts
import { ENGINES, type EngineId } from '@/lib/engines/registry';

export type SpendKind = 'image' | 'video' | 'helper';
export type SpendConfidence = 'exact' | 'estimated' | 'unknown';
export type SpendSource =
  | 'response'        // vendor returned the cost (Runware)
  | 'usage-metadata'  // priced from token counts (Gemini)
  | 'estimate-api'    // vendor estimate endpoint (fal)
  | 'balance-delta'   // credits before minus credits after (Kie)
  | 'catalog-rate'    // published rate times quantity (Atlas, Comet, Gemini fallback, helper)
  | 'free';           // Pollinations, Cloudflare

export type SpendProvider = EngineId | 'micro-ai';

export interface SpendQuantity {
  unit: 'image' | 'second' | 'video' | 'token' | 'credit';
  value: number;
}

export interface SpendEntry {
  /** `${provider}-${jobId}` when a job id exists, so a re-poll cannot file twice. */
  id: string;
  at: number;
  provider: SpendProvider;
  modelId: string;
  kind: SpendKind;
  inputMode?: string;
  costUsd: number | null;
  confidence: SpendConfidence;
  source: SpendSource;
  quantity?: SpendQuantity;
  /** First 120 characters, for the ledger row. */
  promptExcerpt: string;
  /** Library record this run produced, when one exists. */
  galleryRecordId?: string;
  /** Human note, e.g. "Balance change shared with 2 other Kie jobs." */
  note?: string;
}

/** Enough for months of daily work without unbounded localStorage growth. */
export const SPEND_LEDGER_LIMIT = 2_000;

const EXCERPT_LENGTH = 120;

export function excerpt(prompt: string): string {
  return prompt.trim().slice(0, EXCERPT_LENGTH);
}

export function providerLabel(provider: SpendProvider): string {
  if (provider === 'micro-ai') return 'Helper tasks';
  return ENGINES.find((engine) => engine.id === provider)?.label ?? provider;
}
