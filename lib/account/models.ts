/** Fixed engines share identifiers between the browser request and Worker validation. */
export const SINGLE_IMAGE_MODELS = {
  gemini: 'gemini-3-pro-image-preview',
  cloudflare: '@cf/black-forest-labs/flux-1-schnell',
  pollinations: 'flux',
} as const;
