import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { LOCAL_SCHEMA } from '../src/schema';
import { acceptJob, cancelQueuedJob, getJob, IMAGE_RESERVATION } from '../src/jobs';
import { jobRoutes } from '../src/job-routes';
import { runGeneration, type DurableStep } from '../src/generation-runner';
import { hash, type Env } from '../src/security';
import type { GenerationAdapter } from '../src/providers';
import type { CloudJobRequest } from '../../lib/account/contracts';

const request:CloudJobRequest={provider:'local-test',modelId:'local-test',mediaType:'image',inputMode:'text',prompt:'cancel fixture',values:{},referenceIds:[]};
const step:DurableStep={do:async(_name,_config,fn)=>fn(),sleep:async()=>{}};
let db:DatabaseSync,env:Env;
const sessions={owner:'owner-session-token-123456789012345',other:'other-session-token-123456789012345'};

beforeEach(async()=>{
  db=new DatabaseSync(':memory:');db.exec(LOCAL_SCHEMA);
  db.exec("INSERT INTO account_users VALUES ('owner','google-owner','owner@example.test','Owner',1),('other','google-other','other@example.test','Other',1)");
  env={DB:adapter(db),APP_ORIGIN:'http://localhost:3097'};
  for(const [owner,token] of Object.entries(sessions))await env.DB.prepare('INSERT INTO account_sessions VALUES (?,?,?)').bind(await hash(token),owner,Date.now()+60_000).run();
});
afterEach(()=>{vi.restoreAllMocks();db.close();});

function cancelRequest(id:string,owner:keyof typeof sessions='owner'){
  return jobRoutes(new Request(`http://localhost:8797/api/account/jobs/${id}/cancel`,{method:'POST',headers:{cookie:`sa_session=${sessions[owner]}`}}),env);
}
async function fixture(token='cancel-job-token-123456'){return acceptJob(env,'owner',token,request);}

describe('queued job cancellation',()=>{
  it('cancels a queued job and releases its reservation exactly once',async()=>{
    const job=await fixture();
    const response=await cancelRequest(job.id);
    expect(response?.status).toBe(200);
    expect((await response!.json()).job).toMatchObject({id:job.id,state:'cancelled',errorCode:null});
    expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({reserved_bytes:0,active_jobs:0});
    expect((await getJob(env,job.id))?.reservation_accounted).toBe(0);
  });

  it('returns the same cancelled job when cancellation is repeated',async()=>{
    const job=await fixture();
    const first=await cancelRequest(job.id),second=await cancelRequest(job.id);
    expect((await first!.json()).job).toEqual((await second!.json()).job);
    expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({reserved_bytes:0,active_jobs:0});
  });

  it('returns 409 without releasing quota after submission has claimed the job',async()=>{
    const job=await fixture();
    const claim=await env.DB.prepare("UPDATE account_jobs SET state='submitting' WHERE id=? AND state='queued'").bind(job.id).run();
    expect(claim.meta.changes).toBe(1);
    const response=await cancelRequest(job.id);
    expect(response?.status).toBe(409);
    expect(await response!.json()).toEqual({error:'This generation has already started and remains tracked.',code:'generation_started'});
    expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({reserved_bytes:IMAGE_RESERVATION,active_jobs:1});
  });

  it('hides jobs owned by another account',async()=>{
    const job=await fixture();
    const response=await cancelRequest(job.id,'other');
    expect(response?.status).toBe(404);
    expect(await response!.json()).toEqual({error:'Job not found.'});
  });

  it('makes an already-dispatched cancelled workflow a no-op',async()=>{
    const job=await fixture();await cancelQueuedJob(env,job.id,'owner');
    const provider:GenerationAdapter={recover:vi.fn(),submit:vi.fn(),poll:vi.fn()};
    await runGeneration(env,job.id,step,provider);
    expect(provider.recover).not.toHaveBeenCalled();expect(provider.submit).not.toHaveBeenCalled();expect(provider.poll).not.toHaveBeenCalled();
    expect((await getJob(env,job.id))?.state).toBe('cancelled');
  });

  it('allows only one winner when submission claim and cancellation race',async()=>{
    const job=await fixture();
    const cancellation=cancelQueuedJob(env,job.id,'owner');
    const claim=env.DB.prepare("UPDATE account_jobs SET state='submitting',updated_at=? WHERE id=? AND state='queued' AND deleted=0").bind(Date.now(),job.id).run();
    const [cancelResult,claimResult]=await Promise.allSettled([cancellation,claim]);
    const row=await getJob(env,job.id);
    expect(['cancelled','submitting']).toContain(row?.state);
    if(row?.state==='cancelled'){
      expect(cancelResult.status).toBe('fulfilled');
      expect(claimResult.status==='fulfilled'&&claimResult.value.meta.changes).toBe(0);
      expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({reserved_bytes:0,active_jobs:0});
    }else{
      expect(cancelResult.status).toBe('rejected');
      expect(claimResult.status==='fulfilled'&&claimResult.value.meta.changes).toBe(1);
      expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toMatchObject({reserved_bytes:IMAGE_RESERVATION,active_jobs:1});
    }
  });
});
