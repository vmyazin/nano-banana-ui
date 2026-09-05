/** Fixed engines share identifiers between the browser request and Worker validation. */
export const SINGLE_IMAGE_MODELS = {
  gemini: 'gemini-3-pro-image-preview',
  cloudflare: '@cf/black-forest-labs/flux-1-schnell',
  pollinations: 'flux',
} as const;

/** What a person calls these models, kept beside the ids they name so the two
 *  cannot drift. The aggregators carry their own labels in their catalogs. */
export const SINGLE_IMAGE_MODEL_LABELS: Record<keyof typeof SINGLE_IMAGE_MODELS,string> = {
  gemini: 'Gemini 3 Pro Image',
  cloudflare: 'FLUX.1 [schnell]',
  pollinations: 'FLUX',
};
