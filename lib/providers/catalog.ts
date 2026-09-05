// lib/providers/catalog.ts
import type {
  MediaKind,
  ProviderId,
  ProviderModel,
  ProviderSize,
  ProviderMode,
  ProviderVideoInputCapability,
} from './types';

/**
 * Curated models per provider.
 *
 * Every `id` here is quoted verbatim from the vendor's own documentation or
 * public catalog endpoint, read on 2026-08-16 (sources in
 * `docs/claude/specs/2026-08-16-multi-provider-sources.md`). A wrong identifier
 * fails at the provider with an opaque error, so treat this list as a citation:
 * **do not add an entry you have not read in the vendor's docs.**
 *
 * Prices are the vendors' published rates, copied as display strings because
 * the units differ — per image, per megapixel, per second of video.
 */
const RUNWARE_MODELS: ProviderModel[] = [
  {
    id: 'runware:z-image@turbo',
    label: 'Z-Image Turbo',
    fileCode: 'z-image-turbo',
    kind: 'image',
    modes: ['text', 'image'],
    price: '~$0.003 / 1024²',
    maxInputImages: 1,
    imageInput: 'seed',
    note: 'Cheapest image model here — sub-second, photorealistic, good with text in-image.',
  },
  {
    // The model page quotes this AIR; the marketing pages' "bfl:flux@2-dev"
    // spelling is not what the API takes.
    id: 'runware:400@1',
    label: 'FLUX.2 [dev]',
    fileCode: 'flux-2-dev',
    kind: 'image',
    modes: ['text', 'image'],
    price: '$0.0077 / 1024²',
    maxInputImages: 4,
    imageInput: 'reference',
  },
  {
    id: 'runware:108@22',
    label: 'Qwen-Image-Edit-Plus',
    fileCode: 'qwen-image-edit-plus',
    kind: 'image',
    modes: ['image'],
    price: '$0.0166 / 1024²',
    maxInputImages: 3,
    imageInput: 'reference',
    note: 'Editing only — it needs at least one reference image.',
  },
  {
    id: 'alibaba:wan@3.0',
    label: 'Wan 3.0',
    fileCode: 'wan-3_0',
    kind: 'video',
    modes: ['reference'],
    price: '$0.05 / s @ 480p · $0.10 @ 720p · $0.20 @ 1080p',
    maxInputImages: 10,
    videoInputs: {
      reference: {
        field: 'referenceImages',
        maxImages: 10,
        clientMaxImages: 5,
        promptSyntax: 'image-index',
      },
    },
    duration: { type: 'range', min: 2, max: 30, default: 6 },
    sizes: [
      { label: '480p', preset: '480p' },
      { label: '720p', preset: '720p' },
      { label: '1080p', preset: '1080p' },
    ],
    note: 'Identity-only character and product views, with native audio.',
  },
  {
    id: 'lightricks:ltx@2.5-fast',
    label: 'LTX-2.5 Fast',
    fileCode: 'ltx-2_5-fast',
    kind: 'video',
    // frameImages takes two, and the vendor's rule for two is first and last.
    modes: ['text', 'image', 'frames'],
    price: '$0.09 / s @ 720p · $0.13 @ 1080p',
    maxInputImages: 2,
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    sizes: [
      { label: '720p · 16:9', width: 1280, height: 720 },
      { label: '720p · 9:16', width: 720, height: 1280 },
      { label: '1080p · 16:9', width: 1920, height: 1080 },
      { label: '1080p · 9:16', width: 1080, height: 1920 },
      { label: '2K · 16:9', width: 2560, height: 1440 },
      { label: '2K · 9:16', width: 1440, height: 2560 },
      { label: '4K · 16:9', width: 3840, height: 2160 },
      { label: '4K · 9:16', width: 2160, height: 3840 },
    ],
  },
  {
    id: 'bytedance:seedance@2.0-mini',
    label: 'Seedance 2.0 Mini',
    fileCode: 'seedance-2_0-mini',
    kind: 'video',
    modes: ['text', 'image', 'frames'],
    price: '$0.036 / s @ 480p · $0.081 / s @ 720p',
    maxInputImages: 2,
    durations: [4, 5, 6, 8, 10, 15],
    sizes: [
      { label: '480p · 16:9', width: 864, height: 496 },
      { label: '480p · 9:16', width: 496, height: 864 },
      { label: '480p · 1:1', width: 640, height: 640 },
      { label: '480p · 3:4', width: 560, height: 752 },
      { label: '720p · 16:9', width: 1280, height: 720 },
      { label: '720p · 9:16', width: 720, height: 1280 },
      { label: '720p · 1:1', width: 960, height: 960 },
      { label: '720p · 3:4', width: 834, height: 1112 },
      { label: '720p · 21:9', width: 1470, height: 630 },
    ],
  },
  {
    id: 'pixverse:1@5-fast',
    label: 'PixVerse V5 Fast',
    fileCode: 'pixverse-v5-fast',
    kind: 'video',
    // One frame image only, so no first-and-last here.
    modes: ['text', 'image'],
    price: '$0.094 / 5s @ 360p · $0.248 / 5s @ 1080p',
    maxInputImages: 1,
    // The vendor lists exactly two lengths.
    durations: [5, 8],
    sizes: [
      { label: '540p · 16:9', width: 960, height: 540 },
      { label: '540p · 9:16', width: 540, height: 960 },
      { label: '720p · 16:9', width: 1280, height: 720 },
      { label: '720p · 9:16', width: 720, height: 1280 },
      { label: '720p · 1:1', width: 720, height: 720 },
      { label: '720p · 3:4', width: 720, height: 960 },
      { label: '1080p · 16:9', width: 1920, height: 1080 },
      { label: '1080p · 9:16', width: 1080, height: 1920 },
    ],
  },
  {
    id: 'alibaba:wan@2.6-flash',
    label: 'Wan 2.6 Flash',
    fileCode: 'wan-2_6-flash',
    kind: 'video',
    modes: ['image'],
    price: '$0.025 / s @ 720p',
    maxInputImages: 1,
    // Documented as a 2–15s range; these are the useful stops inside it.
    durations: [4, 5, 6, 8, 10, 15],
    sizes: [
      { label: '720p · 16:9', width: 1280, height: 720 },
      { label: '720p · 9:16', width: 720, height: 1280 },
      { label: '720p · 1:1', width: 960, height: 960 },
      { label: '1080p · 16:9', width: 1920, height: 1080 },
      { label: '1080p · 9:16', width: 1080, height: 1920 },
      { label: '1080p · 1:1', width: 1440, height: 1440 },
    ],
    note: 'Image-to-video only. Cheapest video option here.',
  },
];

/**
 * Seedance 2.0's Mini and Fast tiers are one model behind three endpoints each —
 * Atlas gives every mode its own id — so the controls they share are written
 * once and a tier supplies only its ids and its rate. Read on 2026-09-05 from
 * `https://www.atlascloud.ai/models/bytedance/seedance-2.0-{tier}/{mode}/llms.txt`,
 * the per-model reference Atlas publishes for agents.
 *
 * Neither tier has a native 1080p: above 720p they list only the upscaled `-SR`
 * sizes, and `4k` belongs to the full Seedance 2.0 model alone.
 */
function seedance20Tier(tier: 'mini' | 'fast', usdPerSecond: number): ProviderModel[] {
  const shared = {
    label: `Seedance 2.0 ${tier === 'mini' ? 'Mini' : 'Fast'}`,
    kind: 'video' as const,
    price: `$${usdPerSecond} / s`,
    rate: { usd: usdPerSecond, per: 'second' as const },
    // Documented as any whole 4–15; these are the stops worth offering.
    durations: [4, 5, 6, 8, 10, 12, 15],
    sizes: [
      { label: '480p', preset: '480p' },
      { label: '720p', preset: '720p' },
      { label: '1080p (upscaled)', preset: '1080p-SR' },
      { label: '1440p (upscaled)', preset: '1440p-SR' },
    ],
  };

  return [
    {
      ...shared,
      id: `bytedance/seedance-2.0-${tier}/text-to-video`,
      fileCode: `seedance-2_0-${tier}-t2v`,
      modes: ['text'],
    },
    {
      ...shared,
      id: `bytedance/seedance-2.0-${tier}/image-to-video`,
      fileCode: `seedance-2_0-${tier}-i2v`,
      // `last_image` is optional, so one still opens the clip and two bookend it.
      modes: ['image', 'frames'],
      maxInputImages: 2,
      videoInputs: {
        image: { field: 'frameImages', maxImages: 1 },
        frames: { field: 'frameImages', maxImages: 2 },
      },
    },
    {
      ...shared,
      id: `bytedance/seedance-2.0-${tier}/reference-to-video`,
      fileCode: `seedance-2_0-${tier}-r2v`,
      modes: ['reference'],
      maxInputImages: 9,
      videoInputs: {
        reference: {
          field: 'referenceImages',
          maxImages: 9,
          clientMaxImages: 5,
          promptSyntax: 'image-index',
        },
      },
      note: 'Carries characters, products, and styles between shots, with native audio.',
    },
  ];
}

const ATLAS_MODELS: ProviderModel[] = [
  {
    id: 'black-forest-labs/flux-schnell',
    label: 'FLUX.1 [schnell]',
    fileCode: 'flux-1-schnell',
    kind: 'image',
    modes: ['text', 'image'],
    price: '$0.003 / image',
    rate: { usd: 0.003, per: 'image' },
    maxInputImages: 1,
  },
  {
    id: 'z-image/turbo',
    label: 'Z-Image Turbo',
    fileCode: 'z-image-turbo',
    kind: 'image',
    modes: ['text', 'image'],
    price: '$0.005 / image',
    rate: { usd: 0.005, per: 'image' },
    maxInputImages: 1,
  },
  {
    id: 'qwen-image-3.0/text-to-image',
    label: 'Qwen-Image 3.0',
    fileCode: 'qwen-image-3_0',
    kind: 'image',
    modes: ['text'],
    price: '$0.04 / image',
    rate: { usd: 0.04, per: 'image' },
  },
  {
    id: 'qwen-image-3.0/edit',
    label: 'Qwen-Image 3.0 Edit',
    fileCode: 'qwen-image-3_0-edit',
    kind: 'image',
    modes: ['image'],
    price: '$0.04 / image',
    rate: { usd: 0.04, per: 'image' },
    maxInputImages: 1,
  },
  {
    id: 'bytedance/seedream-v5.0-pro/text-to-image',
    label: 'Seedream v5.0 Pro',
    fileCode: 'seedream-v5_0-pro',
    kind: 'image',
    modes: ['text'],
    price: '$0.036 / image',
    rate: { usd: 0.036, per: 'image' },
    note: "ByteDance's flagship — the best prompt adherence and in-image typography here.",
  },
  {
    id: 'bytedance/seedream-v5.0-pro/edit',
    label: 'Seedream v5.0 Pro Edit',
    fileCode: 'seedream-v5_0-pro-edit',
    kind: 'image',
    modes: ['image'],
    price: '$0.036 / image',
    rate: { usd: 0.036, per: 'image' },
    maxInputImages: 10,
    note: 'Editing only — it needs at least one reference. The first is included in the price; each one after it adds $0.003.',
  },
  {
    id: 'ltx-2.3-quality/text-to-video',
    label: 'LTX 2.3 Quality',
    fileCode: 'ltx-2_3-quality',
    kind: 'video',
    modes: ['text'],
    price: '$0.002 / s',
    rate: { usd: 0.002, per: 'second' },
    // No durations on purpose: this model takes num_frames, not seconds, so the
    // control is hidden and no duration is sent.
    sizes: [
      { label: 'Landscape 16:9', preset: 'landscape_16_9' },
      { label: 'Portrait 9:16', preset: 'portrait_9_16' },
      { label: 'Square', preset: 'square_hd' },
    ],
    note: 'Length is fixed by the model — it counts frames rather than seconds.',
  },
  {
    id: 'bytedance/seedance-v1-pro-fast/image-to-video',
    label: 'Seedance v1 Pro Fast',
    fileCode: 'seedance-v1-pro-fast',
    kind: 'video',
    modes: ['image'],
    price: '$0.009 / s',
    rate: { usd: 0.009, per: 'second' },
    maxInputImages: 1,
    // Documented options run 2–12; these are the stops worth offering.
    durations: [4, 5, 6, 8, 10, 12],
    sizes: [
      { label: '480p', preset: '480p' },
      { label: '720p', preset: '720p' },
      { label: '1080p', preset: '1080p' },
    ],
  },
  // The only models here with native audio and a character-reference mode.
  ...seedance20Tier('mini', 0.011),
  ...seedance20Tier('fast', 0.027),
];

const COMET_MODELS: ProviderModel[] = [
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    fileCode: 'gpt-image-2',
    kind: 'image',
    modes: ['text'],
    price: 'metered',
    note: 'Returns base64 directly rather than a URL.',
  },
  {
    id: 'qwen-image',
    label: 'Qwen-Image',
    fileCode: 'qwen-image',
    kind: 'image',
    modes: ['text'],
    price: 'metered',
    note: 'One image per request — the provider rejects n > 1.',
  },
  {
    id: 'seedance-2-5',
    label: 'Seedance 2.5',
    fileCode: 'seedance-2_5',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Vendor table: 4–30 seconds.
    durations: [4, 5, 6, 8, 10, 15, 20],
    // Comet takes an exact WxH string; these are the pairs its examples use.
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
    ],
  },
  {
    id: 'veo3.1-fast',
    label: 'Veo 3.1 Fast',
    fileCode: 'veo-3_1-fast',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    durations: [4, 6, 8],
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
      { label: '1080p · 16:9', preset: '1920x1080' },
      { label: '4K · 16:9', preset: '3840x2160' },
    ],
    note: 'Google Veo 3.1 on the faster route — the vendor’s default pick for short clips.',
  },
  {
    id: 'veo3.1',
    label: 'Veo 3.1',
    fileCode: 'veo-3_1',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    durations: [4, 6, 8],
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
      { label: '1080p · 16:9', preset: '1920x1080' },
      { label: '4K · 16:9', preset: '3840x2160' },
    ],
  },
  {
    id: 'sora-2',
    label: 'Sora 2',
    fileCode: 'sora-2',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    durations: [4, 8, 12, 16, 20],
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
    ],
    note: 'Longest clips here — up to 20 seconds.',
  },
  {
    id: 'sora-2-pro',
    label: 'Sora 2 Pro',
    fileCode: 'sora-2-pro',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    durations: [4, 8, 12, 16, 20],
    // The Pro sizes plus the standard Sora pair, which Pro also accepts.
    sizes: [
      { label: 'Pro · landscape', preset: '1792x1024' },
      { label: 'Pro · portrait', preset: '1024x1792' },
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
    ],
  },
  {
    id: 'wan2.7',
    label: 'Wan 2.7',
    fileCode: 'wan-2_7',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Documented as an integer 2–15; these are the stops worth offering.
    durations: [4, 5, 6, 8, 10, 15],
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
      { label: '1080p · 16:9', preset: '1920x1080' },
      { label: '1080p · 9:16', preset: '1080x1920' },
      { label: '1080p · 1:1', preset: '1440x1440' },
    ],
  },
  {
    id: 'viduq3-turbo',
    label: 'Vidu Q3 Turbo',
    fileCode: 'vidu-q3-turbo',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Documented as an integer 1–16.
    durations: [4, 5, 6, 8, 10, 16],
    sizes: [
      { label: '540p · 16:9', preset: '960x528' },
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '1080p · 16:9', preset: '1920x1080' },
    ],
    note: 'Landscape only — the vendor lists no portrait size for Vidu Q3.',
  },
  {
    id: 'minimax-h3',
    label: 'MiniMax H3',
    fileCode: 'minimax-h3',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Documented as an integer 5–15.
    durations: [5, 6, 8, 10, 15],
    sizes: [
      { label: '768P · 16:9', preset: '1344x768' },
      { label: '768P · 9:16', preset: '768x1344' },
      { label: '768P · 1:1', preset: '768x768' },
      { label: '768P · 3:4', preset: '768x1024' },
      { label: '768P · 21:9', preset: '1536x672' },
      { label: '2K · 16:9', preset: '2560x1440' },
      { label: '2K · 9:16', preset: '1440x2560' },
      { label: '2K · 1:1', preset: '1440x1440' },
    ],
    note: 'The widest choice of shapes here, including 21:9 and vertical 2K.',
  },
  {
    id: 'happyhorse-1.1',
    label: 'HappyHorse 1.1',
    fileCode: 'happyhorse-1_1',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Documented as an integer 3–15.
    durations: [4, 5, 6, 8, 10, 15],
    sizes: [
      { label: 'Landscape · 720p', preset: '1280x720' },
      { label: 'Landscape · 1080p', preset: '1920x1080' },
      { label: 'Portrait · 720p', preset: '720x1280' },
      { label: 'Portrait · 1080p', preset: '1080x1920' },
      { label: 'Square', preset: '1440x1440' },
      { label: 'Classic landscape', preset: '1440x1080' },
      { label: 'Classic portrait', preset: '1080x1440' },
      { label: 'Wide landscape 21:9', preset: '2520x1080' },
      { label: 'Wide portrait', preset: '1080x2520' },
    ],
  },
  {
    id: 'flux-3',
    label: 'FLUX 3 Video',
    fileCode: 'flux-3-video',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Documented as an integer 5–20, default 10.
    durations: [5, 6, 8, 10, 15, 20],
    sizes: [
      { label: '720p', preset: '1280x720' },
      { label: '1080p', preset: '1920x1080' },
    ],
  },
  {
    id: 'doubao-seedance-2-0-mini',
    label: 'Seedance 2.0 Mini',
    fileCode: 'seedance-2_0-mini',
    kind: 'video',
    modes: ['text', 'image'],
    price: 'metered',
    maxInputImages: 1,
    // Vendor table: 4–15 seconds.
    durations: [4, 5, 6, 8, 10, 15],
    sizes: [
      { label: '720p · 16:9', preset: '1280x720' },
      { label: '720p · 9:16', preset: '720x1280' },
    ],
  },
];

export const PROVIDER_MODELS: Record<ProviderId, ProviderModel[]> = {
  runware: RUNWARE_MODELS,
  atlas: ATLAS_MODELS,
  comet: COMET_MODELS,
};

/** Default per provider and media kind — the cheapest entry that covers both modes. */
export const DEFAULT_MODELS: Record<ProviderId, Record<MediaKind, string>> = {
  runware: { image: 'runware:z-image@turbo', video: 'lightricks:ltx@2.5-fast' },
  atlas: { image: 'black-forest-labs/flux-schnell', video: 'ltx-2.3-quality/text-to-video' },
  comet: { image: 'gpt-image-2', video: 'seedance-2-5' },
};

export function modelsFor(provider: ProviderId, kind: MediaKind): ProviderModel[] {
  return PROVIDER_MODELS[provider].filter((model) => model.kind === kind);
}

export function findModel(provider: ProviderId, id: string): ProviderModel | undefined {
  return PROVIDER_MODELS[provider].find((model) => model.id === id);
}

/** Resolve only the catalog-advertised video input contract for a model/mode. */
export function resolveVideoInput(
  provider: ProviderId,
  modelId: string,
  mode: ProviderMode
): ProviderVideoInputCapability | undefined {
  if (mode === 'text') return undefined;
  const model = findModel(provider, modelId);
  if (!model || model.kind !== 'video' || !model.modes.includes(mode)) return undefined;
  const declared = model.videoInputs?.[mode];
  if (declared) return declared;
  if (model.maxInputImages === undefined) return undefined;
  return {
    field: 'frameImages',
    maxImages: mode === 'frames' ? Math.min(2, model.maxInputImages) : model.maxInputImages,
  };
}

/**
 * The clip length to actually send. A model that lists lengths rejects anything
 * outside the list, so a stale or foreign value snaps to the closest one it
 * does accept rather than failing at the vendor. `undefined` means this model
 * has no seconds control and the field must be omitted.
 */
export function resolveDuration(
  provider: ProviderId,
  modelId: string,
  requested?: number
): number | undefined {
  const metadata = findModel(provider, modelId);
  const duration = metadata?.duration;
  if (duration?.type === 'options' && duration.values.length > 0) {
    if (requested === undefined) return duration.values[0];
    return duration.values.reduce((best, value) =>
      Math.abs(value - requested) < Math.abs(best - requested) ? value : best
    );
  }
  if (duration?.type === 'range') {
    const value = requested === undefined ? duration.default : Math.round(requested);
    return Math.min(duration.max, Math.max(duration.min, value));
  }
  const allowed = metadata?.durations;
  if (!allowed || allowed.length === 0) return undefined;
  if (requested === undefined) return allowed[0];
  return allowed.reduce((best, value) =>
    Math.abs(value - requested) < Math.abs(best - requested) ? value : best
  );
}

/**
 * Resolve a requested model to one this provider actually serves for the kind.
 * A stale persisted preference (model retired, or copied from another provider)
 * falls back to the default rather than failing at the vendor.
 */
/**
 * The output size to actually send, by its label. An unknown or stale label
 * falls back to the model's first documented size rather than to a
 * general-purpose default the model may not accept.
 */
export function resolveSize(
  provider: ProviderId,
  modelId: string,
  requestedLabel?: string
): ProviderSize | undefined {
  const sizes = findModel(provider, modelId)?.sizes;
  if (!sizes || sizes.length === 0) return undefined;
  return sizes.find((size) => size.label === requestedLabel) ?? sizes[0];
}

export function resolveModel(provider: ProviderId, kind: MediaKind, requested?: string): string {
  const known = requested && findModel(provider, requested);
  if (known && known.kind === kind) return known.id;
  return DEFAULT_MODELS[provider][kind];
}
