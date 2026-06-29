// Instructions handed to gemini-2.5-flash-lite to produce a fresh example
// prompt per feature. Shared by the /api/example route and the "Use Example"
// tooltip, so what the user sees is exactly what the model is asked.

export const EXAMPLE_META_PROMPTS: Record<string, string> = {
  'text-to-image':
    'Produce ONE vivid text-to-image prompt describing a single scene or subject in about one sentence. Vary the subject, setting, mood, and style each time; favor fresh, unexpected ideas over clichés.',
  'image-editing':
    'Produce ONE image-editing instruction that modifies an existing photo — change, add, remove, or restyle an element — in about one sentence. Keep it concrete and broadly applicable.',
  'multi-image-compose':
    'Produce ONE instruction for creatively combining two reference images. Keep it generic and broadly applicable: take an attribute (style, outfit, object, lighting, or mood) from the first image and apply it to the subject of the second with an interesting twist. About one sentence.',
  'search-grounding':
    'Produce ONE prompt that asks to visualize current, real-world information (weather, trends, sports, news, prices, and so on) as a creative image, in about one sentence. Vary the topic each time.',
  'social-media-thumbnail':
    'Produce ONE punchy concept for a viral YouTube or social thumbnail: a dramatic scene with a bold, curiosity-driving idea, in about one sentence. Make it eye-catching and varied.',
  'style-transfer':
    'Produce ONE artistic style-transfer instruction that applies a distinctive visual style or aesthetic to an image, in about one sentence. Vary the style each time.',
};

export const DEFAULT_EXAMPLE_META =
  'Produce ONE concise, creative example prompt for this image tool in about one sentence.';

// A random tone is mixed in per request to keep successive examples varied.
export const SEED_TONES = [
  'cinematic', 'whimsical', 'nostalgic', 'futuristic', 'surreal', 'minimal',
  'vibrant', 'moody', 'playful', 'epic', 'dreamy', 'gritty', 'serene', 'bold',
];

/** The human-readable instruction shown in the tooltip. */
export function metaForFeature(featureId: string): string {
  return EXAMPLE_META_PROMPTS[featureId] ?? DEFAULT_EXAMPLE_META;
}

/** The full prompt sent to the model (instruction + variety nudge + format rule). */
export function buildExamplePrompt(featureId: string, seed?: string): string {
  const meta = metaForFeature(featureId);
  const tone = seed ? ` Lean into a ${seed} tone.` : '';
  return `${meta}${tone}\n\nOutput only the prompt text — no quotes, labels, or explanation.`;
}

/** Instruction handed to flash-lite to turn a prompt into a short filename slug. */
export function buildSlugPrompt(prompt: string): string {
  return `Turn this image-generation prompt into a short, evocative filename slug: 3 to 6 words, all lowercase, hyphen-separated, only letters and hyphens, no file extension. Capture the most striking, specific elements (subject, mood, setting) rather than generic filler.\n\nPrompt: ${prompt}\n\nOutput only the slug.`;
}

/** Deterministic fallback slug, used when the model is unavailable or returns nothing. */
export function slugify(text: string, maxWords = 6): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

/** Normalize any model output into a safe kebab-case slug (≤ 6 words). */
export function cleanSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}
