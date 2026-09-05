import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { LOCAL_SCHEMA } from '../src/schema';
import { acceptJob, dispatchJob, finishJob, FREE_BYTES, getJob, IMAGE_RESERVATION } from '../src/jobs';
import type { Env } from '../src/security';
import type { CloudJobRequest } from '../../lib/account/contracts';
let db: DatabaseSync, env: Env;
const request: CloudJobRequest = { provider: 'local-test', modelId: 'local-test', mediaType: 'image', inputMode: 'text', prompt: 'A local test', values: {}, referenceIds: [] };
beforeEach(() => { db = new DatabaseSync(':memory:'); db.exec(LOCAL_SCHEMA); db.exec("INSERT INTO account_users VALUES ('owner','google','test@example.test','Test',1)"); env = { DB: adapter(db), APP_ORIGIN: 'http://localhost:3097' }; });
afterEach(() => db.close());
describe('durable job intake', () => {
  it('accepts one job for concurrent repeated submissions and reserves exactly once', async () => {
    const [a,b] = await Promise.all([acceptJob(env,'owner','same-token-123456',request), acceptJob(env,'owner','same-token-123456',request)]);
    expect(a.id).toBe(b.id);
    expect(db.prepare('SELECT reserved_bytes, active_jobs FROM account_storage').get()).toMatchObject({ reserved_bytes: IMAGE_RESERVATION, active_jobs: 1 });
  });
  it('rejects reuse with changed payload, but canonicalizes control key order', async () => {
    const a = await acceptJob(env,'owner','same-token-123456',{...request, values:{ b:2,a:1 }});
    expect((await acceptJob(env,'owner','same-token-123456',{...request, values:{ a:1,b:2 }})).id).toBe(a.id);
    await expect(acceptJob(env,'owner','same-token-123456',{...request,prompt:'changed'})).rejects.toMatchObject({code:'token_conflict'});
  });
  it('prevents concurrent submissions from reserving the same final space', async () => {
    db.prepare('INSERT INTO account_storage (user_id, used_bytes) VALUES (?, ?)').run('owner',FREE_BYTES - IMAGE_RESERVATION);
    const results=await Promise.allSettled([acceptJob(env,'owner','first-token-123456',request),acceptJob(env,'owner','other-token-123456',request)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(db.prepare('SELECT reserved_bytes FROM account_storage').get()?.reserved_bytes).toBe(IMAGE_RESERVATION);
  });
  it('bounds active jobs and releases reservations exactly once', async () => {
    const jobs=[];
    for(let i=0;i<3;i++)jobs.push(await acceptJob(env,'owner',`request-token-12345${i}`,request));
    await expect(acceptJob(env,'owner','request-token-123459',request)).rejects.toMatchObject({code:'capacity'});
    await finishJob(env,jobs[0].id,'failed'); await finishJob(env,jobs[0].id,'failed');
    expect(db.prepare('SELECT reserved_bytes, active_jobs FROM account_storage').get()).toMatchObject({reserved_bytes:2*IMAGE_RESERVATION,active_jobs:2});
    expect(await getJob(env,jobs[0].id,'different-owner')).toBeNull();
  });
  it('persists accepted jobs when dispatch fails, then repairs dispatch', async () => {
    const job=await acceptJob(env,'owner','request-token-123456',request);
    env.GENERATION={create:vi.fn().mockRejectedValue(new Error('offline')),get:vi.fn().mockRejectedValue(new Error('offline'))} as unknown as Env['GENERATION'];
    await expect(dispatchJob(env,job)).rejects.toThrow();
    expect((await getJob(env,job.id))?.dispatched).toBe(0);
    env.GENERATION={create:vi.fn().mockResolvedValue({})} as unknown as Env['GENERATION'];
    await dispatchJob(env,job);
    expect((await getJob(env,job.id))?.dispatched).toBe(1);
  });
});
