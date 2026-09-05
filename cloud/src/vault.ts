import type { Env } from './security';

export const PROVIDERS = ['gemini', 'fal', 'kie', 'runware', 'atlas', 'comet', 'cloudflare', 'pollinations'] as const;
export type Provider = typeof PROVIDERS[number];
export interface Secret { apiKey: string; accountId?: string }
interface Envelope { ciphertext: string; nonce: string; key_version: string }
export interface Connection extends Envelope { id: string; user_id: string; provider: Provider; revision: number }
function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
async function key(env: Env, version: string) {
  const keys: Record<string, string> = JSON.parse(env.ACCOUNT_ENCRYPTION_KEYS || '{}');
  if (!Object.hasOwn(keys, version)) throw new Error('Encryption key is unavailable');
  const raw = bytes(keys[version]);
  if (raw.length !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
function context(owner: string, provider: Provider, version: string) {
  return new TextEncoder().encode(JSON.stringify(['scene-assembly-connection', owner, provider, version]));
}
export async function encryptSecret(env: Env, owner: string, provider: Provider, secret: Secret): Promise<Envelope> {
  const version = env.ACCOUNT_ENCRYPTION_VERSION || '1';
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: context(owner, provider, version) }, await key(env, version), new TextEncoder().encode(JSON.stringify(secret)));
  return { ciphertext: base64(new Uint8Array(ciphertext)), nonce: base64(nonce), key_version: version };
}
export async function decryptSecret(env: Env, owner: string, provider: Provider, envelope: Envelope): Promise<Secret> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.nonce), additionalData: context(owner, provider, envelope.key_version) }, await key(env, envelope.key_version), bytes(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export async function listConnections(env: Env, owner: string) {
  const result = await env.DB.prepare('SELECT id, provider, revision, hint, updated_at AS updatedAt FROM account_connections WHERE user_id = ? ORDER BY provider').bind(owner).all();
  return result.results;
}
export async function saveConnection(env: Env, owner: string, provider: Provider, secret: Secret, options: { ifAbsent?: boolean } = {}) {
  const encrypted = await encryptSecret(env, owner, provider, secret);
  const conflict = options.ifAbsent
    ? 'ON CONFLICT(user_id, provider) DO NOTHING'
    : 'ON CONFLICT(user_id, provider) DO UPDATE SET ciphertext = excluded.ciphertext, nonce = excluded.nonce, key_version = excluded.key_version, hint = excluded.hint, updated_at = excluded.updated_at, revision = account_connections.revision + 1';
  const result = await env.DB.prepare(`INSERT INTO account_connections (id, user_id, provider, ciphertext, nonce, key_version, hint, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ${conflict}`)
    .bind(crypto.randomUUID(), owner, provider, encrypted.ciphertext, encrypted.nonce, encrypted.key_version, secret.apiKey.slice(-4), Date.now()).run();
  return (result.meta?.changes ?? 0) > 0;
}
export async function resolveConnection(env: Env, owner: string, connectionId: string, revision?: number) {
  const row = await env.DB.prepare('SELECT * FROM account_connections WHERE id = ? AND user_id = ?').bind(connectionId, owner).first<Connection>();
  if (!row || (revision !== undefined && row.revision !== revision)) throw new Error('Connection was removed or changed');
  return { provider: row.provider, revision: row.revision, secret: await decryptSecret(env, owner, row.provider, row) };
}
