/** Remote storage verification in the dedicated preview only; no vendor requests. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cloud = fileURLToPath(new URL('../cloud/', import.meta.url));
const config = JSON.parse(readFileSync(`${cloud}wrangler.preview.jsonc`, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
assert.equal(config.name, 'scene-assembly-accounts-preview');
assert.equal(config.account_id, '7f64edc36bdefec27b66e6ff9b2dcc3d');
assert.equal(config.d1_databases[0].database_id, 'f3499f84-01b0-49ec-bdf3-9d0378d189f8');
assert.equal(config.r2_buckets[0].bucket_name, 'scene-assembly-assets-preview');
const origin = config.vars.APP_ORIGIN;
const worker = config.vars.PUBLIC_WORKER_ORIGIN;
assert.equal(worker, 'https://scene-assembly-accounts-preview.vasily-or-simon-account.workers.dev');
assert.match(origin, /^https:\/\/scene-assembly-[a-z0-9]+-mzork\.vercel\.app$/);
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const owners = [0, 1].map(() => ({ id: randomUUID(), token: randomBytes(32).toString('base64url') }));
const sqlValue = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(command) {
  // Only hashes of short-lived fixture tokens enter SQL; never print request capabilities.
  try {
    return JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute',
      'scene-assembly-accounts-preview', '--remote', '--config', 'wrangler.preview.jsonc', '--json', '--command', command],
    { cwd: cloud, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.account_id }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { throw new Error('Preview fixture database operation failed.'); }
}
async function api(path, method = 'GET', owner = owners[0], body) {
  return fetch(`${worker}/api/account/${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(30_000),
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(owner ? { Cookie: `__Host-sa_session=${owner.token}`, 'X-Account-Id': owner.id } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function json(response) { assert.ok([200, 201].includes(response.status), `Unexpected JSON status ${response.status}`); return response.json(); }
let phase = 'bootstrap';
try {
  const now = Date.now();
  sql(owners.map(owner => `INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES (${sqlValue(owner.id)},${sqlValue(`preview-fixture:${owner.id}`)},'preview-fixture@example.test','Preview storage fixture',${now}); INSERT INTO account_sessions VALUES (${sqlValue(createHash('sha256').update(owner.token).digest('hex'))},${sqlValue(owner.id)},${now + 600_000});`).join('\n'));
  phase = 'reference upload';
  const upload = await json(await api('uploads', 'POST', owners[0], { bytes: fixture.length, mimeType: 'image/png' }));
  assert.equal(new URL(upload.url).origin, worker);
  assert.equal((await fetch(upload.url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'image/png' }, body: fixture })).status, 200);
  assert.equal((await api(`uploads/${upload.id}`, 'DELETE')).status, 200);
  console.log('Reference upload and cleanup passed.');
  phase = 'private import';
  const intent = { clientImportId: randomUUID(), bytes: fixture.length, mimeType: 'image/png',
    metadata: { provider: 'local-test', modelId: 'preview-fixture', mediaType: 'image', inputMode: 'text', prompt: 'Preview storage fixture', values: {}, referenceIds: [] } };
  const started = await json(await api('imports', 'POST', owners[0], intent));
  assert.equal(new URL(started.url).origin, worker);
  const imported = await json(await fetch(started.url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'image/png' }, body: fixture }));
  assert.equal(imported.state, 'completed');
  const replay = await json(await api('imports', 'POST', owners[0], intent));
  assert.equal(replay.assetId, imported.assetId);
  assert.equal(replay.url, undefined);
  phase = 'private download and isolation';
  const path = `assets/${imported.assetId}`;
  const redirect = await api(`${path}/content`);
  assert.equal(redirect.status, 302);
  const downloadUrl = redirect.headers.get('location');
  assert.equal(new URL(downloadUrl).origin, worker);
  const download = await fetch(downloadUrl);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), fixture);
  assert.equal((await api(`${path}/content`, 'GET', null)).status, 401);
  assert.equal((await api(`${path}/content`, 'GET', owners[1])).status, 404);
  const access = await json(await api(`${path}/access`, 'POST'));
  assert.equal(new URL(access.url).origin, worker);
  const range = await fetch(access.url, { headers: { Range: 'bytes=0-9' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), fixture.subarray(0, 10));
  assert.equal((await api(path, 'DELETE')).status, 200);
  assert.equal((await fetch(access.url)).status, 404);
  console.log('Import replay, byte-exact private download, range request, owner isolation and deletion revocation passed.');
} catch (error) {
  // Keep capability URLs and session headers out of logs even when a transport fails.
  process.exitCode = 1;
  console.error(`Preview verification failed during ${phase}${typeof error.actual === 'number' ? ` (HTTP ${error.actual})` : ''}.`);
} finally {
  for (const owner of owners) {
    try {
      const response = await api('profile', 'DELETE', owner);
      assert.ok([200, 401, 409].includes(response.status));
    } catch { process.exitCode = 1; console.error('Preview fixture cleanup request failed.'); }
  }
  // A tombstone keeps object cleanup durable even if the cleanup request failed.
  sql(owners.map(owner => `INSERT OR IGNORE INTO account_deletions (user_id,created_at,next_check_at) SELECT id,${Date.now()},${Date.now()} FROM account_users WHERE id=${sqlValue(owner.id)}; DELETE FROM account_users WHERE id=${sqlValue(owner.id)};`).join('\n'));
  console.log('Temporary fixture accounts removed; any remaining object cleanup is queued.');
}
