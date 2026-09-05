import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryBucket } from './bucket';
import { adapter } from './database';
import {
  cleanupObjects,
  cleanupTerminalJobObjects,
  TERMINAL_JOB_OBJECT_GRACE_MS,
  TERMINAL_JOB_OBJECT_RESCAN_MS,
  TERMINAL_JOB_OBJECT_RESCAN_WINDOW_MS,
} from '../src/cleanup';
import { captureResult, writeOutput } from '../src/assets';
import { acceptJob, finishJob } from '../src/jobs';
import { beginImport } from '../src/imports';
import { runScheduledMaintenance } from '../src/index';
import { JOB_OBJECT_CLEANUP_SCHEMA, LOCAL_SCHEMA } from '../src/schema';
import type { Env } from '../src/security';

let db:DatabaseSync,env:Env;
beforeEach(()=>{
  db=new DatabaseSync(':memory:');
  db.exec(`${LOCAL_SCHEMA}\n${JOB_OBJECT_CLEANUP_SCHEMA}`);
  db.exec("INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES ('owner','google','test@example.test','Test',1)");
  env={DB:adapter(db),ASSETS:memoryBucket().bucket,APP_ORIGIN:'http://localhost:3097',PUBLIC_WORKER_ORIGIN:'http://localhost:8797'};
});
afterEach(()=>db.close());

const request={provider:'local-test' as const,modelId:'fixture',mediaType:'image' as const,inputMode:'text' as const,prompt:'Cleanup fixture',values:{},referenceIds:[]};

describe('durable cleanup isolation',()=>{
  it('reclaims an untracked terminal staging key after grace and catches a late rewrite',async()=>{
    const job=await acceptJob(env,'owner','terminal-orphan-token',request);
    const key=`accounts/owner/jobs/${job.id}/0`;
    await writeOutput(env,key,new Uint8Array([1]),'image/png');
    await finishJob(env,job.id,'failed','tracking_stopped');
    db.prepare('UPDATE account_jobs SET updated_at=0 WHERE id=?').run(job.id);

    await cleanupTerminalJobObjects(env,TERMINAL_JOB_OBJECT_GRACE_MS-1);
    await cleanupObjects(env);
    expect(await env.ASSETS!.head(key)).not.toBeNull();

    await cleanupTerminalJobObjects(env,TERMINAL_JOB_OBJECT_GRACE_MS);
    await cleanupObjects(env);
    expect(await env.ASSETS!.head(key)).toBeNull();

    await writeOutput(env,key,new Uint8Array([2]),'image/png');
    await cleanupTerminalJobObjects(env,TERMINAL_JOB_OBJECT_GRACE_MS+TERMINAL_JOB_OBJECT_RESCAN_MS);
    await cleanupObjects(env);
    expect(await env.ASSETS!.head(key)).toBeNull();
  });

  it('preserves asset-backed objects and every active job staging key',async()=>{
    const saved=await acceptJob(env,'owner','saved-object-token',request);
    const savedKey=`accounts/owner/jobs/${saved.id}/0`;
    await writeOutput(env,savedKey,new Uint8Array([1]),'image/png');
    await captureResult(env,saved,{sources:[{objectKey:savedKey,mimeType:'image/png'}]});
    await finishJob(env,saved.id,'saved');
    const active=await acceptJob(env,'owner','active-object-token',request);
    const activeKey=`accounts/owner/jobs/${active.id}/0`;
    await writeOutput(env,activeKey,new Uint8Array([2]),'image/png');
    db.prepare('UPDATE account_jobs SET updated_at=0').run();

    await cleanupTerminalJobObjects(env,TERMINAL_JOB_OBJECT_GRACE_MS);
    await cleanupObjects(env);
    expect(await env.ASSETS!.head(savedKey)).not.toBeNull();
    expect(await env.ASSETS!.head(activeKey)).not.toBeNull();
  });

  it('advances a terminal backlog in bounded oldest-first batches',async()=>{
    const ids:string[]=[];
    for(let index=0;index<13;index++){
      const job=await acceptJob(env,'owner',`terminal-backlog-${index}`,request);
      await finishJob(env,job.id,'failed','tracking_stopped');
      db.prepare('UPDATE account_jobs SET updated_at=? WHERE id=?').run(index,job.id);
      ids.push(job.id);
    }
    const afterWindow=TERMINAL_JOB_OBJECT_GRACE_MS+TERMINAL_JOB_OBJECT_RESCAN_WINDOW_MS+ids.length;
    await cleanupTerminalJobObjects(env,afterWindow);
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_job_object_cleanup WHERE next_check_at IS NULL').get()?.n).toBe(12);
    expect(db.prepare('SELECT next_check_at FROM account_job_object_cleanup WHERE job_id=?').get(ids.at(-1)!)?.next_check_at).not.toBeNull();
    await cleanupTerminalJobObjects(env,afterWindow);
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_job_object_cleanup WHERE next_check_at IS NULL').get()?.n).toBe(13);
  });

  it('continues independent import, account, ingress and session cleanup after one cleaner fails',async()=>{
    const imported=await beginImport(env,'owner',{
      clientImportId:'cleanup-import-token',bytes:1,mimeType:'image/png',metadata:request,
    });
    db.prepare('UPDATE account_imports SET expires_at=0 WHERE id=?').run(imported.id);
    db.prepare("INSERT INTO account_sessions VALUES ('expired-session','owner',0)").run();
    db.prepare("INSERT INTO account_ingress_limits VALUES ('expired-limit',0,1,0)").run();
    db.prepare("INSERT INTO account_deletions VALUES ('removed-owner',0,0,NULL)").run();
    const removedKey='accounts/removed-owner/jobs/old/0';
    await writeOutput(env,removedKey,new Uint8Array([3]),'image/png');

    const backing=env.DB;
    let failed=false;
    env.DB={...backing,prepare(query:string){
      if(!failed&&query.includes("UPDATE account_uploads SET state='deleted'")){failed=true;throw new Error('upload cleanup unavailable');}
      return backing.prepare(query);
    }} as D1Database;

    await runScheduledMaintenance(env);
    expect(db.prepare('SELECT state,reservation_accounted FROM account_imports WHERE id=?').get(imported.id)).toEqual({state:'expired',reservation_accounted:0});
    expect(db.prepare("SELECT reserved_bytes FROM account_storage WHERE user_id='owner'").get()?.reserved_bytes).toBe(0);
    expect(await env.ASSETS!.head(removedKey)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_ingress_limits').get()?.n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get()?.n).toBe(0);
  });
});
