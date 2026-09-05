import { currentAccount } from './sessions';
import { json, type Env } from './security';
import { listConnections, PROVIDERS, saveConnection, type Provider } from './vault';

export async function connectionRoutes(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/account/connections' && !path.startsWith('/api/account/connections/')) return null;
  const account = await currentAccount(request, env);
  if (!account) return json({ error: 'Sign in to manage account connections.' }, 401);
  if (request.method === 'GET' && path === '/api/account/connections') return json({ connections: await listConnections(env, account.id) });
  if (request.method === 'POST' && path === '/api/account/connections') {
    const text = await request.text();
    if (text.length > 8192) return json({ error: 'Connection is too large.' }, 413);
    let body: { provider?: unknown; apiKey?: unknown; accountId?: unknown };
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid connection.' }, 400); }
    if (!body || !PROVIDERS.includes(body.provider as Provider) || typeof body.apiKey !== 'string' || body.apiKey.trim().length < 8 || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) return json({ error: 'Choose a provider and enter its API key.' }, 400);
    if (body.provider === 'cloudflare' && (typeof body.accountId !== 'string' || !/^[a-f0-9]{32}$/i.test(body.accountId))) return json({ error: 'Enter the Cloudflare account ID.' }, 400);
    await saveConnection(env, account.id, body.provider as Provider, { apiKey: body.apiKey.trim(), ...(body.provider === 'cloudflare' ? { accountId: body.accountId as string } : {}) });
    return json({ connections: await listConnections(env, account.id) });
  }
  if (request.method === 'DELETE') {
    const provider = path.slice('/api/account/connections/'.length);
    if (!PROVIDERS.includes(provider as Provider)) return json({ error: 'Unknown provider.' }, 404);
    await env.DB.prepare('DELETE FROM account_connections WHERE user_id = ? AND provider = ?').bind(account.id, provider).run();
    return json({ connections: await listConnections(env, account.id) });
  }
  return json({ error: 'Method not allowed.' }, 405);
}
