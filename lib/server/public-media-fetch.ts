import { lookup } from 'node:dns/promises';

import { isBlockedAddress } from '@/lib/drop/private-address';

export interface PublicMediaFetchFailure {
  kind: 'blocked' | 'failed';
  status: 400 | 403 | 502;
}

interface PublicMediaFetchOptions {
  accept: string;
  timeoutMs: number;
  maxRedirects?: number;
}

/**
 * Reject a URL whose hostname resolves anywhere private. Every address in the
 * answer is checked: a host with one public and one loopback record must not be
 * reachable on a coin flip.
 *
 * Residual risk, accepted: DNS may return something different between this
 * lookup and the fetch below (rebinding). Closing that gap requires dialing the
 * validated IP with an overridden Host header, which breaks TLS SNI for HTTPS.
 */
async function isPublicHost(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(literal) || literal.includes(':')) {
    return !isBlockedAddress(literal);
  }

  try {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    return answers.length > 0
      && answers.every((answer) => !isBlockedAddress(answer.address, answer.family));
  } catch {
    return false;
  }
}

/**
 * Fetch credential-free public media while validating every redirect hop.
 * Automatic redirect following would let a public URL bounce the server into a
 * private or link-local address, so each destination is resolved before use.
 */
export async function fetchPublicMedia(
  startUrl: URL,
  options: PublicMediaFetchOptions
): Promise<Response | PublicMediaFetchFailure> {
  const maxRedirects = options.maxRedirects ?? 3;
  let url = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || Boolean(url.username)
      || Boolean(url.password)
    ) {
      return { kind: 'blocked', status: 400 };
    }
    if (!(await isPublicHost(url.hostname))) {
      return { kind: 'blocked', status: 403 };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        // The proxy must not borrow cookies or any other server identity.
        credentials: 'omit',
        headers: { accept: options.accept },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      return { kind: 'failed', status: 502 };
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    void response.body?.cancel();
    if (!location) return { kind: 'failed', status: 502 };

    try {
      url = new URL(location, url);
    } catch {
      return { kind: 'failed', status: 502 };
    }
  }

  return { kind: 'failed', status: 502 };
}

