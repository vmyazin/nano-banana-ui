import type {
  FalFieldDefinition,
  FalFieldOption,
  FalInputMode,
  FalMediaType,
  FalModelDefinition,
  FalModelVariant,
  FalValue,
} from './types';

const options = (values: Array<string | number>): FalFieldOption[] =>
  values.map((value) => ({
    label: String(value).replaceAll('_', ' '),
    value,
  }));

const selectField = (
  key: string,
  label: string,
  defaultValue: string | number,
  values: Array<string | number>,
  constraints?: Pick<FalFieldDefinition, 'min' | 'max' | 'step'>
): FalFieldDefinition => ({
  key,
  label,
  type: 'select',
  defaultValue,
  options: options(values),
  ...constraints,
});

const numberField = (
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step = 1
): FalFieldDefinition => ({ key, label, type: 'number', defaultValue, min, max, step });

const booleanField = (key: string, label: string, defaultValue: boolean): FalFieldDefinition => ({
  key,
  label,
  type: 'boolean',
  defaultValue,
});

const textField = (key: string, label: string, description?: string): FalFieldDefinition => ({
  key,
  label,
  type: 'text',
  description,
});

const imageVariant = (
  modelId: string,
  endpointId: string,
  imageInputKey: 'image_url' | 'image_urls' | 'start_image_url',
  fields: FalFieldDefinition[],
  maxInputImages = 1,
  imageInputMultiple = false
): FalModelVariant => ({
  id: `${modelId}:image`,
  endpointId,
  inputMode: 'image',
  imageInputKey,
  imageInputMultiple,
  maxInputImages,
  fields,
});

const textVariant = (
  modelId: string,
  endpointId: string,
  fields: FalFieldDefinition[]
): FalModelVariant => ({
  id: `${modelId}:text`,
  endpointId,
  inputMode: 'text',
  fields,
});

const videoModel = (
  id: string,
  label: string,
  provider: string,
  description: string,
  textEndpoint: string,
  imageEndpoint: string,
  textFields: FalFieldDefinition[],
  imageFields = textFields,
  imageInputKey: 'image_url' | 'start_image_url' = 'image_url'
): FalModelDefinition => ({
  id,
  label,
  provider,
  description,
  mediaType: 'video',
  variants: [
    textVariant(id, textEndpoint, textFields),
    imageVariant(id, imageEndpoint, imageInputKey, imageFields),
  ],
});

const NANO_FIELDS = [
  selectField('aspect_ratio', 'Aspect ratio', 'auto', [
    'auto',
    '21:9',
    '16:9',
    '3:2',
    '4:3',
    '5:4',
    '1:1',
    '4:5',
    '3:4',
    '2:3',
    '9:16',
    '4:1',
    '1:4',
    '8:1',
    '1:8',
  ]),
  selectField('resolution', 'Resolution', '1K', ['1K', '2K', '4K']),
  booleanField('enable_web_search', 'Enable web search', false),
];

export const FAL_IMAGE_MODEL: FalModelDefinition = {
  id: 'nano-banana-2',
  label: 'Nano Banana 2',
  provider: 'Google',
  description: 'Reasoning-guided image generation and multi-image editing with optional web grounding.',
  mediaType: 'image',
  variants: [
    textVariant('nano-banana-2', 'fal-ai/nano-banana-2', NANO_FIELDS),
    imageVariant(
      'nano-banana-2',
      'fal-ai/nano-banana-2/edit',
      'image_urls',
      NANO_FIELDS,
      14,
      true
    ),
  ],
};

const VEO_BASE_FIELDS = [
  selectField('duration', 'Duration', '8s', ['4s', '6s', '8s']),
  selectField('resolution', 'Resolution', '720p', ['720p', '1080p', '4k']),
  booleanField('generate_audio', 'Generate audio', true),
];

const VEO_TEXT_FIELDS = [
  ...VEO_BASE_FIELDS,
  selectField('aspect_ratio', 'Aspect ratio', '16:9', ['16:9', '9:16']),
];

const VEO_IMAGE_FIELDS = [
  ...VEO_BASE_FIELDS,
  selectField('aspect_ratio', 'Aspect ratio', 'auto', ['auto', '16:9', '9:16']),
];

const seedanceFields = (resolutions: string[]): FalFieldDefinition[] => [
  selectField(
    'duration',
    'Duration',
    'auto',
    ['auto', ...Array.from({ length: 12 }, (_, index) => String(index + 4))]
  ),
  selectField('resolution', 'Resolution', '720p', resolutions),
  booleanField('generate_audio', 'Generate audio', true),
  selectField('aspect_ratio', 'Aspect ratio', 'auto', [
    'auto',
    '21:9',
    '16:9',
    '4:3',
    '1:1',
    '3:4',
    '9:16',
  ]),
  selectField('bitrate_mode', 'Bitrate', 'standard', ['standard', 'high']),
];

const klingFields = (includeAspectRatio: boolean): FalFieldDefinition[] => [
  selectField(
    'duration',
    'Duration',
    '5',
    Array.from({ length: 13 }, (_, index) => String(index + 3))
  ),
  booleanField('generate_audio', 'Generate audio', true),
  ...(includeAspectRatio
    ? [selectField('aspect_ratio', 'Aspect ratio', '16:9', ['16:9', '9:16', '1:1'])]
    : []),
  textField('negative_prompt', 'Negative prompt', 'Describe visual elements to avoid.'),
];

const HAILUO_STANDARD_FIELDS = [
  selectField('duration', 'Duration', '6', ['6', '10']),
  booleanField('prompt_optimizer', 'Optimize prompt', true),
];

const HAILUO_PRO_FIELDS = [booleanField('prompt_optimizer', 'Optimize prompt', true)];

const wanFields = (includeAspectRatio: boolean): FalFieldDefinition[] => [
  numberField('duration', 'Duration', 5, 2, 15),
  selectField('resolution', 'Resolution', '720p', ['720p', '1080p']),
  ...(includeAspectRatio
    ? [selectField('aspect_ratio', 'Aspect ratio', '16:9', ['16:9', '9:16', '1:1'])]
    : []),
  textField('negative_prompt', 'Negative prompt', 'Describe visual elements to avoid.'),
  booleanField('enable_prompt_expansion', 'Enable prompt expansion', true),
];

export const FAL_VIDEO_MODELS: FalModelDefinition[] = [
  videoModel(
    'veo-3-1',
    'Veo 3.1 Standard',
    'Google',
    'High-quality video generation with native audio.',
    'fal-ai/veo3.1',
    'fal-ai/veo3.1/image-to-video',
    VEO_TEXT_FIELDS,
    VEO_IMAGE_FIELDS
  ),
  videoModel(
    'veo-3-1-fast',
    'Veo 3.1 Fast',
    'Google',
    'Faster Veo 3.1 video generation with native audio.',
    'fal-ai/veo3.1/fast',
    'fal-ai/veo3.1/fast/image-to-video',
    VEO_TEXT_FIELDS,
    VEO_IMAGE_FIELDS
  ),
  videoModel(
    'seedance-2',
    'Seedance 2.0 Standard',
    'ByteDance',
    'Cinematic video generation with synchronized audio.',
    'bytedance/seedance-2.0/text-to-video',
    'bytedance/seedance-2.0/image-to-video',
    seedanceFields(['480p', '720p', '1080p', '4k'])
  ),
  videoModel(
    'seedance-2-fast',
    'Seedance 2.0 Fast',
    'ByteDance',
    'Fast cinematic video generation with synchronized audio.',
    'bytedance/seedance-2.0/fast/text-to-video',
    'bytedance/seedance-2.0/fast/image-to-video',
    seedanceFields(['480p', '720p'])
  ),
  videoModel(
    'kling-3-standard',
    'Kling 3 Standard',
    'Kuaishou',
    'Kling 3 video generation with native audio.',
    'fal-ai/kling-video/v3/standard/text-to-video',
    'fal-ai/kling-video/v3/standard/image-to-video',
    klingFields(true),
    klingFields(false),
    'start_image_url'
  ),
  videoModel(
    'kling-3-pro',
    'Kling 3 Pro',
    'Kuaishou',
    'Higher-tier Kling 3 video generation with native audio.',
    'fal-ai/kling-video/v3/pro/text-to-video',
    'fal-ai/kling-video/v3/pro/image-to-video',
    klingFields(true),
    klingFields(false),
    'start_image_url'
  ),
  videoModel(
    'hailuo-2-3-standard',
    'MiniMax Hailuo 2.3 Standard',
    'MiniMax',
    'Cost-efficient Hailuo 2.3 video generation at 768p.',
    'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
    HAILUO_STANDARD_FIELDS
  ),
  videoModel(
    'hailuo-2-3-pro',
    'MiniMax Hailuo 2.3 Pro',
    'MiniMax',
    'Higher-resolution Hailuo 2.3 video generation at 1080p.',
    'fal-ai/minimax/hailuo-2.3/pro/text-to-video',
    'fal-ai/minimax/hailuo-2.3/pro/image-to-video',
    HAILUO_PRO_FIELDS
  ),
  videoModel(
    'wan-2-7',
    'Wan 2.7',
    'Alibaba',
    'Wan video generation with optional prompt expansion.',
    'fal-ai/wan/v2.7/text-to-video',
    'fal-ai/wan/v2.7/image-to-video',
    wanFields(true),
    wanFields(false)
  ),
];

function assertFalMediaType(mediaType: unknown): asserts mediaType is FalMediaType {
  if (mediaType !== 'image' && mediaType !== 'video') {
    throw new Error('Invalid fal media type.');
  }
}

function compatibleFalModels(
  mediaType: FalMediaType,
  inputMode: FalInputMode
): FalModelDefinition[] {
  const models = mediaType === 'image' ? [FAL_IMAGE_MODEL] : FAL_VIDEO_MODELS;
  return models.filter((model) => model.variants.some((variant) => variant.inputMode === inputMode));
}

export function modelsForFalMode(
  mediaType: FalMediaType,
  inputMode: FalInputMode
): FalModelDefinition[] {
  assertFalMediaType(mediaType);
  return compatibleFalModels(mediaType, inputMode);
}

export function resolveFalVariant(
  modelId: string,
  mediaType: FalMediaType,
  inputMode: FalInputMode
): FalModelVariant {
  assertFalMediaType(mediaType);
  const model = compatibleFalModels(mediaType, inputMode).find(
    (candidate) => candidate.id === modelId
  );
  const variant = model?.variants.find((candidate) => candidate.inputMode === inputMode);

  if (!variant) {
    throw new Error(`The selected fal model does not support ${inputMode}-to-${mediaType}.`);
  }

  return variant;
}

export function defaultFalValues(variant: FalModelVariant): Record<string, FalValue> {
  return Object.fromEntries(
    variant.fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue as FalValue])
  );
}

export function validateFalInput(
  variant: FalModelVariant,
  args: { prompt: string; uploadUrls: string[] }
): string | null {
  if (!args.prompt.trim()) return 'Enter a prompt for the selected fal model.';
  if (variant.inputMode !== 'image') return null;
  if (args.uploadUrls.length === 0) {
    return 'Add at least one reference image for the selected fal model.';
  }

  const maxInputImages = variant.maxInputImages ?? 1;
  if (args.uploadUrls.length > maxInputImages) {
    return `This fal model accepts up to ${maxInputImages} reference image${maxInputImages === 1 ? '' : 's'}.`;
  }

  return null;
}

function normalizeFalFieldValue(
  field: FalFieldDefinition,
  value: FalValue
): FalValue | undefined {
  let normalized: FalValue = value;

  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`Invalid fal setting "${field.key}".`);
  } else if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid fal setting "${field.key}".`);
    }
    if (field.min !== undefined && value < field.min) {
      throw new Error(`Invalid fal setting "${field.key}".`);
    }
    if (field.max !== undefined && value > field.max) {
      throw new Error(`Invalid fal setting "${field.key}".`);
    }
    if (field.step !== undefined) {
      const offset = value - (field.min ?? 0);
      const steps = offset / field.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) {
        throw new Error(`Invalid fal setting "${field.key}".`);
      }
    }
  } else if (field.type === 'select') {
    if (!field.options?.some((option) => option.value === value)) {
      throw new Error(`Invalid fal setting "${field.key}".`);
    }
  } else {
    if (typeof value !== 'string') throw new Error(`Invalid fal setting "${field.key}".`);
    normalized = value.trim();
    if (!normalized) return undefined;
  }

  return normalized;
}

export function buildFalInput(
  variant: FalModelVariant,
  args: { prompt: string; uploadUrls: string[]; values: Record<string, FalValue> }
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: args.prompt.trim() };
  if (variant.inputMode === 'image' && variant.imageInputKey) {
    input[variant.imageInputKey] = variant.imageInputMultiple ? args.uploadUrls : args.uploadUrls[0];
  }
  for (const field of variant.fields) {
    const suppliedValue = args.values[field.key];
    const value = suppliedValue === undefined ? field.defaultValue : suppliedValue;
    if (value === undefined) continue;
    const normalized = normalizeFalFieldValue(field, value);
    if (normalized !== undefined) input[field.key] = normalized;
  }
  return input;
}

export function extractFalResult(mediaType: FalMediaType, payload: unknown) {
  const record =
    payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const media =
    mediaType === 'image'
      ? Array.isArray(record.images)
        ? record.images[0]
        : undefined
      : record.video;
  const file = media !== null && typeof media === 'object' ? (media as Record<string, unknown>) : {};
  const url = typeof file.url === 'string' ? file.url.trim() : '';
  if (!url) {
    throw new Error('fal completed without a usable media URL.');
  }
  return {
    url,
    mimeType: typeof file.content_type === 'string' ? file.content_type : undefined,
  };
}
