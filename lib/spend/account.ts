/**
 * Pure account-ledger entry construction. The Worker passes only the durable
 * job request/result snapshot; this module never reads credentials, calls a
 * provider, or assumes an output reached the library.
 */
import type { CloudJobRequest } from '../account/contracts';
import type { EngineId } from '../engines/registry';
import { resolveFalVariant } from '../fal/catalog';
import { falDurationSeconds } from '../fal/pricing';
import { findModel } from '../providers/catalog';
import { excerpt, type SpendEntry } from './ledger';
import {
  resolveCatalogRate,
  resolveFalRun,
  resolveGemini,
  resolveRunware,
  unknownFigure,
  type SpendFigure,
} from './resolve';

export type AccountSpendEntry = SpendEntry & {
  provider: EngineId;
  kind: CloudJobRequest['mediaType'];
  inputMode: CloudJobRequest['inputMode'];
};

export interface PersistedProviderResult {
  sources: Array<{ url?: string; objectKey?: string; mimeType?: string }>;
  /** Total response cost for the request, rather than a per-output rate. */
  cost?: number;
  usage?: { promptTokens: number; outputTokens: number };
}

export interface BuildAccountSpendEntryArgs {
  jobId: string;
  request: CloudJobRequest;
  result: PersistedProviderResult;
  at: number;
  /** Pass only after this asset row is known to exist. */
  firstAssetId?: string;
}

function withNote(figure: SpendFigure, note: string): SpendFigure {
  return { ...figure, note };
}

export function buildAccountSpendEntry(args: BuildAccountSpendEntryArgs): AccountSpendEntry | null {
  const { request, result } = args;
  if (request.provider === 'local-test' || !Array.isArray(result.sources) || result.sources.length === 0) return null;

  const outputs = result.sources.length;
  const base = {
    id: `${request.provider}-${args.jobId}`,
    at: args.at,
    provider: request.provider,
    modelId: request.modelId,
    kind: request.mediaType,
    inputMode: request.inputMode,
    promptExcerpt: excerpt(request.prompt),
    ...(args.firstAssetId ? { galleryRecordId: args.firstAssetId } : {}),
  } satisfies Omit<AccountSpendEntry, keyof SpendFigure>;

  if (request.provider === 'runware') {
    const resolved = resolveRunware(result.cost);
    const figure = resolved.costUsd === null
      ? withNote(resolved, 'Runware did not include billing cost in the persisted response.')
      : outputs > 1
        ? withNote(resolved, `The provider response cost covers all ${outputs} outputs.`)
        : resolved;
    return { ...base, ...figure };
  }

  if (request.provider === 'gemini') {
    const resolved = resolveGemini({
      usage: result.usage,
      resolution: typeof request.values.imageSize === 'string' ? request.values.imageSize : undefined,
      inputImages: request.referenceIds.length,
      outputImages: outputs,
    });
    return {
      ...base,
      ...withNote(
        resolved,
        resolved.source === 'usage-metadata'
          ? 'Token usage is the total reported for this generation.'
          : 'Gemini did not return token usage; this uses the published resolution estimate.'
      ),
    };
  }

  if (request.provider === 'fal') {
    try {
      const endpointId = resolveFalVariant(
        request.modelId,
        request.mediaType,
        request.inputMode as 'text' | 'image' | 'frames'
      ).endpointId;
      const resolved = resolveFalRun({
        estimate: null,
        endpointId,
        outputImages: outputs,
        controls: {
          resolution: typeof request.values.resolution === 'string' ? request.values.resolution : undefined,
          audio: request.values.generate_audio !== false,
          durationSeconds: falDurationSeconds(request.values),
          webSearch: request.values.enable_web_search === true,
        },
      });
      return {
        ...base,
        ...withNote(
          resolved,
          resolved.costUsd === null
            ? 'No trustworthy published rate covers this fal job and its saved settings.'
            : 'The account service has no per-job fal invoice data; this uses fal’s published rate.'
        ),
      };
    } catch {
      return { ...base, ...unknownFigure('catalog-rate', 'No trustworthy published rate covers this fal job and its saved settings.') };
    }
  }

  if (request.provider === 'kie') {
    return { ...base, ...unknownFigure('balance-delta', 'Kie does not return trustworthy per-job billing data for account generations.') };
  }

  if (request.provider === 'pollinations' || request.provider === 'cloudflare') {
    return { ...base, ...unknownFigure('catalog-rate', 'This job used your provider credentials, but no per-job billing amount was returned.') };
  }

  const model = findModel(request.provider, request.modelId);
  const duration = typeof request.values.durationSeconds === 'number' ? request.values.durationSeconds : undefined;
  const resolved = resolveCatalogRate(model, duration, outputs);
  if (resolved.costUsd !== null) return { ...base, ...resolved };
  return {
    ...base,
    ...withNote(
      resolved,
      model?.rate?.per === 'second'
        ? 'The published per-second rate cannot be applied without a saved duration.'
        : 'The provider catalog does not publish a flat rate for this model.'
    ),
  };
}
