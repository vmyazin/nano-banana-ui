import { lookup } from 'node:dns/promises';

import { NextRequest, NextResponse } from 'next/server';

import { isBlockedAddress } from '@/lib/drop/private-address';
import { isGateFailure, requireApprovedAccount } from '@/lib/auth/guard';

// node:dns rules this out of the edge runtime, and the address check is the whole point.
export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_URL_LENGTH = 2048;

const GENERIC_ERROR = 'That image could not be fetched from its source.';
const BLOCKED_ERROR = 'That address cannot be fetched.';

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Reject a URL whose hostname resolves anywhere private. Every address in the answer is
 * checked, not just the first: a host with one public and one loopback A record must not
 * be reachable on a coin flip.
 *
 * Residual risk, accepted: DNS may return something different between this lookup and the
 * fetch below (rebinding). Closing that means dialing the validated IP with an overridden
 * Host header, which breaks TLS SNI for https. What leaks here is a blind request — the
 * response only ever reaches the caller as image bytes under a fixed content type.
 */
async function assertPublicHost(hostname: string): Promise<boolean> {
  // A bare IP in the URL never reaches DNS, so check it directly first.
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(literal) || literal.includes(':')) {
    return !isBlockedAddress(literal);
  }

  try {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    if (answers.length === 0) return false;
    return answers.every((answer) => !isBlockedAddress(answer.address, answer.family));
  } catch {
    return false;
  }
}

/**
 * Follow redirects by hand. `fetch`'s own following would validate only the first hop,
 * which is exactly the shape of an SSRF bypass: a public URL that 302s to 169.254.169.254.
 */
async function fetchImage(startUrl: URL): Promise<Response | { error: string; status: number }> {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: BLOCKED_ERROR, status: 400 };
    }
    if (!(await assertPublicHost(url.hostname))) {
      return { error: BLOCKED_ERROR, status: 403 };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        // No cookies, no auth: the proxy must not borrow the server's identity.
        credentials: 'omit',
        headers: { accept: 'image/*' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return { error: GENERIC_ERROR, status: 502 };
    }

    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect) return response;

    const location = response.headers.get('location');
    void response.body?.cancel();
    if (!location) return { error: GENERIC_ERROR, status: 502 };

    try {
      url = new URL(location, url);
    } catch {
      return { error: GENERIC_ERROR, status: 502 };
    }
  }

  return { error: GENERIC_ERROR, status: 502 };
}

/**
 * Read the body with a hard ceiling. Content-Length is a claim by the remote host — it can
 * be absent, or a lie — so the running total is what actually enforces the cap.
 */
async function readCapped(response: Response): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return undefined;

  const reader = response.body?.getReader();
  if (!reader) return undefined;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      void reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function POST(request: NextRequest) {
  // A no-op unless AUTH_ADMIN_EMAIL is set, but a private deployment should not expose an
  // open fetch proxy to anyone who finds the URL.
  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'The request body must be JSON.');
  }

  const raw =
    body !== null && typeof body === 'object' && 'url' in body && typeof body.url === 'string'
      ? body.url.trim()
      : '';
  if (!raw || raw.length > MAX_URL_LENGTH) return fail(400, 'An image URL is required.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(400, 'An image URL is required.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail(400, BLOCKED_ERROR);

  const result = await fetchImage(url);
  if (!(result instanceof Response)) return fail(result.status, result.error);
  if (!result.ok) {
    void result.body?.cancel();
    return fail(502, GENERIC_ERROR);
  }

  const contentType = (result.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    void result.body?.cancel();
    return fail(415, 'That link does not point at a supported image.');
  }

  const bytes = await readCapped(result);
  if (!bytes) return fail(413, 'That image is too large.');

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      // Fixed type and attachment disposition: whatever came back, our own origin never
      // renders it as a document.
      'Content-Type': contentType,
      'Content-Disposition': 'attachment',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
