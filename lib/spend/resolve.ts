// lib/spend/resolve.ts
/**
 * One resolver per provider. Each returns the cost fields of a ledger entry,
 * never throws, and answers `unknown` for anything it cannot price. Pure, so a
 * fixture response is all a test needs.
 */
import type { KieJob } from '@/lib/kie/types';
import type { MicroAiUsage } from '@/lib/micro-ai/models';
import type { ProviderModel } from '@/lib/providers/types';

import type { SpendEntry, SpendSource } from './ledger';
import { geminiResolutionCost, geminiTokenCost, KIE_USD_PER_CREDIT } from './rates';

export type SpendFigure = Pick<SpendEntry, 'costUsd' | 'confidence' | 'source' | 'quantity' | 'note'>;

export function unknownFigure(source: SpendSource, note?: string): SpendFigure {
  return { costUsd: null, confidence: 'unknown', source, ...(note ? { note } : {}) };
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
}

export function resolveGemini(args: {
  usage?: GeminiUsage | null;
  resolution?: string;
  inputImages: number;
}): SpendFigure {
  const { usage } = args;
  if (usage && Number.isFinite(usage.outputTokens) && usage.outputTokens > 0) {
    const promptTokens = Number.isFinite(usage.promptTokens) ? Math.max(0, usage.promptTokens) : 0;
    return {
      costUsd: geminiTokenCost(promptTokens, usage.outputTokens),
      confidence: 'exact',
      source: 'usage-metadata',
      quantity: { unit: 'token', value: promptTokens + usage.outputTokens },
    };
  }
  return {
    costUsd: geminiResolutionCost(args.resolution, args.inputImages),
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: 'image', value: 1 },
  };
}

export function resolveRunware(cost: number | undefined): SpendFigure {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    return unknownFigure('response');
  }
  return { costUsd: cost, confidence: 'exact', source: 'response' };
}

export function resolveCatalogRate(
  model: ProviderModel | undefined,
  durationSeconds?: number
): SpendFigure {
  const rate = model?.rate;
  if (!rate) return unknownFigure('catalog-rate');
  if (rate.per === 'second') {
    if (durationSeconds === undefined || !(durationSeconds > 0)) return unknownFigure('catalog-rate');
    return {
      costUsd: rate.usd * durationSeconds,
      confidence: 'estimated',
      source: 'catalog-rate',
      quantity: { unit: 'second', value: durationSeconds },
    };
  }
  return {
    costUsd: rate.usd,
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: rate.per, value: 1 },
  };
}

export function resolveFree(): SpendFigure {
  return { costUsd: 0, confidence: 'exact', source: 'free', quantity: { unit: 'image', value: 1 } };
}

export interface FalEstimate {
  costUsd: number | null;
  unit?: string;
  quantity?: number;
}

export function resolveFalEstimate(estimate: FalEstimate | null | undefined): SpendFigure {
  if (!estimate || typeof estimate.costUsd !== 'number' || !Number.isFinite(estimate.costUsd)) {
    return unknownFigure('estimate-api');
  }
  const unit = estimate.unit === 'second' || estimate.unit === 'seconds' ? 'second' : estimate.unit === 'video' ? 'video' : 'image';
  return {
    costUsd: estimate.costUsd,
    confidence: 'estimated',
    source: 'estimate-api',
    ...(estimate.quantity !== undefined ? { quantity: { unit, value: estimate.quantity } } : {}),
  };
}

export function resolveKieDelta(args: {
  before: number | undefined;
  after: number | null;
  sharedWith: number;
}): SpendFigure {
  const { before, after, sharedWith } = args;
  if (before === undefined || after === null) return unknownFigure('balance-delta');
  const delta = before - after;
  if (delta < 0) {
    return unknownFigure('balance-delta', 'The Kie balance rose during this job, so its cost is unknown.');
  }
  if (delta === 0) {
    return unknownFigure('balance-delta', 'The Kie balance did not change, so the cost is unknown.');
  }
  const credits = delta / (sharedWith + 1);
  return {
    costUsd: credits * KIE_USD_PER_CREDIT,
    confidence: 'estimated',
    source: 'balance-delta',
    quantity: { unit: 'credit', value: credits },
    ...(sharedWith > 0
      ? { note: `Balance change shared with ${sharedWith} other Kie job${sharedWith === 1 ? '' : 's'}.` }
      : {}),
  };
}

/**
 * Other Kie jobs whose credits could sit inside this job's before/after window:
 * anything submitted after we read the balance, or anything that succeeded
 * after it. A job still polling only bumps `updatedAt`, which spends nothing,
 * and failed jobs are refunded, so neither counts.
 */
export function kieSharers(jobs: KieJob[], job: KieJob): number {
  return jobs.filter(
    (other) =>
      other.id !== job.id &&
      other.state !== 'fail' &&
      (other.createdAt >= job.createdAt ||
        (other.state === 'success' && other.updatedAt >= job.createdAt))
  ).length;
}

export function resolveHelper(usage: MicroAiUsage): SpendFigure {
  return {
    costUsd: usage.costUsd,
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: 'token', value: usage.promptTokens + usage.completionTokens },
  };
}
