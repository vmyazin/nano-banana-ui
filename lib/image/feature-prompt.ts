/** Keep feature prompt expansion identical for guest and account execution. */
export function featureImagePrompt(featureId: string, prompt: string, imageCount: number): string {
  let finalPrompt = prompt;
  if (featureId === 'social-media-thumbnail') {
    finalPrompt = `Create a VIRAL YouTube/Social Media thumbnail with these elements:
- DRAMATIC, eye-catching scene with shocked/surprised facial expression
- BIG, BOLD text overlays with key phrases (use vibrant colors like yellow, red, white)
- Arrows, circles, or highlighting elements pointing to important parts
- High contrast and saturated colors for maximum impact
- Professional editing style that screams "CLICK ME!"
- Energy and urgency in the composition

User's custom requirements: ${prompt}

Style: Photorealistic, professional thumbnail editing, viral content aesthetics`;
  } else if (featureId === 'style-transfer') {
    if (imageCount === 2) {
      finalPrompt = prompt || 'Apply the artistic style and aesthetic from the first image to the content and composition of the second image. Preserve the subject matter of the second image while adopting the color palette, brushstrokes, texture, and artistic techniques of the first image.';
    } else if (imageCount === 1) {
      finalPrompt = prompt || 'Transform this image into an artistic masterpiece. Apply creative stylization while maintaining the core composition and subject matter.';
    }
  }

  return finalPrompt;
}
