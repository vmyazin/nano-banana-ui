import { cookie, cookieName, hash, randomToken, readCookie, type Env } from './security';
import type { Identity } from './google';
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
export async function createSession(env: Env, identity: Identity) {
  const now = Date.now();
  const token = randomToken();
  const userId = crypto.randomUUID();
  // Unique Google subject is authoritative. Never merge accounts by email.
  await env.DB.prepare('INSERT INTO account_users (id, google_subject, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(google_subject) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture')
    .bind(userId, identity.subject, identity.email, identity.name, identity.picture ?? null, now).run();
  await env.DB.prepare('INSERT INTO account_sessions (token_hash, user_id, expires_at) SELECT ?, id, ? FROM account_users WHERE google_subject = ?')
    .bind(await hash(token), now + SESSION_SECONDS * 1000, identity.subject).run();
  return cookie(env, 'session', token, SESSION_SECONDS);
}
export async function currentAccount(request: Request, env: Env) {
  const token = readCookie(request, cookieName(env, 'session'));
  if (!token) return null;
  return env.DB.prepare('SELECT u.id, u.email, u.name, u.picture FROM account_users u JOIN account_sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await hash(token), Date.now()).first<{ id: string; email: string; name: string; picture: string | null }>();
}
export async function revokeSession(request: Request, env: Env) {
  const token = readCookie(request, cookieName(env, 'session'));
  if (token) await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await hash(token)).run();
}
