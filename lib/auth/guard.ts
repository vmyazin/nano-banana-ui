import { NextResponse } from 'next/server';

import { accountForSession, SESSION_COOKIE, type Account } from '@/lib/auth/accounts';

/**
 * The gate. Applied to the routes that spend the app owner's money or its
 * bandwidth, while the rest of the UI stays browsable.
 *
 * Disabled entirely when no admin address is configured, so a local checkout
 * and the public repo behave as they always did. Setting AUTH_ADMIN_EMAIL is
 * what turns the app private.
 */
export function isGateEnabled(): boolean {
  return (process.env.AUTH_ADMIN_EMAIL ?? '').trim() !== '';
}

export interface GateFailure {
  response: NextResponse;
}

function reject(status: number, error: string, code: string): GateFailure {
  return { response: NextResponse.json({ error, code }, { status }) };
}

/**
 * Resolves the caller, or returns the response to send them.
 *
 * Distinguishes "not signed in" from "waiting for approval" on purpose: the
 * second is not something the person can fix by trying again, and telling them
 * so is kinder than a bare 401.
 */
export function requireApprovedAccount(
  request: Request
): { account: Account | null } | GateFailure {
  if (!isGateEnabled()) return { account: null };

  const token = readSessionCookie(request);
  const account = accountForSession(token);

  if (!account) {
    return reject(401, 'Sign in to use this feature.', 'signin_required');
  }
  if (account.status === 'blocked') {
    return reject(403, 'This account no longer has access.', 'blocked');
  }
  if (account.status !== 'approved') {
    return reject(403, 'Your account is waiting to be approved.', 'pending_approval');
  }
  return { account };
}

export function isGateFailure(result: { account: Account | null } | GateFailure): result is GateFailure {
  return 'response' in result;
}

/** Route handlers receive a plain Request, so the cookie is parsed by hand. */
export function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
