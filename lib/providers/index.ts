// lib/providers/index.ts
import { atlasAdapter } from './atlas';
import { cometAdapter } from './comet';
import { runwareAdapter } from './runware';
import { ProviderError, type ProviderAdapter, type ProviderId } from './types';

export const PROVIDER_ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  runware: runwareAdapter,
  atlas: atlasAdapter,
  comet: cometAdapter,
};

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'runware' || value === 'atlas' || value === 'comet';
}

export function getAdapter(id: ProviderId): ProviderAdapter {
  return PROVIDER_ADAPTERS[id];
}

/**
 * All three providers hand back a URL. The rest of this app — gallery capture,
 * downloads, drop-to-reuse — is built on base64 bytes from `/api/generate`, and
 * the provider URLs expire (Runware keeps them 7 days by default). So the route
 * fetches once, server-side, and the bytes are what become durable.
 */
export async function fetchAsBase64(
  url: string,
  provider: ProviderId
): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ProviderError(
      `Could not download the finished image from ${getAdapter(provider).label}.`,
      502,
      provider
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) {
    throw new ProviderError(`${getAdapter(provider).label} returned an empty image.`, 502, provider);
  }
  return {
    base64: buffer.toString('base64'),
    mimeType: response.headers.get('content-type') || 'image/png',
  };
}

export * from './types';
export * from './catalog';
