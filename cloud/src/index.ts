import { LOCAL_SCHEMA } from './schema';
import { cookie, cookieName, hash, isLocal, json, randomToken, readCookie, returnPath, validOrigin, type Env } from './security';
import { googleAuthorization, googleEnabled, googleIdentity } from './google';
import { createSession, currentAccount, revokeSession } from './sessions';

interface OAuthAttempt { verifier: string; nonce: string; return_to: string }
const bootstrapped = new WeakSet<object>();
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    if (!validOrigin(env)) return json({ error: 'Account service is not configured.' }, 503);
    if (isLocal(env) && !bootstrapped.has(env.DB)) {
      // D1 exec expects individual statements; bootstrap is development-only.
      await env.DB.batch(LOCAL_SCHEMA.split(';').filter(s => s.trim()).map(s => env.DB.prepare(s)));
      bootstrapped.add(env.DB);
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'POST' && request.headers.get('origin') !== env.APP_ORIGIN) return json({ error: 'Request origin is not allowed.' }, 403);
    if (path === '/health' && request.method === 'GET') return json({ ok: true });
    if (path === '/api/account/session' && request.method === 'GET') return json({ account: await currentAccount(request, env), googleEnabled: googleEnabled(env), localSignIn: isLocal(env) && Boolean(env.DEV_ACCOUNT_EMAIL) });
    if (path === '/api/account/sign-out' && request.method === 'POST') {
      await revokeSession(request, env);
      return json({ ok: true }, 200, [cookie(env, 'session', '', 0), cookie(env, 'oauth', '', 0)]);
    }
    if (path === '/api/account/local-sign-in' && request.method === 'POST') {
      if (!isLocal(env) || !env.DEV_ACCOUNT_EMAIL) return json({ error: 'Not found.' }, 404);
      await revokeSession(request, env);
      const session = await createSession(env, { subject: `local:${env.DEV_ACCOUNT_EMAIL}`, email: env.DEV_ACCOUNT_EMAIL, name: 'Local creator' });
      return json({ ok: true }, 200, [session]);
    }
    if (path === '/api/account/sign-in/google' && request.method === 'POST') {
      if (!googleEnabled(env)) return json({ error: 'Google sign-in is not configured yet. You can continue as a guest.' }, 503);
      const text = await request.text();
      if (text.length > 2048) return json({ error: 'Request is too large.' }, 413);
      let body: { returnTo?: unknown };
      try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'Invalid request.' }, 400); }
      const state = randomToken(), binding = randomToken(), verifier = randomToken(), nonce = randomToken();
      await env.DB.prepare('INSERT INTO account_oauth (state_hash, binding_hash, verifier, nonce, return_to, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(await hash(state), await hash(binding), verifier, nonce, returnPath(body?.returnTo), Date.now() + 600_000).run();
      return json({ url: await googleAuthorization(env, state, verifier, nonce) }, 200, [cookie(env, 'oauth', binding, 600)]);
    }
    if (path === '/api/account/callback/google' && request.method === 'GET') {
      const failure = () => redirect(`${env.APP_ORIGIN}/sign-in?account=signin-failed`, [cookie(env, 'oauth', '', 0)]);
      if (!googleEnabled(env)) return failure();
      const state = url.searchParams.get('state');
      const binding = readCookie(request, cookieName(env, 'oauth'));
      if (!state || state.length > 128 || !binding) return failure();
      // Consume atomically before the external exchange; a callback cannot be replayed.
      const attempt = await env.DB.prepare('DELETE FROM account_oauth WHERE state_hash = ? AND binding_hash = ? AND expires_at > ? RETURNING verifier, nonce, return_to')
        .bind(await hash(state), await hash(binding), Date.now()).first<OAuthAttempt>();
      if (!attempt) return failure();
      try {
        const identity = await googleIdentity(env, url, state, attempt.verifier, attempt.nonce);
        await revokeSession(request, env);
        const session = await createSession(env, identity);
        return redirect(`${env.APP_ORIGIN}${returnPath(attempt.return_to)}`, [session, cookie(env, 'oauth', '', 0)]);
      } catch { return failure(); }
    }
    return json({ error: 'Not found.' }, 404);
  } catch {
    // Never serialize OAuth errors: vendor payloads may contain credentials.
    return json({ error: 'Account service is temporarily unavailable. Guest generation is still available.' }, 503);
  }
}
function redirect(location: string, cookies: string[]) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(null, { status: 303, headers });
}
const worker = {
  fetch: handleRequest,
  async scheduled(_event: ScheduledController, env: Env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM account_oauth WHERE expires_at <= ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(Date.now()),
    ]);
  },
};

export default worker;
