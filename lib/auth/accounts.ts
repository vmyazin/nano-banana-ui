import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { adminEmail, authDatabase, type SessionRow, type UserRow, type UserStatus } from '@/lib/auth/db';
import { hashPassword, normalizeEmail, verifyPassword } from '@/lib/auth/passwords';

export const SESSION_COOKIE = 'scene_assembly_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Account {
  id: string;
  email: string;
  status: UserStatus;
  isAdmin: boolean;
  createdAt: number;
}

function toAccount(row: UserRow): Account {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

/** Sessions are stored as a hash, so a database read cannot mint a valid cookie. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function findUserByEmail(email: string): UserRow | undefined {
  return authDatabase()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export async function createAccount(
  email: string,
  password: string
): Promise<{ account: Account } | { error: string }> {
  const normalized = normalizeEmail(email);
  if (findUserByEmail(normalized)) {
    // Deliberately the same wording as a successful request: whether an address
    // is registered is not something an anonymous caller should learn.
    return { error: 'duplicate' };
  }

  // The configured admin is approved immediately, so there is someone to approve
  // everyone else. Everybody else waits.
  const isAdmin = normalized !== '' && normalized === adminEmail();
  const row: UserRow = {
    id: randomUUID(),
    email: normalized,
    password_hash: await hashPassword(password),
    status: isAdmin ? 'approved' : 'pending',
    is_admin: isAdmin ? 1 : 0,
    created_at: Date.now(),
  };

  authDatabase()
    .prepare(
      'INSERT INTO users (id, email, password_hash, status, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(row.id, row.email, row.password_hash, row.status, row.is_admin, row.created_at);

  return { account: toAccount(row) };
}

/**
 * Verifies credentials. A pending or blocked account still authenticates — the
 * caller decides what that means — so the UI can say "waiting for approval"
 * rather than "wrong password".
 */
export async function authenticate(email: string, password: string): Promise<Account | null> {
  const row = findUserByEmail(email);
  if (!row) {
    // Spend comparable time on an unknown address so timing does not reveal it.
    await verifyPassword(password, 'scrypt$00$00');
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? toAccount(row) : null;
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  authDatabase()
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, expiresAt);
  return { token, expiresAt };
}

/** Resolves a cookie to its account, clearing the row once it has expired. */
export function accountForSession(token: string | undefined): Account | null {
  if (!token) return null;

  const id = hashToken(token);
  const session = authDatabase()
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  if (!session) return null;

  if (session.expires_at <= Date.now()) {
    authDatabase().prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }

  const row = authDatabase()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(session.user_id) as UserRow | undefined;
  return row ? toAccount(row) : null;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  authDatabase().prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function listAccounts(): Account[] {
  // node:sqlite returns loose row records; the schema above defines the shape.
  const rows = authDatabase()
    .prepare('SELECT * FROM users ORDER BY created_at ASC')
    .all() as unknown as UserRow[];
  return rows.map(toAccount);
}

/** Blocking also drops the sessions, so access ends immediately rather than at expiry. */
export function setAccountStatus(id: string, status: UserStatus): Account | null {
  authDatabase().prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  if (status !== 'approved') {
    authDatabase().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  const row = authDatabase().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toAccount(row) : null;
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Set only over TLS in production; localhost has none.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}
