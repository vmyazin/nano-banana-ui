import * as oauth from 'oauth4webapi';
import type { Env } from './security';
import { googleProfilePicture } from '../../lib/account/profile-picture';

const GOOGLE: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};
export interface Identity { subject: string; email: string; name: string; picture?: string | null }
export function googleEnabled(env: Env) { return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); }
export async function googleAuthorization(env: Env, state: string, verifier: string, nonce: string) {
  const url = new URL(GOOGLE.authorization_endpoint!);
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: `${env.APP_ORIGIN}/api/account/callback/google`, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return url.href;
}
export async function googleIdentity(env: Env, url: URL, state: string, verifier: string, nonce: string): Promise<Identity> {
  const client: oauth.Client = { client_id: env.GOOGLE_CLIENT_ID!, id_token_signed_response_alg: 'RS256' };
  const params = oauth.validateAuthResponse(GOOGLE, client, url, state);
  const response = await oauth.authorizationCodeGrantRequest(GOOGLE, client, oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET!), params, `${env.APP_ORIGIN}/api/account/callback/google`, verifier, { signal: AbortSignal.timeout(15_000) });
  const result = await oauth.processAuthorizationCodeResponse(GOOGLE, client, response, { expectedNonce: nonce, requireIdToken: true });
  await oauth.validateApplicationLevelSignature(GOOGLE, response, { signal: AbortSignal.timeout(15_000) });
  const claims = oauth.getValidatedIdTokenClaims(result)!;
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw new Error('Unverified identity');
  return { subject: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : claims.email, picture: googleProfilePicture(claims.picture) };
}
