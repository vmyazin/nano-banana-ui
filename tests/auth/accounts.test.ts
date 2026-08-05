// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  accountForSession,
  authenticate,
  createAccount,
  createSession,
  destroySession,
  listAccounts,
  setAccountStatus,
} from '../../lib/auth/accounts';
import { useAuthDatabase } from '../../lib/auth/db';
import { hashPassword, passwordProblem, verifyPassword } from '../../lib/auth/passwords';

const PASSWORD = 'correct horse battery';

describe('password hashing', () => {
  it('round-trips without storing the password', async () => {
    const stored = await hashPassword(PASSWORD);

    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword('wrong password here', stored)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('returns false rather than throwing on a malformed stored value', async () => {
    for (const stored of ['', 'nonsense', 'bcrypt$aa$bb', 'scrypt$zz']) {
      expect(await verifyPassword(PASSWORD, stored)).toBe(false);
    }
  });

  it('asks for length, which is the requirement that helps', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/);
    expect(passwordProblem(PASSWORD)).toBeNull();
    expect(passwordProblem('x'.repeat(600))).toMatch(/too long/);
  });
});

describe('accounts and sessions', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    useAuthDatabase(database);
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';
  });

  afterEach(() => {
    useAuthDatabase(null);
    database.close();
    delete process.env.AUTH_ADMIN_EMAIL;
  });

  it('leaves a new account waiting for approval', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);

    expect(created).toMatchObject({ account: { email: 'friend@example.com', status: 'pending' } });
    expect('account' in created && created.account.isAdmin).toBe(false);
  });

  it('approves the configured owner immediately, so someone can let others in', async () => {
    const created = await createAccount('Owner@Example.com', PASSWORD);

    expect(created).toMatchObject({ account: { status: 'approved', isAdmin: true } });
  });

  it('normalizes the address, so case and spacing cannot make a second account', async () => {
    await createAccount('Friend@Example.com ', PASSWORD);
    const duplicate = await createAccount('friend@example.com', PASSWORD);

    expect(duplicate).toEqual({ error: 'duplicate' });
    expect(listAccounts()).toHaveLength(1);
  });

  it('authenticates the right password and rejects the wrong one', async () => {
    await createAccount('friend@example.com', PASSWORD);

    expect(await authenticate('friend@example.com', PASSWORD)).toMatchObject({
      email: 'friend@example.com',
    });
    expect(await authenticate('friend@example.com', 'not the password')).toBeNull();
    expect(await authenticate('stranger@example.com', PASSWORD)).toBeNull();
  });

  it('resolves a session cookie back to its account', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';

    const { token } = createSession(id);

    expect(accountForSession(token)).toMatchObject({ email: 'friend@example.com' });
    expect(accountForSession('some other token')).toBeNull();
    expect(accountForSession(undefined)).toBeNull();
  });

  it('stores only a hash, so the database cannot mint a usable cookie', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const { token } = createSession(id);

    const stored = database.prepare('SELECT id FROM sessions').all() as { id: string }[];

    expect(stored).toHaveLength(1);
    expect(stored[0].id).not.toBe(token);
    // A leaked row is not a credential: presenting it does not authenticate.
    expect(accountForSession(stored[0].id)).toBeNull();
  });

  it('refuses an expired session and clears the row', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const { token } = createSession(id);
    database.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);

    expect(accountForSession(token)).toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toMatchObject({ n: 0 });
  });

  it('ends access immediately when an account is blocked', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const { token } = createSession(id);
    expect(accountForSession(token)).not.toBeNull();

    setAccountStatus(id, 'blocked');

    // Not merely marked: the live session is gone, rather than valid until expiry.
    expect(accountForSession(token)).toBeNull();
  });

  it('keeps sessions when an account is approved', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const { token } = createSession(id);

    setAccountStatus(id, 'approved');

    expect(accountForSession(token)).toMatchObject({ status: 'approved' });
  });

  it('signs out only the session presented', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const first = createSession(id);
    const second = createSession(id);

    destroySession(first.token);

    expect(accountForSession(first.token)).toBeNull();
    expect(accountForSession(second.token)).not.toBeNull();
  });

  it('drops sessions when the account row goes', async () => {
    const created = await createAccount('friend@example.com', PASSWORD);
    const id = 'account' in created ? created.account.id : '';
    const { token } = createSession(id);

    database.prepare('DELETE FROM users WHERE id = ?').run(id);

    expect(accountForSession(token)).toBeNull();
  });
});
