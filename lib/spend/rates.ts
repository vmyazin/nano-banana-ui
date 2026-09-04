// lib/spend/rates.ts
/**
 * Published vendor rates in USD. Each block names the page it was read from and
 * when; update a whole block from that page rather than one number in
 * isolation. Dependency-free so server routes and client code can both price.
 */

/** https://ai.google.dev/gemini-api/docs/pricing — Gemini 3 Pro Image, read 2026-09-03. */
export const GEMINI_IMAGE_RATES = {
  modelId: 'gemini-3-pro-image-preview',
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 120,
  /** Output image tokens by the studio's `imageSize` control. */
  outputTokensByResolution: { '1K': 1120, '2K': 1120, '4K': 2000 } as Record<string, number>,
  /** Each reference image counts as this many input tokens. */
  inputTokensPerImage: 560,
} as const;

/** https://kie.ai/pricing — "1 credit ≈ $0.005", read 2026-09-03. */
export const KIE_USD_PER_CREDIT = 0.005;

export function geminiTokenCost(promptTokens: number, outputTokens: number): number {
  const cost =
    (promptTokens / 1_000_000) * GEMINI_IMAGE_RATES.inputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * GEMINI_IMAGE_RATES.outputUsdPerMillionTokens;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/** The estimate the studio has always shown: one output image plus its references. */
export function geminiResolutionCost(resolution: string | undefined, inputImages: number): number {
  const table = GEMINI_IMAGE_RATES.outputTokensByResolution;
  const outputTokens = table[resolution ?? '1K'] ?? table['1K'];
  const safeImages = Number.isFinite(inputImages) && inputImages > 0 ? inputImages : 0;
  return geminiTokenCost(safeImages * GEMINI_IMAGE_RATES.inputTokensPerImage, outputTokens);
}

/**
 * fal list prices, read 2026-09-04 from the pricing note on each model page
 * (https://fal.ai/models/<endpoint id>). Only a fallback: fal's estimate API
 * knows an account's negotiated pricing and this table does not, so it prices a
 * run only when that call could not. Every entry is keyed by the endpoint the
 * catalog submits to, so a new fal model needs a line here to stay priced.
 */
export type FalRate =
  | {
      unit: 'image';
      usd: number;
      /** By the `resolution` control; an absent key means we cannot price it. */
      resolutionMultiplier: Record<string, number>;
      /** Added when the `enable_web_search` control is on. */
      webSearchUsd: number;
    }
  | {
      unit: 'second';
      /**
       * By the `resolution` control, then by `generate_audio`. `'*'` covers an
       * endpoint with no resolution control; a table never mixes the two.
       */
      usdPerSecond: Record<string, { audioOff: number; audioOn: number }>;
    }
  | {
      unit: 'video';
      /** Flat price per run by the `duration` control, or `'*'` for one price. */
      usdPerRun: Record<string, number>;
    };

/** $0.08 an image, 2K at 1.5x and 4K at 2x, plus $0.015 when web search runs. */
const NANO_BANANA_2_RATE: FalRate = {
  unit: 'image',
  usd: 0.08,
  resolutionMultiplier: { '0.5K': 0.75, '1K': 1, '2K': 1.5, '4K': 2 },
  webSearchUsd: 0.015,
};

const perSecond = (
  usdPerSecond: Record<string, { audioOff: number; audioOn: number }>
): FalRate => ({ unit: 'second', usdPerSecond });

const veoRate = (standard: [number, number], uhd: [number, number]): FalRate =>
  perSecond({
    '720p': { audioOff: standard[0], audioOn: standard[1] },
    '1080p': { audioOff: standard[0], audioOn: standard[1] },
    '4k': { audioOff: uhd[0], audioOn: uhd[1] },
  });

/** Seedance bills 480p and 4K per output token, which needs a frame size we do not have. */
const seedanceRate = (usdPerSecond: Record<string, number>): FalRate =>
  perSecond(
    Object.fromEntries(
      Object.entries(usdPerSecond).map(([resolution, usd]) => [
        resolution,
        { audioOff: usd, audioOn: usd },
      ])
    )
  );

const klingRate = (audioOff: number, audioOn: number): FalRate =>
  perSecond({ '*': { audioOff, audioOn } });

export const FAL_RATES: Record<string, FalRate> = {
  'fal-ai/nano-banana-2': NANO_BANANA_2_RATE,
  'fal-ai/nano-banana-2/edit': NANO_BANANA_2_RATE,

  'fal-ai/veo3.1': veoRate([0.2, 0.4], [0.4, 0.6]),
  'fal-ai/veo3.1/image-to-video': veoRate([0.2, 0.4], [0.4, 0.6]),
  'fal-ai/veo3.1/first-last-frame-to-video': veoRate([0.2, 0.4], [0.4, 0.6]),
  'fal-ai/veo3.1/fast': veoRate([0.1, 0.15], [0.3, 0.35]),
  'fal-ai/veo3.1/fast/image-to-video': veoRate([0.1, 0.15], [0.3, 0.35]),
  'fal-ai/veo3.1/fast/first-last-frame-to-video': veoRate([0.1, 0.15], [0.3, 0.35]),

  'bytedance/seedance-2.0/text-to-video': seedanceRate({ '720p': 0.3034, '1080p': 0.682 }),
  'bytedance/seedance-2.0/image-to-video': seedanceRate({ '720p': 0.3034, '1080p': 0.682 }),
  'bytedance/seedance-2.0/fast/text-to-video': seedanceRate({ '720p': 0.2419 }),
  'bytedance/seedance-2.0/fast/image-to-video': seedanceRate({ '720p': 0.2419 }),

  'fal-ai/kling-video/v3/standard/text-to-video': klingRate(0.084, 0.126),
  'fal-ai/kling-video/v3/standard/image-to-video': klingRate(0.084, 0.126),
  'fal-ai/kling-video/v3/pro/text-to-video': klingRate(0.112, 0.168),
  'fal-ai/kling-video/v3/pro/image-to-video': klingRate(0.112, 0.168),

  'fal-ai/minimax/hailuo-2.3/standard/text-to-video': { unit: 'video', usdPerRun: { '6': 0.28, '10': 0.56 } },
  'fal-ai/minimax/hailuo-2.3/standard/image-to-video': { unit: 'video', usdPerRun: { '6': 0.28, '10': 0.56 } },
  'fal-ai/minimax/hailuo-2.3/pro/text-to-video': { unit: 'video', usdPerRun: { '*': 0.49 } },
  'fal-ai/minimax/hailuo-2.3/pro/image-to-video': { unit: 'video', usdPerRun: { '*': 0.49 } },

  'fal-ai/wan/v2.7/text-to-video': seedanceRate({ '720p': 0.1, '1080p': 0.15 }),
  'fal-ai/wan/v2.7/image-to-video': seedanceRate({ '720p': 0.1, '1080p': 0.15 }),
};

/** The run controls that move a fal price, read from a job's control values. */
export interface FalRunControls {
  resolution?: string;
  audio?: boolean;
  durationSeconds?: number;
  webSearch?: boolean;
}

export interface FalPublishedCost {
  costUsd: number;
  unit: 'image' | 'second' | 'video';
  quantity: number;
}

/**
 * What fal's published note says this run costs, or null when the endpoint is
 * unlisted or its controls do not pin a price — a Seedance run at 480p, or a
 * per-second model whose duration we never learned.
 */
export function falPublishedCost(
  endpointId: string,
  controls: FalRunControls
): FalPublishedCost | null {
  const rate = FAL_RATES[endpointId];
  if (!rate) return null;

  if (rate.unit === 'image') {
    const multiplier = rate.resolutionMultiplier[controls.resolution ?? '1K'];
    if (multiplier === undefined) return null;
    const costUsd = rate.usd * multiplier + (controls.webSearch ? rate.webSearchUsd : 0);
    return { costUsd, unit: 'image', quantity: 1 };
  }

  const duration = controls.durationSeconds;
  const hasDuration = duration !== undefined && Number.isFinite(duration) && duration > 0;

  if (rate.unit === 'second') {
    if (!hasDuration) return null;
    const price = rate.usdPerSecond[controls.resolution ?? '*'] ?? rate.usdPerSecond['*'];
    if (!price) return null;
    const perSecondUsd = controls.audio === false ? price.audioOff : price.audioOn;
    return { costUsd: perSecondUsd * duration, unit: 'second', quantity: duration };
  }

  const usd = rate.usdPerRun[hasDuration ? String(duration) : '*'] ?? rate.usdPerRun['*'];
  if (usd === undefined) return null;
  return { costUsd: usd, unit: 'video', quantity: 1 };
}
