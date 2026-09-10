import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { LOCAL_SCHEMA } from '../src/schema';
import { acceptJob, dispatchJob, finishJob, FREE_BYTES, getJob, IMAGE_RESERVATION, MAX_ACTIVE_JOBS } from '../src/jobs';
import type { Env } from '../src/security';
import type { CloudJobRequest } from '../../lib/account/contracts';
let db: DatabaseSync, env: Env;
const request: CloudJobRequest = { provider: 'local-test', modelId: 'local-test', mediaType: 'image', inputMode: 'text', prompt: 'A local test', values: {}, referenceIds: [] };
beforeEach(() => { db = new DatabaseSync(':memory:'); db.exec(LOCAL_SCHEMA); db.exec("INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES ('owner','google','test@example.test','Test',1)"); env = { DB: adapter(db), APP_ORIGIN: 'http://localhost:3097' }; });
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
  it('bounds running jobs and releases reservations exactly once', async () => {
    // Loops to the constant rather than a literal: the bound moved from 3 to 10
    // and a hardcoded count would have kept passing while testing nothing.
    const jobs=[];
    for(let i=0;i<MAX_ACTIVE_JOBS;i++)jobs.push(await acceptJob(env,'owner',`bound-token-1234${String(i).padStart(2,'0')}`,request));
    // Named for the bound it hit, which is what this test is about: 'capacity'
    // used to cover storage and slots alike and could not tell them apart.
    await expect(acceptJob(env,'owner','bound-token-over12',request)).rejects.toMatchObject({code:'active_jobs'});
    await finishJob(env,jobs[0].id,'failed'); await finishJob(env,jobs[0].id,'failed');
    expect(db.prepare('SELECT reserved_bytes, active_jobs FROM account_storage').get())
      .toMatchObject({reserved_bytes:(MAX_ACTIVE_JOBS-1)*IMAGE_RESERVATION,active_jobs:MAX_ACTIVE_JOBS-1});
    expect(await getJob(env,jobs[0].id,'different-owner')).toBeNull();
  });

  it('does not let a job awaiting a decision hold a slot', async () => {
    // The point of counting live state instead of `active_jobs`: a job stuck in
    // needs_attention is waiting on a person who may never come back, and used
    // to occupy a slot indefinitely while nothing was running.
    const jobs=[];
    for(let i=0;i<MAX_ACTIVE_JOBS;i++)jobs.push(await acceptJob(env,'owner',`stuck-token-1234${String(i).padStart(2,'0')}`,request));
    await expect(acceptJob(env,'owner','stuck-token-over12',request)).rejects.toMatchObject({code:'active_jobs'});

    db.prepare("UPDATE account_jobs SET state='needs_attention' WHERE id=?").run(jobs[0].id);

    // Accepted now, even though `active_jobs` still counts it — the counter is
    // holding that job's reservation, which it still needs.
    const extra = await acceptJob(env,'owner','stuck-token-after1',request);
    expect(extra.id).toBeTruthy();
    expect(db.prepare('SELECT active_jobs FROM account_storage').get())
      .toMatchObject({active_jobs:MAX_ACTIVE_JOBS+1});
  });

  it('fits ten concurrent video jobs inside the free quota', async () => {
    // The reservation is derived from the job bound, so the two must agree:
    // at 256 MB the fourth video job was refused for storage while the job
    // count said there was room.
    const video: CloudJobRequest = {...request, mediaType:'video'};
    for(let i=0;i<MAX_ACTIVE_JOBS;i++){
      await acceptJob(env,'owner',`video-token-1234${String(i).padStart(2,'0')}`,video);
    }
    const held = db.prepare('SELECT reserved_bytes FROM account_storage').get()?.reserved_bytes as number;
    expect(held).toBeLessThanOrEqual(FREE_BYTES);
    expect(db.prepare('SELECT active_jobs FROM account_storage').get()).toMatchObject({active_jobs:MAX_ACTIVE_JOBS});
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
