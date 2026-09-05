import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { memoryBucket } from './bucket';
import { handleRequest } from '../src/index';
import { saveConnection } from '../src/vault';
import { acceptJob } from '../src/jobs';
import { captureResult, deleteAsset, getAsset, writeOutput } from '../src/assets';
import { cleanupObjects } from '../src/cleanup';
import type { Env } from '../src/security';

let db:DatabaseSync,env:Env,cookies:string,owner:string;
const call=(path:string,method='GET',expectedOwner?:string)=>handleRequest(new Request(`http://localhost:8797/api/account/${path}`,{method,headers:{Origin:env.APP_ORIGIN,Cookie:cookies,...(expectedOwner?{'X-Account-Id':expectedOwner}:{})}}),env);
beforeEach(async()=>{
  db=new DatabaseSync(':memory:');env={DB:adapter(db),ASSETS:memoryBucket().bucket,APP_ORIGIN:'http://localhost:3097',DEV_ACCOUNT_EMAIL:'fixture@example.test',ACCOUNT_ENCRYPTION_VERSION:'1',ACCOUNT_ENCRYPTION_KEYS:JSON.stringify({'1':btoa('x'.repeat(32))})};
  const login=await call('local-sign-in','POST');cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  owner=(await (await call('session')).json()).account.id;
});
afterEach(()=>{vi.restoreAllMocks();db.close();});
async function fixture(){
  await saveConnection(env,owner,'gemini',{apiKey:'fixture-encrypted-key'});
  const job=await acceptJob(env,owner,'lifecycle-fixture-token',{provider:'local-test',modelId:'fixture',mediaType:'image',inputMode:'text',prompt:'Local lifecycle fixture',values:{},referenceIds:[]});
  const key=`accounts/${owner}/jobs/${job.id}/0`;await writeOutput(env,key,new Uint8Array([1,2,3]),'image/png');
  await captureResult(env,job,{sources:[{objectKey:key,mimeType:'image/png'}]});
  return {job,key,assetId:`${job.id}-0`};
}

describe('account lifecycle',()=>{
  it('revokes all sessions, encrypted keys and metadata while leaving only cleanup identifiers',async()=>{
    const {key,assetId}=await fixture();
    const firstCookies=cookies;cookies='';
    const another=await call('local-sign-in','POST');const secondCookies=another.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');cookies=firstCookies;
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get()?.n).toBe(2);
    const response=await call('profile','DELETE',owner);expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    for(const table of ['account_users','account_sessions','account_connections','account_jobs','account_assets','account_storage'])expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
    expect(db.prepare('SELECT user_id FROM account_deletions').get()?.user_id).toBe(owner);
    expect((await (await call('session')).json()).account).toBeNull();cookies=secondCookies;
    expect((await (await call('session')).json()).account).toBeNull();
    expect(await getAsset(env,assetId,owner)).toBeNull();
    await cleanupObjects(env);expect(await env.ASSETS!.head(key)).toBeNull();
  });
  it('rejects stale owner identity before deleting and assigns a new prefix on sign-up again',async()=>{
    await fixture();
    expect((await call('profile','DELETE','someone-else')).status).toBe(409);
    expect((await (await call('session')).json()).account.id).toBe(owner);
    await call('profile','DELETE',owner);
    const login=await call('local-sign-in','POST');cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    expect((await (await call('session')).json()).account.id).not.toBe(owner);
  });
  it('retries failed object removal and catches late writes only within the deleted owner prefix',async()=>{
    const {key}=await fixture();const other='accounts/other/jobs/keep/0';await writeOutput(env,other,new Uint8Array([4]),'image/png');
    await call('profile','DELETE',owner);
    vi.spyOn(env.ASSETS!,'delete').mockRejectedValueOnce(new Error('R2 unavailable'));
    await cleanupObjects(env);expect(await env.ASSETS!.head(key)).not.toBeNull();
    db.exec('UPDATE account_deletions SET next_check_at=0');await cleanupObjects(env);
    expect(await env.ASSETS!.head(key)).toBeNull();expect(await env.ASSETS!.head(other)).not.toBeNull();
    const late=`accounts/${owner}/jobs/late/0`;await writeOutput(env,late,new Uint8Array([5]),'image/png');
    db.exec('UPDATE account_deletions SET next_check_at=0');await cleanupObjects(env);
    expect(await env.ASSETS!.head(late)).toBeNull();
    db.exec('UPDATE account_deletions SET next_check_at=0,created_at=1');await cleanupObjects(env);
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_deletions').get()?.n).toBe(0);
  });
  it('keeps ordinary asset deletion queued after R2 failure while revoking reads and quota immediately',async()=>{
    const {assetId,key}=await fixture();vi.spyOn(env.ASSETS!,'delete').mockRejectedValueOnce(new Error('R2 unavailable'));
    await deleteAsset(env,assetId,owner);
    expect(await getAsset(env,assetId,owner)).toBeNull();expect(await env.ASSETS!.head(key)).not.toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_object_deletions').get()?.n).toBe(1);
    expect(db.prepare('SELECT used_bytes FROM account_storage').get()?.used_bytes).toBe(0);
    await cleanupObjects(env);expect(await env.ASSETS!.head(key)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_object_deletions').get()?.n).toBe(0);
  });
  it('continues paginated account cleanup and resets the cursor for late-write scans',async()=>{
    const {key}=await fixture(),second=`accounts/${owner}/jobs/z-last/0`;await writeOutput(env,second,new Uint8Array([2]),'image/png');
    await call('profile','DELETE',owner);
    const list=env.ASSETS!.list.bind(env.ASSETS!);
    vi.spyOn(env.ASSETS!,'list').mockImplementation(options=>list({...options,limit:1}));
    await cleanupObjects(env);
    expect(db.prepare('SELECT cursor FROM account_deletions').get()?.cursor).toBeTruthy();
    await cleanupObjects(env);
    expect(await env.ASSETS!.head(key)).toBeNull();expect(await env.ASSETS!.head(second)).toBeNull();
    expect(db.prepare('SELECT cursor FROM account_deletions').get()?.cursor).toBeNull();
  });
});
