import { describe, expect, it } from 'vitest';
import {
  FAL_IMAGE_MODEL,
  FAL_VIDEO_MODELS,
  buildFalInput,
  defaultFalValues,
  extractFalResult,
  modelsForFalMode,
  resolveFalVariant,
  validateFalInput,
} from '../../lib/fal/catalog';

const VIDEO_ENDPOINTS = [
  ['veo-3-1', 'fal-ai/veo3.1', 'fal-ai/veo3.1/image-to-video'],
  ['veo-3-1-fast', 'fal-ai/veo3.1/fast', 'fal-ai/veo3.1/fast/image-to-video'],
  ['seedance-2', 'bytedance/seedance-2.0/text-to-video', 'bytedance/seedance-2.0/image-to-video'],
  [
    'seedance-2-fast',
    'bytedance/seedance-2.0/fast/text-to-video',
    'bytedance/seedance-2.0/fast/image-to-video',
  ],
  [
    'kling-3-standard',
    'fal-ai/kling-video/v3/standard/text-to-video',
    'fal-ai/kling-video/v3/standard/image-to-video',
  ],
  [
    'kling-3-pro',
    'fal-ai/kling-video/v3/pro/text-to-video',
    'fal-ai/kling-video/v3/pro/image-to-video',
  ],
  ['sora-2', 'fal-ai/sora-2/text-to-video', 'fal-ai/sora-2/image-to-video'],
  ['sora-2-pro', 'fal-ai/sora-2/text-to-video/pro', 'fal-ai/sora-2/image-to-video/pro'],
  ['wan-2-7', 'fal-ai/wan/v2.7/text-to-video', 'fal-ai/wan/v2.7/image-to-video'],
] as const;

describe('fal model catalog', () => {
  it('contains Nano Banana 2 plus exactly nine curated video choices', () => {
    expect(FAL_IMAGE_MODEL.id).toBe('nano-banana-2');
    expect(FAL_VIDEO_MODELS.map((model) => model.id)).toEqual([
      'veo-3-1',
      'veo-3-1-fast',
      'seedance-2',
      'seedance-2-fast',
      'kling-3-standard',
      'kling-3-pro',
      'sora-2',
      'sora-2-pro',
      'wan-2-7',
    ]);
  });

  it('maps the Nano Banana text and edit endpoints exactly', () => {
    expect(resolveFalVariant('nano-banana-2', 'image', 'text').endpointId).toBe(
      'fal-ai/nano-banana-2'
    );
    expect(resolveFalVariant('nano-banana-2', 'image', 'image')).toMatchObject({
      endpointId: 'fal-ai/nano-banana-2/edit',
      imageInputKey: 'image_urls',
      imageInputMultiple: true,
      maxInputImages: 14,
    });
  });

  it('defines text and image variants for all 18 curated video endpoints', () => {
    expect(FAL_VIDEO_MODELS.flatMap((model) => model.variants)).toHaveLength(18);

    for (const [modelId, textEndpoint, imageEndpoint] of VIDEO_ENDPOINTS) {
      expect(resolveFalVariant(modelId, 'video', 'text').endpointId).toBe(textEndpoint);
      expect(resolveFalVariant(modelId, 'video', 'image').endpointId).toBe(imageEndpoint);
    }
  });

  it('exposes all nine video choices for image-to-video', () => {
    expect(modelsForFalMode('video', 'image').map((model) => model.id)).toEqual(
      VIDEO_ENDPOINTS.map(([modelId]) => modelId)
    );
  });

  it('uses the documented Veo Fast image endpoint and conservative defaults', () => {
    const variant = resolveFalVariant('veo-3-1-fast', 'video', 'image');

    expect(variant.endpointId).toBe('fal-ai/veo3.1/fast/image-to-video');
    expect(defaultFalValues(variant)).toMatchObject({
      aspect_ratio: 'auto',
      duration: '8s',
      resolution: '720p',
      generate_audio: true,
    });
  });

  it('maps only declared Nano edit inputs and applies field defaults', () => {
    const edit = resolveFalVariant('nano-banana-2', 'image', 'image');

    expect(
      buildFalInput(edit, {
        prompt: '  Combine these references  ',
        uploadUrls: ['https://v3.fal.media/a.png', 'https://v3.fal.media/b.png'],
        values: {
          aspect_ratio: '16:9',
          resolution: '2K',
          enable_web_search: true,
          ignored: 'no',
        },
      })
    ).toEqual({
      prompt: 'Combine these references',
      image_urls: ['https://v3.fal.media/a.png', 'https://v3.fal.media/b.png'],
      aspect_ratio: '16:9',
      resolution: '2K',
      enable_web_search: true,
    });

    expect(
      buildFalInput(edit, {
        prompt: 'Use catalog defaults',
        uploadUrls: ['https://v3.fal.media/a.png'],
        values: {},
      })
    ).toEqual({
      prompt: 'Use catalog defaults',
      image_urls: ['https://v3.fal.media/a.png'],
      aspect_ratio: 'auto',
      resolution: '1K',
      enable_web_search: false,
    });
  });

  it('rejects invalid number values and accepts declared boundaries and defaults', () => {
    const variant = resolveFalVariant('kling-3-standard', 'video', 'text');

    for (const duration of [2, 15.5, 16, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        buildFalInput(variant, {
          prompt: 'Animate this scene',
          uploadUrls: [],
          values: { duration },
        })
      ).toThrow('Invalid fal setting "duration".');
    }

    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { duration: 3 },
      }).duration
    ).toBe(3);
    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { duration: 15 },
      }).duration
    ).toBe(15);
    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: {},
      }).duration
    ).toBe(5);
  });

  it('rejects values outside select allow-lists', () => {
    const variant = resolveFalVariant('veo-3-1-fast', 'video', 'image');

    expect(() =>
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: ['https://v3.fal.media/reference.png'],
        values: { aspect_ratio: '4:3' },
      })
    ).toThrow('Invalid fal setting "aspect_ratio".');
    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: ['https://v3.fal.media/reference.png'],
        values: { aspect_ratio: '9:16' },
      }).aspect_ratio
    ).toBe('9:16');
  });

  it('honors fractional number steps without rejecting floating-point equivalents', () => {
    const base = resolveFalVariant('kling-3-standard', 'video', 'text');
    const variant = {
      ...base,
      fields: [
        {
          key: 'strength',
          label: 'Strength',
          type: 'number' as const,
          defaultValue: 0.3,
          min: 0,
          max: 1,
          step: 0.1,
        },
      ],
    };

    expect(buildFalInput(variant, { prompt: 'Test', uploadUrls: [], values: {} }).strength).toBe(
      0.3
    );
    expect(() =>
      buildFalInput(variant, {
        prompt: 'Test',
        uploadUrls: [],
        values: { strength: 0.35 },
      })
    ).toThrow('Invalid fal setting "strength".');
  });

  it('rejects wrong boolean types without echoing their values', () => {
    const variant = resolveFalVariant('veo-3-1-fast', 'video', 'text');

    expect(() =>
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { generate_audio: 'secret-provider-value' },
      })
    ).toThrow('Invalid fal setting "generate_audio".');
    expect(() =>
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { generate_audio: null as never },
      })
    ).toThrow('Invalid fal setting "generate_audio".');
    expect(() =>
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { generate_audio: '' },
      })
    ).toThrow('Invalid fal setting "generate_audio".');
  });

  it('validates defaults and trims or omits declared text settings', () => {
    const variant = resolveFalVariant('kling-3-standard', 'video', 'text');
    const invalidDefault = {
      ...variant,
      fields: variant.fields.map((field) =>
        field.key === 'duration' ? { ...field, defaultValue: 'five' } : field
      ),
    };

    expect(() =>
      buildFalInput(invalidDefault, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: {},
      })
    ).toThrow('Invalid fal setting "duration".');
    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { negative_prompt: '  blur and smoke  ' },
      }).negative_prompt
    ).toBe('blur and smoke');
    expect(
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { negative_prompt: '   ' },
      })
    ).not.toHaveProperty('negative_prompt');
    expect(() =>
      buildFalInput(variant, {
        prompt: 'Animate this scene',
        uploadUrls: [],
        values: { negative_prompt: 42 },
      })
    ).toThrow('Invalid fal setting "negative_prompt".');
  });

  it('declares the verified controls and constraints for every video family', () => {
    const field = (modelId: string, inputMode: 'text' | 'image', key: string) =>
      resolveFalVariant(modelId, 'video', inputMode).fields.find((candidate) => candidate.key === key);

    expect(field('veo-3-1', 'text', 'duration')?.options?.map(({ value }) => value)).toEqual([
      '4s',
      '6s',
      '8s',
    ]);
    expect(field('veo-3-1', 'text', 'resolution')?.options?.map(({ value }) => value)).toEqual([
      '720p',
      '1080p',
      '4k',
    ]);

    expect(field('seedance-2', 'text', 'duration')).toMatchObject({ min: 4, max: 15, step: 1 });
    expect(field('seedance-2', 'text', 'resolution')?.options?.map(({ value }) => value)).toEqual([
      '480p',
      '720p',
      '1080p',
      '4k',
    ]);
    expect(field('seedance-2-fast', 'text', 'resolution')?.options?.map(({ value }) => value)).toEqual([
      '480p',
      '720p',
    ]);
    expect(resolveFalVariant('seedance-2', 'video', 'text').fields.map(({ key }) => key)).toEqual([
      'duration',
      'resolution',
      'generate_audio',
      'aspect_ratio',
      'bitrate_mode',
    ]);

    expect(field('kling-3-standard', 'text', 'duration')).toMatchObject({ min: 3, max: 15, step: 1 });
    expect(field('kling-3-standard', 'text', 'aspect_ratio')).toBeDefined();
    expect(field('kling-3-standard', 'image', 'aspect_ratio')).toBeUndefined();
    expect(field('kling-3-pro', 'image', 'negative_prompt')).toBeDefined();

    expect(field('sora-2', 'text', 'duration')?.options?.map(({ value }) => value)).toEqual([
      4,
      8,
      12,
      16,
      20,
    ]);
    expect(field('sora-2', 'text', 'resolution')?.options?.map(({ value }) => value)).toEqual([
      'auto',
      '720p',
    ]);
    expect(field('sora-2-pro', 'text', 'resolution')?.options?.map(({ value }) => value)).toEqual([
      '720p',
      '1080p',
      'true_1080p',
    ]);
    expect(field('sora-2-pro', 'image', 'delete_video')).toBeDefined();

    expect(field('wan-2-7', 'text', 'duration')).toMatchObject({ min: 2, max: 15, step: 1 });
    expect(field('wan-2-7', 'text', 'aspect_ratio')).toBeDefined();
    expect(field('wan-2-7', 'image', 'aspect_ratio')).toBeUndefined();
    expect(field('wan-2-7', 'image', 'negative_prompt')).toBeDefined();
    expect(field('wan-2-7', 'image', 'enable_prompt_expansion')).toBeDefined();
  });

  it('requires a prompt and enforces Nano edit reference bounds', () => {
    const edit = resolveFalVariant('nano-banana-2', 'image', 'image');

    expect(validateFalInput(edit, { prompt: '   ', uploadUrls: ['https://x/0.png'] })).toMatch(/prompt/i);
    expect(validateFalInput(edit, { prompt: 'Edit', uploadUrls: [] })).toMatch(/at least one/i);
    expect(
      validateFalInput(edit, {
        prompt: 'Edit',
        uploadUrls: Array.from({ length: 15 }, (_, index) => `https://x/${index}.png`),
      })
    ).toMatch(/up to 14/i);
    expect(
      validateFalInput(edit, {
        prompt: 'Edit',
        uploadUrls: Array.from({ length: 14 }, (_, index) => `https://x/${index}.png`),
      })
    ).toBeNull();
  });

  it('normalizes image and video results and rejects missing media URLs', () => {
    expect(
      extractFalResult('image', {
        images: [{ url: 'https://fal/image.png', content_type: 'image/png' }],
      })
    ).toEqual({ url: 'https://fal/image.png', mimeType: 'image/png' });
    expect(
      extractFalResult('video', {
        video: { url: 'https://fal/video.mp4', content_type: 'video/mp4' },
      })
    ).toEqual({ url: 'https://fal/video.mp4', mimeType: 'video/mp4' });
    expect(extractFalResult('image', { images: [{ url: 'https://fal/image.png' }] })).toEqual({
      url: 'https://fal/image.png',
      mimeType: undefined,
    });
    expect(() => extractFalResult('image', { images: [] })).toThrow(/usable media URL/i);
    expect(() => extractFalResult('video', { video: { content_type: 'video/mp4' } })).toThrow(/usable media URL/i);
  });

  it('trims result URLs and rejects whitespace-only URLs', () => {
    expect(extractFalResult('image', { images: [{ url: '  https://fal/image.png  ' }] }).url).toBe(
      'https://fal/image.png'
    );
    expect(() => extractFalResult('image', { images: [{ url: '   ' }] })).toThrow(
      /usable media URL/i
    );
    expect(() => extractFalResult('video', { video: { url: '\n\t' } })).toThrow(
      /usable media URL/i
    );
  });

  it('rejects unknown model IDs and incompatible media variants safely', () => {
    expect(() => resolveFalVariant('not-a-model', 'video', 'text')).toThrow(/does not support|unknown/i);
    expect(() => resolveFalVariant('nano-banana-2', 'video', 'text')).toThrow(/does not support|incompatible/i);
    expect(() => resolveFalVariant('veo-3-1', 'image', 'text')).toThrow(/does not support|incompatible/i);
  });

  it('rejects invalid runtime media types instead of treating them as video', () => {
    expect(() => resolveFalVariant('veo-3-1', 'audio' as never, 'text')).toThrow(
      'Invalid fal media type.'
    );
  });

  it('rejects invalid runtime media types when filtering models', () => {
    expect(() => modelsForFalMode('audio' as never, 'text')).toThrow(
      'Invalid fal media type.'
    );
  });
});
