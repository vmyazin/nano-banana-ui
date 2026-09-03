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
