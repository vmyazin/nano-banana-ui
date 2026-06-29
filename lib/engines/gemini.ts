import { GoogleGenAI } from '@google/genai';

export interface EngineResult {
  imageData: string; // base64, no data: prefix
  mimeType: string;
}

interface GeminiOpts {
  prompt?: string;
  images?: string[]; // base64 (already stripped of data: prefix)
  config?: {
    aspectRatio?: string;
    imageSize?: string;
    useGoogleSearch?: boolean;
  };
  apiKey: string;
}

const MODEL = 'gemini-3-pro-image-preview';

export async function geminiGenerate(opts: GeminiOpts): Promise<EngineResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  const promptParts: any[] = [];
  if (opts.prompt) promptParts.push({ text: opts.prompt });
  for (const img of opts.images || []) {
    promptParts.push({ inlineData: { mimeType: 'image/png', data: img } });
  }

  // Generation params must be nested under `config` (not spread at top level),
  // or @google/genai silently ignores imageConfig/tools.
  const config: any = {};
  if (opts.config?.aspectRatio || opts.config?.imageSize) {
    config.imageConfig = {};
    if (opts.config.aspectRatio) config.imageConfig.aspectRatio = opts.config.aspectRatio;
    if (opts.config.imageSize) config.imageConfig.imageSize = opts.config.imageSize;
  }
  if (opts.config?.useGoogleSearch) config.tools = [{ googleSearch: {} }];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: promptParts,
    config,
  });

  let imageData: string | null = null;
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) imageData = part.inlineData.data;
    }
  }

  if (!imageData) {
    const reason = response.candidates?.[0]?.finishReason;
    throw new Error(
      'No image data returned from the API. Please try again.' + (reason ? ` (${reason})` : '')
    );
  }

  return { imageData, mimeType: 'image/png' };
}
