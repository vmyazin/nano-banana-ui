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
    'Produce ONE concept for a YouTube or social thumbnail: a single dramatic scene with a clear focal point, in about one sentence. Vary the subject each time.',
  'style-transfer':
    'Produce ONE artistic style-transfer instruction that applies a distinctive visual style or aesthetic to an image, in about one sentence. Vary the style each time.',
  'text-to-video':
    [
      'Write ONE vivid text-to-video prompt in 35-50 words on a single line.',
      'Stage one continuous short shot with a specific subject and setting: opening, action, and payoff. Show a decisive physical action followed by a visible reaction or reveal, achievable within a few seconds.',
      'Specify one camera movement with direction and pace, plus lighting or environmental motion that reinforces the action.',
      'Use concrete verbs, not hype. Vary subjects; match the mood, including subtle payoffs for quiet scenes. No montage, competing camera moves, quality tags, dialogue, or sound requirements.',
    ].join(' '),
  'image-to-video':
    [
      'Produce ONE concise image-to-video instruction that can be applied unchanged to any supplied image — a landscape, an individual portrait, a group, an object, or artwork.',
      'Write 30-50 words on a single line. Describe only scene-neutral lighting, atmosphere, ambient motion, and camera movement.',
      'Give actionable direction: an opening hold, one camera move with a direction and pace, then a gentle settling finish. Use concrete verbs rather than cinematic buzzwords.',
      'Preserve the original composition, visual identity, and geometry; keep motion restrained and physically plausible, without adding elements or assuming depth layers.',
      'Refer to unknown visual content only as “the scene” or “the view.”',
      'Do not invent or identify subjects, subject counts, objects, settings, clothing, demographics, art styles, or media.',
    ].join(' '),
  'frames-to-video':
    [
      'Produce ONE actionable frames-to-video instruction in 30-50 words, on a single line, connecting a supplied first frame to a supplied last frame.',
      'Begin exactly at the first frame, describe a continuous transition with clear pacing, and ease into the exact last frame with a brief hold.',
      'The frames are not visible to you. Refer only to the first frame, the last frame, and the transition. Give pacing and continuity instructions, never actions for an imagined subject. Keep camera movement minimal so both endpoint compositions remain achievable.',
      'Do not describe either frame itself or invent subjects, objects, scenery, or events. No walking, body parts, gestures, turns, numeric camera angles, or assumed positions. Avoid cuts, abrupt morphs, overshooting the final frame, and generic quality adjectives.',
    ].join(' '),
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
