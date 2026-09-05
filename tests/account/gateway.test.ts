// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountGateway } from '@/lib/account/gateway';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('account gateway', () => {
  it('fails gracefully with no backend and does not require guest authentication', async () => {
    vi.stubEnv('ACCOUNT_WORKER_ORIGIN', '');
    const response=await accountGateway(new Request('https://app.test/api/account/session'));
    expect(response.status).toBe(200);expect((await response.json()).account).toBeNull();
  });
  it('forwards only safe headers and preserves multiple cookies and redirects', async () => {
    vi.stubEnv('ACCOUNT_WORKER_ORIGIN', 'https://accounts.test');
    const headers = new Headers({ location: 'https://app.test/sign-in' });
    headers.append('set-cookie', '__Host-sa_session=abc; Secure; HttpOnly; Path=/');
    headers.append('set-cookie', '__Host-sa_oauth=; Max-Age=0; Secure; Path=/');
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 303, headers }));
    vi.stubGlobal('fetch', fetcher);
    const response = await accountGateway(new Request('https://app.test/api/account/callback/google?code=x', { headers: { cookie: 'session=x', 'x-user-id': 'forged', authorization: 'Bearer forged', origin: 'https://app.test' } }));
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://accounts.test/api/account/callback/google?code=x');
    expect(options.headers.get('x-user-id')).toBeNull();
    expect(options.headers.get('authorization')).toBeNull();
    expect(options.headers.get('cookie')).toBe('session=x');
    expect(options.redirect).toBe('manual');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects unlisted routes and actual oversized bodies', async () => {
    vi.stubEnv('ACCOUNT_WORKER_ORIGIN', 'https://accounts.test');
    expect((await accountGateway(new Request('https://app.test/api/account/admin'))).status).toBe(404);
    expect((await accountGateway(new Request('https://app.test/api/account/sign-in/google', { method: 'POST', body: 'x'.repeat(2049) }))).status).toBe(413);
  });
  it('rejects plaintext upstreams in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCOUNT_WORKER_ORIGIN', 'http://localhost:8797');
    expect((await accountGateway(new Request('https://app.test/api/account/session'))).status).toBe(503);
  });
});
