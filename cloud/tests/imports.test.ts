import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAsset, getAsset, writeOutput } from '../src/assets';
import { deleteAccount } from '../src/lifecycle';
import {
  beginImport,
  cleanupImports,
  importRoutes,
  MAX_ACCOUNT_LIVE_IMPORT_ATTEMPTS,
  MAX_GLOBAL_LIVE_IMPORT_ATTEMPTS,
  MAX_IMPORT_ATTEMPTS,
  publicImportMedia,
} from '../src/imports';
import { LOCAL_SCHEMA } from '../src/schema';
import { createSession } from '../src/sessions';
import type { Env } from '../src/security';
import { adapter } from './database';
import { memoryBucket } from './bucket';

let db:DatabaseSync,env:Env,bucketState:ReturnType<typeof memoryBucket>,cookie:string;
const metadata=(kind:'image'|'video'='image')=>({
  provider:'local-test' as const,modelId:'browser-original',mediaType:kind,inputMode:'text' as const,
  prompt:'Imported browser result',values:{quality:'original'},referenceIds:[],
});
const intent=(clientImportId:string,bytes=3,mimeType='image/png',kind:'image'|'video'='image')=>({clientImportId,bytes,mimeType,metadata:metadata(kind)});
const put=(url:string,bytes=new Uint8Array([1,2,3]),mime='image/png',origin=env.APP_ORIGIN)=>
  publicImportMedia(new Request(url,{method:'PUT',headers:{Origin:origin,'Content-Type':mime},body:bytes}),env);
const route=(path:string,method='GET')=>importRoutes(new Request(`http://localhost:8797/api/account/imports${path}`,{method,headers:{Origin:env.APP_ORIGIN,Cookie:cookie}}),env);

beforeEach(async()=>{
  db=new DatabaseSync(':memory:');db.exec(LOCAL_SCHEMA);
  db.exec("INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES ('owner','google','test@example.test','Test',1),('other','google2','other@example.test','Other',1)");
  bucketState=memoryBucket();
  env={DB:adapter(db),ASSETS:bucketState.bucket,APP_ORIGIN:'http://localhost:3097',PUBLIC_WORKER_ORIGIN:'http://localhost:8797'};
  cookie=(await createSession(env,{subject:'google',email:'test@example.test',name:'Test'})).split(';')[0];
});
afterEach(()=>{vi.restoreAllMocks();db.close();});

describe('opt-in permanent imports',()=>{
  it('reserves quota, streams an image, and creates a permanent jobless asset exactly once',async()=>{
    const started=await beginImport(env,'owner',intent('image-import-0001'));
    expect(started.state).toBe('pending');expect(started.url).toContain('/import-media/');
    expect(db.prepare('SELECT reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toEqual({reserved_bytes:3,active_jobs:0});
    const response=await put(started.url!);expect(response?.status).toBe(200);
    const completed=await response!.json() as {id:string;state:string;assetId:string};
    expect(completed).toMatchObject({id:started.id,state:'completed',assetId:started.id});
    expect(await getAsset(env,started.id,'owner')).toMatchObject({job_id:null,bytes:3,mime_type:'image/png'});
    expect(db.prepare('SELECT used_bytes,reserved_bytes,active_jobs FROM account_storage WHERE user_id=?').get('owner')).toEqual({used_bytes:3,reserved_bytes:0,active_jobs:0});
    expect((await put(started.url!))?.status).toBe(404);
  });

  it('protects quota already reserved by generation and bounds concurrent import intents',async()=>{
    db.exec("INSERT INTO account_storage (user_id,limit_bytes,reserved_bytes,active_jobs) VALUES ('owner',10,4,1)");
    await expect(beginImport(env,'owner',intent('quota-import-0001',7))).rejects.toMatchObject({code:'capacity'});
    await beginImport(env,'owner',intent('quota-import-0002',6));
    db.exec("UPDATE account_storage SET limit_bytes=100 WHERE user_id='owner'");
    await beginImport(env,'owner',intent('quota-import-0003',1));
    await beginImport(env,'owner',intent('quota-import-0004',1));
    await expect(beginImport(env,'owner',intent('quota-import-0005',1))).rejects.toMatchObject({code:'capacity'});
    expect(db.prepare('SELECT active_jobs FROM account_storage WHERE user_id=?').get('owner')?.active_jobs).toBe(1);
  });

  it('renews a capability for an identical stable ID and rejects changed payloads',async()=>{
    const first=await beginImport(env,'owner',intent('stable-import-0001'));
    const replay=await beginImport(env,'owner',{metadata:metadata(),mimeType:'image/png',bytes:3,clientImportId:'stable-import-0001'});
    expect(replay.id).toBe(first.id);expect(replay.url).not.toBe(first.url);
    expect((await put(first.url!))?.status).toBe(404);
    await expect(beginImport(env,'owner',intent('stable-import-0001',4))).rejects.toMatchObject({code:'import_conflict'});
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_imports').get()?.count).toBe(1);
  });

  it('recovers when R2 completes before a D1 finalization failure',async()=>{
    const started=await beginImport(env,'owner',intent('recover-import-001'));
    const originalBatch=env.DB.batch.bind(env.DB);let fail=true;
    env.DB.batch=async statements=>{if(fail&&statements.length===4){fail=false;throw new Error('D1 unavailable');}return originalBatch(statements);};
    expect((await put(started.url!))?.status).toBe(400);
    expect(await env.ASSETS!.head(`accounts/owner/imports/${started.id}`)).not.toBeNull();
    expect(db.prepare('SELECT state FROM account_imports WHERE id=?').get(started.id)?.state).toBe('uploading');
    const resumed=await beginImport(env,'owner',intent('recover-import-001'));
    expect((await put(resumed.url!))?.status).toBe(200);
    expect(db.prepare('SELECT used_bytes,reserved_bytes FROM account_storage WHERE user_id=?').get('owner')).toEqual({used_bytes:3,reserved_bytes:0});
  });

  it('fences a lost multipart request and resumes on a new object key',async()=>{
    const first=await beginImport(env,'owner',intent('lost-stream-import'));
    let release!:()=>void,blocked!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const reading=new Promise<void>(resolve=>{blocked=resolve;});
    let pulled=false;
    const stream=new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(new Uint8Array([1]));},
      async pull(controller){if(pulled)return;pulled=true;blocked();await gate;controller.enqueue(new Uint8Array([2,3]));controller.close();},
    });
    const staleResponse=publicImportMedia(new Request(first.url!,{method:'PUT',headers:{Origin:env.APP_ORIGIN,'Content-Type':'image/png'},body:stream,duplex:'half'} as RequestInit),env);
    await reading;
    const oldKey=db.prepare('SELECT object_key FROM account_imports WHERE id=?').get(first.id)?.object_key as string;
    const resumed=await beginImport(env,'owner',intent('lost-stream-import'));
    const newKey=db.prepare('SELECT object_key FROM account_imports WHERE id=?').get(first.id)?.object_key as string;
    expect(newKey).not.toBe(oldKey);expect(resumed.url).toBeTruthy();
    release();
    expect((await staleResponse)?.status).toBe(409);
    expect(await env.ASSETS!.head(oldKey)).toBeNull();
    expect((await put(resumed.url!))?.status).toBe(200);
    expect(await env.ASSETS!.head(newKey)).not.toBeNull();
    expect(db.prepare('SELECT used_bytes,reserved_bytes FROM account_storage WHERE user_id=?').get('owner')).toEqual({used_bytes:3,reserved_bytes:0});
  });

  it('repeatedly cleans a superseded key so a late orphan is caught after its first cleanup pass',async()=>{
    const first=await beginImport(env,'owner',intent('late-orphan-import'));
    db.prepare("UPDATE account_imports SET state='uploading' WHERE id=?").run(first.id);
    const oldKey=db.prepare('SELECT object_key FROM account_imports WHERE id=?').get(first.id)?.object_key as string;
    await beginImport(env,'owner',intent('late-orphan-import'));
    db.prepare("UPDATE account_import_attempts SET cleanup_after=0 WHERE import_id=? AND attempt=1").run(first.id);
    await cleanupImports(env);
    expect(await env.ASSETS!.head(oldKey)).toBeNull();
    await writeOutput(env,oldKey,new Uint8Array([7,8,9]),'image/png');
    db.prepare("UPDATE account_import_attempts SET cleanup_after=0 WHERE import_id=? AND attempt=1").run(first.id);
    await cleanupImports(env);
    expect(await env.ASSETS!.head(oldKey)).toBeNull();
    expect(db.prepare('SELECT state FROM account_import_attempts WHERE import_id=? AND attempt=1').get(first.id)?.state).toBe('superseded');
  });

  it('bounds abandoned attempts and releases the reservation instead of leaving a stuck upload',async()=>{
    const started=await beginImport(env,'owner',intent('attempt-cap-import'));
    for(let attempt=1;attempt<MAX_IMPORT_ATTEMPTS;attempt++){
      db.prepare("UPDATE account_imports SET state='uploading' WHERE id=?").run(started.id);
      await beginImport(env,'owner',intent('attempt-cap-import'));
    }
    db.prepare("UPDATE account_imports SET state='uploading' WHERE id=?").run(started.id);
    await expect(beginImport(env,'owner',intent('attempt-cap-import'))).rejects.toMatchObject({code:'import_attempt_limit'});
    expect(db.prepare('SELECT state,upload_attempt FROM account_imports WHERE id=?').get(started.id)).toEqual({state:'cancelled',upload_attempt:MAX_IMPORT_ATTEMPTS});
    expect(db.prepare('SELECT reserved_bytes FROM account_storage WHERE user_id=?').get('owner')?.reserved_bytes).toBe(0);
  });

  it('rejects a new intent after cancelled imports fill the account live-attempt cap',async()=>{
    for(let index=0;index<MAX_ACCOUNT_LIVE_IMPORT_ATTEMPTS;index++){
      const started=await beginImport(env,'owner',intent(`cancelled-cap-${String(index).padStart(3,'0')}`));
      expect((await route(`/${started.id}`,'DELETE'))?.status).toBe(200);
    }

    await expect(beginImport(env,'owner',intent('cancelled-cap-rejected'))).rejects.toMatchObject({
      code:'import_attempt_capacity',status:409,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM account_imports WHERE user_id='owner' AND client_id='cancelled-cap-rejected'").get()?.count).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM account_import_attempts WHERE state IN ('active','superseded')").get()?.count).toBe(MAX_ACCOUNT_LIVE_IMPORT_ATTEMPTS);
    expect(db.prepare("SELECT reserved_bytes FROM account_storage WHERE user_id='owner'").get()?.reserved_bytes).toBe(0);
  });

  it('rejects a new intent at the global live-attempt cap while an existing stable import can complete',async()=>{
    const stable=await beginImport(env,'owner',intent('global-cap-stable-import'));
    const insertUser=db.prepare('INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES (?,?,?,?,1)');
    const insertImport=db.prepare(`INSERT INTO account_imports
      (id,user_id,client_id,request_digest,object_key,kind,mime_type,expected_bytes,metadata_json,state,upload_attempt,created_at,updated_at,expires_at)
      VALUES (?,?,?,?,?,'image','image/png',1,'{}','cancelled',?,1,1,9999999999999)`);
    const insertAttempt=db.prepare("INSERT INTO account_import_attempts (import_id,attempt,object_key,state,cleanup_after,cleanup_until) VALUES (?,?,?,'superseded',9999999999999,9999999999999)");
    let remaining=MAX_GLOBAL_LIVE_IMPORT_ATTEMPTS-1,importIndex=0,userIndex=0;
    while(remaining>0){
      const userId=`global-cap-user-${userIndex}`;
      insertUser.run(userId,`global-cap-subject-${userIndex}`,`global-cap-${userIndex}@example.test`,'Global cap');
      let ownerAttempts=0;
      while(ownerAttempts<MAX_ACCOUNT_LIVE_IMPORT_ATTEMPTS&&remaining>0){
        const attempts=Math.min(MAX_IMPORT_ATTEMPTS,MAX_ACCOUNT_LIVE_IMPORT_ATTEMPTS-ownerAttempts,remaining);
        const importId=`global-cap-import-${importIndex}`,currentKey=`global-cap/${importIndex}/attempt-${attempts}`;
        insertImport.run(importId,userId,`global-cap-client-${importIndex}`,'digest',currentKey,attempts);
        for(let attempt=1;attempt<=attempts;attempt++)insertAttempt.run(importId,attempt,`global-cap/${importIndex}/attempt-${attempt}`);
        ownerAttempts+=attempts;remaining-=attempts;importIndex++;
      }
      userIndex++;
    }

    await expect(beginImport(env,'owner',intent('global-cap-rejected-import'))).rejects.toMatchObject({
      code:'service_capacity',status:503,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM account_imports WHERE user_id='owner' AND client_id='global-cap-rejected-import'").get()?.count).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM account_import_attempts WHERE state IN ('active','superseded')").get()?.count).toBe(MAX_GLOBAL_LIVE_IMPORT_ATTEMPTS);
    expect(db.prepare("SELECT reserved_bytes FROM account_storage WHERE user_id='owner'").get()?.reserved_bytes).toBe(3);

    const replay=await beginImport(env,'owner',intent('global-cap-stable-import'));
    expect(replay.id).toBe(stable.id);
    expect((await put(replay.url!))?.status).toBe(200);
    expect(db.prepare("SELECT used_bytes,reserved_bytes FROM account_storage WHERE user_id='owner'").get()).toEqual({used_bytes:3,reserved_bytes:0});
  });

  it('rejects wrong-size data without creating an asset and supports WebM video',async()=>{
    const wrong=await beginImport(env,'owner',intent('wrong-size-import',3));
    const rejected=await put(wrong.url!,new Uint8Array([1,2]));expect(rejected?.status).toBe(400);
    expect(await getAsset(env,wrong.id,'owner')).toBeNull();
    expect(await env.ASSETS!.head(`accounts/owner/imports/${wrong.id}`)).toBeNull();
    const video=await beginImport(env,'owner',intent('video-import-0001',4,'video/webm','video'));
    expect((await put(video.url!,new Uint8Array([1,2,3,4]),'video/webm'))?.status).toBe(200);
    expect(await getAsset(env,video.id,'owner')).toMatchObject({kind:'video',mime_type:'video/webm',job_id:null});
  });

  it('cancels and expires reservations once while retaining immutable tombstones',async()=>{
    const cancelled=await beginImport(env,'owner',intent('cancel-import-001',4));
    expect((await route(`/${cancelled.id}`,'DELETE'))?.status).toBe(200);
    expect((await route(`/${cancelled.id}`,'DELETE'))?.status).toBe(200);
    expect(db.prepare('SELECT reserved_bytes FROM account_storage WHERE user_id=?').get('owner')?.reserved_bytes).toBe(0);
    const expiring=await beginImport(env,'owner',intent('expiry-import-001',5));
    db.prepare('UPDATE account_imports SET expires_at=0 WHERE id=?').run(expiring.id);
    await cleanupImports(env);await cleanupImports(env);
    expect(db.prepare('SELECT state FROM account_imports WHERE id=?').get(expiring.id)?.state).toBe('expired');
    expect(db.prepare('SELECT reserved_bytes FROM account_storage WHERE user_id=?').get('owner')?.reserved_bytes).toBe(0);
    const replay=await beginImport(env,'owner',intent('expiry-import-001',5));
    expect(replay).toMatchObject({id:expiring.id,state:'expired'});
    await expect(beginImport(env,'owner',intent('expiry-import-001',6))).rejects.toMatchObject({code:'import_conflict'});
  });

  it('isolates owners and does not resurrect an import after its asset is deleted',async()=>{
    const ownerImport=await beginImport(env,'owner',intent('shared-client-id-01'));
    const otherImport=await beginImport(env,'other',intent('shared-client-id-01'));
    expect(ownerImport.id).not.toBe(otherImport.id);
    expect((await route(`/${otherImport.id}`))?.status).toBe(404);
    await put(ownerImport.url!);await deleteAsset(env,ownerImport.id,'owner');
    const replay=await beginImport(env,'owner',intent('shared-client-id-01'));
    expect(replay).toMatchObject({id:ownerImport.id,state:'completed',assetId:ownerImport.id});
    expect(replay.url).toBeUndefined();expect(await getAsset(env,ownerImport.id,'owner')).toBeNull();
  });

  it('queues an orphan if account deletion wins after the object transfer',async()=>{
    const started=await beginImport(env,'owner',intent('delete-race-import'));
    const originalBatch=env.DB.batch.bind(env.DB);let race=true;
    env.DB.batch=async statements=>{
      if(race&&statements.length===4){race=false;await deleteAccount(env,'owner');}
      return originalBatch(statements);
    };
    const response=await put(started.url!);expect(response?.status).toBe(409);
    expect(await env.ASSETS!.head(`accounts/owner/imports/${started.id}`)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS count FROM account_assets').get()?.count).toBe(0);
    expect(db.prepare('SELECT user_id FROM account_deletions').get()?.user_id).toBe('owner');
  });
});
