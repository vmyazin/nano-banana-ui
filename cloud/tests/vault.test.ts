import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { adapter } from './database';
import { handleRequest } from '../src/index';
import { encryptSecret, decryptSecret, resolveConnection, type Connection } from '../src/vault';
import type { Env } from '../src/security';
let db: DatabaseSync, env: Env, cookie: string;
async function call(path: string, method = 'GET', body?: unknown, cookies = cookie) {
  return handleRequest(new Request(`http://localhost:8797/api/account/${path}`, { method, headers: { origin: env.APP_ORIGIN, cookie: cookies }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
}
beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  env = { DB: adapter(db), APP_ORIGIN: 'http://localhost:3097', DEV_ACCOUNT_EMAIL: 'creator@example.test', ACCOUNT_ENCRYPTION_KEYS: JSON.stringify({ '1': Buffer.alloc(32, 1).toString('base64'), '2': Buffer.alloc(32, 2).toString('base64') }), ACCOUNT_ENCRYPTION_VERSION: '1' };
  const login = await call('local-sign-in', 'POST', {}, '');
  cookie = login.headers.getSetCookie()[0].split(';')[0];
});
afterEach(() => db.close());
describe('encrypted account connections', () => {
  it('stores ciphertext and only returns masked metadata', async () => {
    const response = await call('connections', 'POST', { provider: 'fal', apiKey: 'not-a-real-secret-key' });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('not-a-real-secret-key');
    expect(text).not.toContain('ciphertext');
    const row = db.prepare('SELECT * FROM account_connections').get() as unknown as Connection;
    expect(row.ciphertext).not.toContain('not-a-real-secret-key');
    expect((await resolveConnection(env, row.user_id, row.id)).secret.apiKey).toBe('not-a-real-secret-key');
    await expect(resolveConnection(env, 'other-owner', row.id)).rejects.toThrow();
  });
  it('uses fresh nonces and rejects owner, provider and ciphertext tampering', async () => {
    const a = await encryptSecret(env, 'owner', 'fal', { apiKey: 'secret' });
    const b = await encryptSecret(env, 'owner', 'fal', { apiKey: 'secret' });
    expect(a.nonce).not.toBe(b.nonce);
    await expect(decryptSecret(env, 'other', 'fal', a)).rejects.toThrow();
    await expect(decryptSecret(env, 'owner', 'kie', a)).rejects.toThrow();
    await expect(decryptSecret(env, 'owner', 'fal', { ...a, ciphertext: a.ciphertext.slice(4) })).rejects.toThrow();
  });
  it('supports versioned encryption keys and detects replacement during jobs', async () => {
    await call('connections', 'POST', { provider: 'fal', apiKey: 'first-secret' });
    const row = db.prepare('SELECT * FROM account_connections').get() as unknown as Connection;
    env.ACCOUNT_ENCRYPTION_VERSION = '2';
    await call('connections', 'POST', { provider: 'fal', apiKey: 'second-secret' });
    await expect(resolveConnection(env, row.user_id, row.id, row.revision)).rejects.toThrow();
    expect((await resolveConnection(env, row.user_id, row.id)).secret.apiKey).toBe('second-secret');
    expect((await decryptSecret(env, row.user_id, 'fal', row)).apiKey).toBe('first-secret');
  });
  it('requires a session, isolates listings and scopes deletion', async () => {
    expect((await call('connections', 'GET', undefined, '')).status).toBe(401);
    await call('connections', 'POST', { provider: 'fal', apiKey: 'first-secret' });
    env.DEV_ACCOUNT_EMAIL = 'other@example.test';
    const login = await call('local-sign-in', 'POST', {}, '');
    const other = login.headers.getSetCookie()[0].split(';')[0];
    expect((await (await call('connections', 'GET', undefined, other)).json()).connections).toHaveLength(0);
    await call('connections/fal', 'DELETE', undefined, other);
    expect((await (await call('connections')).json()).connections).toHaveLength(1);
    await call('connections/fal', 'DELETE');
    expect((await (await call('connections')).json()).connections).toHaveLength(0);
  });
});
