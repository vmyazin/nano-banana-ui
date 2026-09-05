import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { adapter } from './database';
import { LOCAL_SCHEMA } from '../src/schema';
import { acceptJob, dismissAttentionJob } from '../src/jobs';
import type { Env } from '../src/security';
import type { CloudJobRequest } from '../../lib/account/contracts';

const request: CloudJobRequest = { provider: 'local-test', modelId: 'local-test', mediaType: 'image', inputMode: 'text', prompt: 'overflow intake', values: {}, referenceIds: [] };
let db: DatabaseSync, env: Env;
beforeEach(() => {
  db = new DatabaseSync(':memory:'); db.exec(LOCAL_SCHEMA);
  db.exec("INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES ('owner','google-owner','owner@example.test','Owner',1),('other','google-other','other@example.test','Other',1)");
  env = { DB: adapter(db), APP_ORIGIN: 'http://localhost:3097' };
});
afterEach(() => db.close());

function retain(jobId: string, owner: string, id = `${jobId}-output`) {
  db.prepare('INSERT INTO account_assets (id,user_id,job_id,object_key,kind,mime_type,bytes,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, owner, jobId, `accounts/${owner}/jobs/${id}`, 'image', 'image/png', 68, '{}', Date.now());
  db.prepare('INSERT INTO account_asset_retention (asset_id,expires_at) VALUES (?,?)').run(id, Date.now() + 86_400_000);
  return id;
}

it('blocks new jobs while temporary results remain, even after tracking stops, but preserves replay', async () => {
  const job = await acceptJob(env, 'owner', 'overflow-first-token-1234', request);
  const asset = retain(job.id, 'owner');
  db.prepare("UPDATE account_jobs SET state='needs_attention' WHERE id=?").run(job.id);
  await dismissAttentionJob(env, job.id, 'owner');
  await expect(acceptJob(env, 'owner', 'overflow-next-token-1234', request)).rejects.toMatchObject({ code: 'temporary_results', status: 409 });
  expect(db.prepare('SELECT active_jobs,reserved_bytes FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({ active_jobs: 0, reserved_bytes: 0 });
  expect((await acceptJob(env, 'owner', 'overflow-first-token-1234', request)).id).toBe(job.id);
  // Promotion or completed deletion removes the temporary classification.
  db.prepare('DELETE FROM account_asset_retention WHERE asset_id=?').run(asset);
  expect((await acceptJob(env, 'owner', 'overflow-next-token-1234', request)).state).toBe('queued');
});

it('counts retained terminal outputs globally until cleanup, without counting several outputs twice', async () => {
  const job = await acceptJob(env, 'owner', 'global-overflow-token-1234', request);
  const first = retain(job.id, 'owner'); retain(job.id, 'owner', `${job.id}-second`);
  db.prepare("UPDATE account_jobs SET state='needs_attention' WHERE id=?").run(job.id);
  await dismissAttentionJob(env, job.id, 'owner');
  db.prepare("UPDATE account_storage SET active_jobs=99 WHERE user_id='owner'").run();
  db.prepare('UPDATE account_assets SET deleted=1 WHERE id=?').run(first);
  await expect(acceptJob(env, 'other', 'global-other-token-1234', request)).rejects.toMatchObject({ code: 'service_capacity', status: 503 });
  db.prepare("UPDATE account_storage SET active_jobs=98 WHERE user_id='owner'").run();
  expect((await acceptJob(env, 'other', 'global-other-token-1234', request)).state).toBe('queued');
});
