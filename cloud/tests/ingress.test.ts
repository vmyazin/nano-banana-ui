import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyIngress, cleanupExpiredIngress } from '../src/ingress';
import { handleRequest } from '../src/index';
import { LOCAL_SCHEMA } from '../src/schema';
import { cookieName, hash, type Env } from '../src/security';
import { adapter } from './database';

const ingressMigration = readFileSync(new URL('../migrations/0009_ingress.sql', import.meta.url), 'utf8');
const origin = 'http://localhost:3097';
let db: DatabaseSync;
let env: Env;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(LOCAL_SCHEMA);
  // Keep this explicit until the generated local schema includes migration 0009.
  db.exec(ingressMigration);
  env = { DB: adapter(db), APP_ORIGIN: origin };
});
afterEach(() => db.close());

async function signedIn(owner: string) {
  const token = `${owner.padEnd(32, 'x')}-session-token`;
  db.prepare('INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES (?,?,?,?,?)')
    .run(owner, `google-${owner}`, `${owner}@example.test`, owner, 1);
  db.prepare('INSERT INTO account_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(await hash(token), owner, Date.now() + 60_000);
  return `${cookieName(env, 'session')}=${token}`;
}

function accountRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(init.method ?? 'GET') && !headers.has('origin')) headers.set('origin', origin);
  return new Request(`http://worker.test/api/account/${path}`, { ...init, headers });
}

describe('account ingress body bounds', () => {
  it('rejects an oversized streaming POST without Content-Length and stops its reader', async () => {
    let pulls = 0, cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1_100));
      },
      cancel() { cancelled = true; },
    });
    const request = accountRequest('unknown', { method: 'POST', body, duplex: 'half' } as RequestInit);
    const result = await applyIngress(request, env);
    expect(result.response?.status).toBe(413);
    expect(await result.response?.json()).toEqual({ error: 'Request is too large.' });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(2);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_ingress_limits').get()?.count).toBe(0);
  });

  it('rejects an oversized declared body before pulling it', async () => {
    let pulls = 0, cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; },
    });
    const request = accountRequest('connections', {
      method: 'POST', body, duplex: 'half', headers: { 'content-length': '8193' },
    } as RequestInit);
    expect((await applyIngress(request, env)).response?.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBe(0);
  });

  it('forwards a legitimate body exactly once with request metadata intact', async () => {
    let pulls = 0;
    const abort = new AbortController();
    const bytes = new TextEncoder().encode('{"provider":"google"}');
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(bytes); controller.close(); },
    });
    const original = accountRequest('connections', {
      method: 'POST', body, duplex: 'half', signal: abort.signal,
      headers: { 'content-type': 'application/json', 'x-test-header': 'preserved' },
    } as RequestInit);
    const result = await applyIngress(original, env);
    expect(result.response).toBeUndefined();
    expect(original.bodyUsed).toBe(true);
    expect(result.request.method).toBe('POST');
    expect(result.request.headers.get('x-test-header')).toBe('preserved');
    abort.abort();
    expect(original.signal.aborted).toBe(true);
    expect(result.request.signal.aborted).toBe(true);
    expect(await result.request.text()).toBe('{"provider":"google"}');
    expect(pulls).toBe(1);
  });

  it.each(['/media/upload-token', '/import-media/upload-token'])(
    'leaves the scoped streaming path %s untouched', async path => {
      const body = new ReadableStream<Uint8Array>();
      const request = new Request(`http://worker.test${path}`, { method: 'PUT', body, duplex: 'half' } as RequestInit);
      const result = await applyIngress(request, env);
      expect(result.request).toBe(request);
      expect(result.response).toBeUndefined();
      expect(request.bodyUsed).toBe(false);
    },
  );
});

describe('account ingress rate budgets', () => {
  it('atomically refuses the first request past a boundary', async () => {
    const cookie = await signedIn('owner-a');
    const requests = Array.from({ length: 3 }, () => applyIngress(accountRequest('session', { headers: { cookie } }), env, { limits: { ownerReads: 2 }, now: 1_000 }));
    const results = await Promise.all(requests);
    expect(results.filter(result => !result.response)).toHaveLength(2);
    expect(results.filter(result => result.response?.status === 429)).toHaveLength(1);
    expect(db.prepare('SELECT count FROM account_ingress_limits').get()?.count).toBe(2);
  });

  it('isolates authenticated owner buckets', async () => {
    const ownerA = await signedIn('owner-a');
    const ownerB = await signedIn('owner-b');
    const options = { limits: { ownerReads: 1 }, now: 1_000 };
    expect((await applyIngress(accountRequest('session', { headers: { cookie: ownerA } }), env, options)).response).toBeUndefined();
    expect((await applyIngress(accountRequest('session', { headers: { cookie: ownerA } }), env, options)).response?.status).toBe(429);
    expect((await applyIngress(accountRequest('session', { headers: { cookie: ownerB } }), env, options)).response).toBeUndefined();
    const buckets = db.prepare('SELECT bucket FROM account_ingress_limits').all();
    expect(buckets).toHaveLength(2);
    expect(JSON.stringify(buckets)).not.toContain('owner-a');
    expect(JSON.stringify(buckets)).not.toContain('owner-b');
  });

  it('uses one global budget for signed-out metadata', async () => {
    const options = { limits: { anonymous: 2 }, now: 1_000 };
    expect((await applyIngress(accountRequest('session', { headers: { 'x-account-id': 'spoofed-a' } }), env, options)).response).toBeUndefined();
    expect((await applyIngress(accountRequest('jobs', { headers: { 'x-account-id': 'spoofed-b', 'x-forwarded-for': '198.51.100.2' } }), env, options)).response).toBeUndefined();
    expect((await applyIngress(accountRequest('connections'), env, options)).response?.status).toBe(429);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_ingress_limits').get()?.count).toBe(1);
  });

  it('enforces the lower new-job budget and returns a numeric Retry-After', async () => {
    const cookie = await signedIn('owner-a');
    const options = { limits: { jobSubmissions: 1 }, now: 1_234 };
    const init = { method: 'POST', headers: { cookie }, body: '{}' };
    expect((await applyIngress(accountRequest('jobs', init), env, options)).response).toBeUndefined();
    const refused = (await applyIngress(accountRequest('jobs', init), env, options)).response;
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await refused?.json()).toEqual({ error: 'Too many requests. Try again shortly.' });
  });

  it('bounds OAuth starts globally and removes expired counters', async () => {
    const options = { limits: { oauthStarts: 1 }, now: 1_000 };
    expect((await applyIngress(accountRequest('sign-in/google', { method: 'POST', body: '{}' }), env, options)).response).toBeUndefined();
    expect((await applyIngress(accountRequest('sign-in/google', { method: 'POST', body: '{}' }), env, options)).response?.status).toBe(429);
    await cleanupExpiredIngress(env, 121_000);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_ingress_limits').get()?.count).toBe(0);
  });

  it('rejects CSRF before spending a counter and preserves stale-owner rejection', async () => {
    const cookie = await signedIn('owner-a');
    const csrf = await applyIngress(accountRequest('jobs', {
      method: 'POST', body: '{}', headers: { cookie, origin: 'https://evil.test' },
    }), env, { limits: { jobSubmissions: 1 }, now: 1_000 });
    expect(csrf.response?.status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_ingress_limits').get()?.count).toBe(0);

    const stale = await handleRequest(new Request('http://worker.test/api/account/jobs', {
      headers: { cookie, 'x-account-id': 'owner-b' },
    }), env);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'Your account changed. Refresh before continuing.' });
  });
});
