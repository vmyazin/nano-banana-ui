// lib/providers/key-source.ts
import type { ProviderId } from '@/lib/providers/types';

/**
 * Where a provider's API keys actually come from. Two surfaces send people to
 * these pages — the connections dialog and the not-connected callout on a
 * workspace — and a console URL that lives in only one of them drifts the
 * moment a vendor moves its keys page, so both read this map.
 */
export interface KeySource {
  /** The vendor page that issues the key. */
  href: string;
  /** The same URL without its scheme, for showing the destination inline. */
  urlLabel: string;
}

export const KEY_SOURCES: Record<ProviderId, KeySource> = {
  runware: {
    href: 'https://runware.ai/signup',
    urlLabel: 'runware.ai/signup',
  },
  atlas: {
    href: 'https://www.atlascloud.ai/console/api-keys',
    urlLabel: 'atlascloud.ai/console/api-keys',
  },
  comet: {
    href: 'https://api.cometapi.com/console/token',
    urlLabel: 'api.cometapi.com/console/token',
  },
};
