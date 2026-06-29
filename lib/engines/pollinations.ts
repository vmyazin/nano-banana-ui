import type { EngineResult } from './gemini';

// Free, no-key FLUX text-to-image via Pollinations' classic endpoint.
// FLUX runs near 1 MP, so map the aspect ratio to ~1 MP dimensions.
const DIMS: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '4:3': [1024, 768],
  '3:4': [768, 1024],
  '3:2': [1080, 720],
  '21:9': [1280, 548],
};

interface PollinationsOpts {
  prompt: string;
  aspectRatio?: string;
}

export async function pollinationsGenerate(opts: PollinationsOpts): Promise<EngineResult> {
  const [width, height] = DIMS[opts.aspectRatio ?? '1:1'] ?? [1024, 1024];
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(opts.prompt)}` +
    `?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pollinations returned ${res.status}. The free service may be busy — try again.`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error('Pollinations returned an empty image. Please try again.');
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { imageData: buf.toString('base64'), mimeType };
}
