import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { memoryBucket } from './bucket';
import { LOCAL_SCHEMA } from '../src/schema';
import { acceptJob, finishJob, getJob } from '../src/jobs';
import { captureResult, deleteAsset, getAsset, writeOutput } from '../src/assets';
import { cleanupRetainedAssets } from '../src/retention';
import type { Env } from '../src/security';
import { runGeneration, type DurableStep } from '../src/generation-runner';

let db:DatabaseSync,env:Env;
beforeEach(()=>{db=new DatabaseSync(':memory:');db.exec(LOCAL_SCHEMA);db.exec("INSERT INTO account_users VALUES ('owner','google','test@example.test','Test',1)");env={DB:adapter(db),ASSETS:memoryBucket().bucket,APP_ORIGIN:'http://localhost:3097'};});
afterEach(()=>{vi.unstubAllGlobals();db.close();});
const newJob=(token:string)=>acceptJob(env,'owner',token,{provider:'local-test',modelId:'fixture',mediaType:'image',inputMode:'text',prompt:'Quota test',values:{},referenceIds:[]});
async function result(id:string,bytes=4){const key=`accounts/owner/jobs/${id}/0`;await writeOutput(env,key,new Uint8Array(bytes).fill(1),'image/png');return {sources:[{objectKey:key,mimeType:'image/png'}]};}

describe('bounded quota overflow',()=>{
  it('records storage attention without depending on custom errors crossing the Workflow boundary',async()=>{
    const job=await newJob('workflow-quota-token'),output=await result(job.id);db.exec('UPDATE account_storage SET limit_bytes=1');
    const step:DurableStep={do:async(_name,_config,fn)=>{try{return await fn();}catch{throw new Error('Serialized step error');}},sleep:async()=>{}};
    await runGeneration(env,job.id,step,{submit:async()=>({result:output}),poll:async()=>({state:'running'})});
    expect(await getJob(env,job.id)).toMatchObject({state:'needs_attention',error_code:'storage_full'});
  });
  it('resumes saving an existing output even after its provider is disabled',async()=>{
    const job=await newJob('disabled-saving-token'),output=await result(job.id);
    db.prepare("UPDATE account_jobs SET state='saving',provider='gemini',result_json=? WHERE id=?").run(JSON.stringify(output),job.id);
    const step:DurableStep={do:async(_name,_config,fn)=>fn(),sleep:async()=>{}};
    await runGeneration(env,job.id,step);
    expect((await getJob(env,job.id))?.state).toBe('saved');
  });
  it('enforces the service-wide cap independently of an account having free space',async()=>{
    db.exec("INSERT INTO account_users VALUES ('other','other-google','other@example.test','Other',1); INSERT INTO account_storage (user_id,active_jobs) VALUES ('other',100)");
    await expect(newJob('global-capacity-token')).rejects.toMatchObject({code:'service_capacity',status:503});
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_jobs').get()?.n).toBe(0);
  });
  it('bounds the sum of all output transfers, not only each individual file',async()=>{
    const job=await newJob('aggregate-output-token');
    const firstKey=`accounts/owner/jobs/${job.id}/0`;
    const realHead=env.ASSETS!.head.bind(env.ASSETS!);
    // Model a large existing object through metadata, without allocating a GB.
    env.ASSETS!.head=async key=>key===firstKey?{key,size:999999999,httpMetadata:{contentType:'image/png'}} as R2Object:realHead(key);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/png'}})));
    await expect(captureResult(env,job,{sources:[{objectKey:firstKey},{url:'https://fal.media/second.png'}]})).rejects.toMatchObject({code:'result_size'});
    expect(await realHead(`accounts/owner/jobs/${job.id}/1`)).toBeNull();
    expect(db.prepare('SELECT used_bytes FROM account_storage').get()?.used_bytes).toBe(999999999);
  });
  it('protects other reservations during concurrent captures and promotes existing bytes after space is freed',async()=>{
    const first=await newJob('first-quota-token'),second=await newJob('second-quota-token');
    // Small numbers make the same capacity race observable without large buffers.
    db.exec('UPDATE account_jobs SET reservation_bytes=2; UPDATE account_storage SET reserved_bytes=4,limit_bytes=6');
    const a=await result(first.id),b=await result(second.id);
    const outcomes=await Promise.allSettled([captureResult(env,first,a),captureResult(env,second,b)]);
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(db.prepare('SELECT used_bytes FROM account_storage').get()?.used_bytes).toBe(4);
    const temporary=db.prepare('SELECT asset_id FROM account_asset_retention').get()!.asset_id as string;
    const waiting=temporary.startsWith(first.id)?first:second,permanent=waiting.id===first.id?second:first;
    expect((await getAsset(env,temporary,'owner'))?.expires_at).toBeGreaterThan(Date.now());
    await finishJob(env,permanent.id,'saved');
    await deleteAsset(env,`${permanent.id}-0`,'owner');
    const savedResult=waiting.id===first.id?a:b;
    await captureResult(env,waiting,savedResult);await captureResult(env,waiting,savedResult);
    await finishJob(env,waiting.id,'saved');
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_asset_retention').get()?.n).toBe(0);
    expect(db.prepare('SELECT used_bytes,reserved_bytes,active_jobs FROM account_storage').get()).toMatchObject({used_bytes:4,reserved_bytes:0,active_jobs:0});
  });
  it('deleting temporary bytes never subtracts permanent library usage',async()=>{
    const job=await newJob('delete-overflow-token');db.exec('UPDATE account_storage SET limit_bytes=1');
    await expect(captureResult(env,job,await result(job.id))).rejects.toMatchObject({code:'storage_full'});
    await deleteAsset(env,`${job.id}-0`,'owner');await deleteAsset(env,`${job.id}-0`,'owner');
    expect(db.prepare('SELECT used_bytes FROM account_storage').get()?.used_bytes).toBe(0);
  });
  it('expires only temporary outputs, revokes reads immediately and releases the job once',async()=>{
    const permanent=await newJob('permanent-quota-token');await captureResult(env,permanent,await result(permanent.id));await finishJob(env,permanent.id,'saved');
    const waiting=await newJob('expiry-quota-token');db.exec('UPDATE account_storage SET limit_bytes=4');
    await expect(captureResult(env,waiting,await result(waiting.id))).rejects.toMatchObject({code:'storage_full'});
    db.exec('UPDATE account_asset_retention SET expires_at=1');
    expect(await getAsset(env,`${waiting.id}-0`,'owner')).toBeNull();
    await cleanupRetainedAssets(env);await cleanupRetainedAssets(env);
    expect((await getJob(env,waiting.id))?.error_code).toBe('storage_expired');
    expect(await env.ASSETS!.head(`accounts/owner/jobs/${waiting.id}/0`)).toBeNull();
    expect(await getAsset(env,`${permanent.id}-0`,'owner')).not.toBeNull();
    expect(db.prepare('SELECT used_bytes,reserved_bytes,active_jobs FROM account_storage').get()).toMatchObject({used_bytes:4,reserved_bytes:0,active_jobs:0});
  });
  it('does not overwrite a terminal job status on a late completion',async()=>{
    const job=await newJob('terminal-status-token');await finishJob(env,job.id,'cancelled');await finishJob(env,job.id,'saved');
    expect((await getJob(env,job.id))?.state).toBe('cancelled');
    expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage').get()).toMatchObject({reserved_bytes:0,active_jobs:0});
  });
});
