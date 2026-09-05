import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { googleIdentity } from '../src/google';
import type { Env } from '../src/security';

let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const env = { APP_ORIGIN: 'https://app.example.test', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' } as Env;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
});
afterEach(() => vi.unstubAllGlobals());
async function mockGoogle(overrides = {}, corrupt = false) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'https://accounts.google.com', aud: 'client', sub: 'google-subject', exp: now + 600, iat: now, nonce: 'nonce', email: 'creator@example.test', email_verified: true, name: 'Creator', ...overrides };
  const unsigned = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(unsigned));
  const token = `${unsigned}.${corrupt ? 'invalid' : Buffer.from(signature).toString('base64url')}`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'access', token_type: 'Bearer', id_token: token });
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [{ ...jwk, kid: 'test-key', use: 'sig', alg: 'RS256' }] });
    throw new Error(`Unexpected endpoint: ${url}`);
  }));
}
const exchange = () => googleIdentity(env, new URL('https://app.example.test/api/account/callback/google?code=code&state=state'), 'state', 'verifier', 'nonce');
describe('Google OIDC verification', () => {
  it('accepts a signed matching identity', async () => { await mockGoogle(); expect(await exchange()).toEqual({ subject: 'google-subject', email: 'creator@example.test', name: 'Creator', picture: null }); });
  it.each([{ aud: 'another-client' }, { iss: 'https://evil.test' }, { nonce: 'wrong' }, { exp: 1 }, { email_verified: false }])('rejects invalid claims %j', async claims => { await mockGoogle(claims); await expect(exchange()).rejects.toThrow(); });
  it('retains the profile photo from a verified Google token', async () => {
    const picture = 'https://lh3.googleusercontent.com/a/profile=s96-c';
    await mockGoogle({ picture });
    expect((await exchange()).picture).toBe(picture);
  });
  it.each(['http://lh3.googleusercontent.com/a', 'https://googleusercontent.com.evil.test/a', 'https://evil.test/a', 'javascript:alert(1)', 'https://user@lh3.googleusercontent.com/a', 42, 'https://lh3.googleusercontent.com/' + 'x'.repeat(2048)])('ignores unsupported profile photo %s', async picture => {
    await mockGoogle({ picture });
    expect((await exchange()).picture).toBeNull();
  });
  it('rejects an invalid signature' , async () => { await mockGoogle({}, true); await expect(exchange()).rejects.toThrow(); });
});
