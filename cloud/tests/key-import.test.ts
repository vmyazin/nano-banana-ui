import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { resolveConnection, type Connection } from '../src/vault';
import type { Env } from '../src/security';
import { adapter } from './database';

let db: DatabaseSync;
let env: Env;
let cookie: string;
let ownerId: string;

async function call(body: unknown, expectedOwner = ownerId) {
  return handleRequest(new Request('http://localhost:8797/api/account/connections', {
    method: 'POST',
    headers: { origin: env.APP_ORIGIN, cookie, 'X-Account-Id': expectedOwner },
    body: JSON.stringify(body),
  }), env);
}

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  env = {
    DB: adapter(db),
    APP_ORIGIN: 'http://localhost:3097',
    DEV_ACCOUNT_EMAIL: 'importer@example.test',
    ACCOUNT_ENCRYPTION_KEYS: JSON.stringify({ '1': Buffer.alloc(32, 7).toString('base64') }),
    ACCOUNT_ENCRYPTION_VERSION: '1',
  };
  const login = await handleRequest(new Request('http://localhost:8797/api/account/local-sign-in', { method: 'POST', headers: { origin: env.APP_ORIGIN }, body: '{}' }), env);
  cookie = login.headers.getSetCookie()[0].split(';')[0];
  const session = await handleRequest(new Request('http://localhost:8797/api/account/session', { headers: { cookie } }), env);
  ownerId = ((await session.json()) as { account: { id: string } }).account.id;
});

afterEach(() => db.close());

describe('browser key import', () => {
  it('skips an existing connection without replacing it or incrementing its revision', async () => {
    await call({ provider: 'fal', apiKey: 'first-dummy-key' });
    const before = db.prepare('SELECT * FROM account_connections').get() as unknown as Connection;
    const response = await call({ provider: 'fal', apiKey: 'second-dummy-key', ifAbsent: true });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('second-dummy-key');
    expect(text).not.toContain('ciphertext');
    expect(JSON.parse(text).import).toEqual({ provider: 'fal', status: 'skipped' });
    const after = db.prepare('SELECT * FROM account_connections').get() as unknown as Connection;
    expect(after.revision).toBe(before.revision);
    expect(after.ciphertext).toBe(before.ciphertext);
    expect((await resolveConnection(env, ownerId, after.id)).secret.apiKey).toBe('first-dummy-key');
  });

  it('atomically lets only one simultaneous import win for a provider', async () => {
    const responses = await Promise.all([
      call({ provider: 'kie', apiKey: 'first-race-dummy-key', ifAbsent: true }),
      call({ provider: 'kie', apiKey: 'second-race-dummy-key', ifAbsent: true }),
    ]);
    const statuses = await Promise.all(responses.map(async response => ((await response.json()) as { import: { status: string } }).import.status));
    expect(statuses.sort()).toEqual(['inserted', 'skipped']);
    const rows = db.prepare("SELECT * FROM account_connections WHERE provider = 'kie'").all() as unknown as Connection[];
    expect(rows).toHaveLength(1);
    expect(['first-race-dummy-key', 'second-race-dummy-key']).toContain((await resolveConnection(env, ownerId, rows[0].id)).secret.apiKey);
  });

  it('keeps normal replacement behavior and never returns plaintext key material', async () => {
    await call({ provider: 'runware', apiKey: 'old-normal-dummy-key' });
    const response = await call({ provider: 'runware', apiKey: 'new-normal-dummy-key' });
    const text = await response.text();
    expect(text).not.toContain('new-normal-dummy-key');
    expect(text).not.toContain('ciphertext');
    expect(text).not.toContain('nonce');
    const row = db.prepare("SELECT * FROM account_connections WHERE provider = 'runware'").get() as unknown as Connection;
    expect(row.revision).toBe(2);
    expect((await resolveConnection(env, ownerId, row.id)).secret.apiKey).toBe('new-normal-dummy-key');
  });

  it('rejects an import when the initiating owner no longer matches', async () => {
    const response = await call({ provider: 'gemini', apiKey: 'owner-guard-dummy-key', ifAbsent: true }, 'another-owner');
    expect(response.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_connections').get()).toEqual({ count: 0 });
  });
});
