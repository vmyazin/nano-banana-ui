import type { EngineResult } from './gemini';
import { POLLINATIONS_IMAGE_DIMENSIONS, ratioDimensions } from '../providers/output-size';

// Free, no-key FLUX text-to-image via Pollinations' classic endpoint. The
// ratio→pixel table lives in `output-size.ts` so the image control can name
// what a ratio resolves to without a second copy of the numbers.

interface PollinationsOpts {
  prompt: string;
  aspectRatio?: string;
  /** Omitted preserves the existing guest endpoint. */
  apiKey?: string;
}

export async function pollinationsResponse(opts: PollinationsOpts): Promise<Response> {
  const [width, height] = ratioDimensions(POLLINATIONS_IMAGE_DIMENSIONS, opts.aspectRatio);
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const url =
    `${opts.apiKey ? 'https://gen.pollinations.ai/image/' : 'https://image.pollinations.ai/prompt/'}${encodeURIComponent(opts.prompt)}` +
    `?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  const res = await fetch(url, opts.apiKey ? {headers:{Authorization:`Bearer ${opts.apiKey}`},redirect:'error'} : undefined);
  if (!res.ok) {
    throw new Error(`Pollinations returned ${res.status}. The free service may be busy — try again.`);
  }

  return res;
}

export async function pollinationsGenerate(opts: PollinationsOpts): Promise<EngineResult> {
  const res = await pollinationsResponse(opts);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error('Pollinations returned an empty image. Please try again.');
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { imageData: buf.toString('base64'), mimeType };
}
