import type { EngineResult } from './gemini';

// Cloudflare Workers AI — FLUX.1 [schnell]. Free daily neuron allocation.
// Fixed output size (no width/height); returns JSON { result: { image: base64 } }.
const MODEL = '@cf/black-forest-labs/flux-1-schnell';

interface CloudflareOpts {
  prompt: string;
  accountId: string;
  token: string;
}

export async function cloudflareGenerate(opts: CloudflareOpts): Promise<EngineResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ prompt: opts.prompt, steps: 8 }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.success === false)) {
    const msg =
      data?.errors?.[0]?.message ||
      (res.status === 401 || res.status === 403
        ? 'Cloudflare rejected the credentials. Check your Account ID and API token.'
        : `Cloudflare returned ${res.status}.`);
    throw new Error(msg);
  }

  const image: string | undefined = data?.result?.image ?? data?.image;
  if (!image) {
    throw new Error('Cloudflare returned no image. Please try again.');
  }
  return { imageData: image, mimeType: 'image/jpeg' };
}
