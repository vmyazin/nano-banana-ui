import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapter } from './database';
import { memoryBucket } from './bucket';
import { LOCAL_SCHEMA } from '../src/schema';
import { saveConnection } from '../src/vault';
import { acceptJob, getJob } from '../src/jobs';
import { adapterFor, validateRequest } from '../src/providers';
import { runGeneration, type DurableStep } from '../src/generation-runner';
import { inlineReferences, stageImage } from '../src/provider-adapters/media';
import { writeOutput } from '../src/assets';
import type { Env } from '../src/security';
import type { CloudJobRequest } from '../../lib/account/contracts';

let db: DatabaseSync, env: Env;
const request: CloudJobRequest = {provider:'gemini', modelId:'gemini-3-pro-image-preview', mediaType:'image', inputMode:'text', prompt:'A product photo', values:{imageSize:'1K'},referenceIds:[]};
const step:DurableStep = {do:async(_name,_config,fn)=>fn(),sleep:async()=>{}};
beforeEach(async () => {
  db=new DatabaseSync(':memory:');db.exec(LOCAL_SCHEMA);db.exec("INSERT INTO account_users VALUES ('owner','google','test@example.test','Test',1)");
  env={DB:adapter(db),ASSETS:memoryBucket().bucket,APP_ORIGIN:'http://localhost:3097',CLOUD_GENERATION_PROVIDERS:'gemini,cloudflare',ACCOUNT_ENCRYPTION_VERSION:'1',ACCOUNT_ENCRYPTION_KEYS:JSON.stringify({'1':btoa('x'.repeat(32))})};
  await saveConnection(env,'owner','gemini',{apiKey:'test-gemini-secret'});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();db.close();});

describe('synchronous account generation',()=>{
  it('requires a saved Pollinations key and streams the current API response privately',async()=>{
    env.CLOUD_GENERATION_PROVIDERS='pollinations';
    const r:CloudJobRequest={...request,provider:'pollinations',modelId:'flux',values:{aspectRatio:'16:9'}};
    validateRequest(env,r);
    await expect(acceptJob(env,'owner','pollinations-test-token',r)).rejects.toThrow(/Save this provider connection/);
    await saveConnection(env,'owner','pollinations',{apiKey:'sk-local-test-key'});
    const fetchMock=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}}));vi.stubGlobal('fetch',fetchMock);
    const job=await acceptJob(env,'owner','pollinations-test-token',r);await runGeneration(env,job.id,step);
    expect((await getJob(env,job.id))?.state).toBe('saved');
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/gen\.pollinations\.ai\/image\//);
    expect(fetchMock.mock.calls[0][0]).not.toContain('sk-local-test-key');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({headers:{Authorization:'Bearer sk-local-test-key'},redirect:'error'});
  });
  it('disables SDK paid retries even for retryable HTTP failures',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({error:{code:503,message:'Unavailable',status:'UNAVAILABLE'}},{status:503}));vi.stubGlobal('fetch',fetchMock);
    const job=await acceptJob(env,'owner','gemini-failure-token',request);
    await runGeneration(env,job.id,step);await runGeneration(env,job.id,step);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getJob(env,job.id))?.error_code).toBe('submission_ambiguous');
  });
  it('recovers R2 after a lost database result commit without repeating generation',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({candidates:[{content:{parts:[{inlineData:{data:'AQID',mimeType:'image/jpeg'}}]}}]}));vi.stubGlobal('fetch',fetchMock);
    const job=await acceptJob(env,'owner','gemini-recovery-token',request);
    const prepare=env.DB.prepare.bind(env.DB);let lost=false;
    vi.spyOn(env.DB,'prepare').mockImplementation(sql=>{
      const statement=prepare(sql);
      if(sql.includes('SET provider_task =')&&!lost){
        const bind=statement.bind.bind(statement);
        statement.bind=(...args)=>{const bound=bind(...args);bound.run=async()=>{lost=true;throw new Error('lost D1 write');};return bound;};
      }
      return statement;
    });
    await runGeneration(env,job.id,step);
    expect((await getJob(env,job.id))?.state).toBe('needs_attention');
    await runGeneration(env,job.id,step);
    expect((await getJob(env,job.id))?.state).toBe('saved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT mime_type,bytes FROM account_assets').get()).toMatchObject({mime_type:'image/jpeg',bytes:3});
  });
  it('stages Cloudflare output using only the saved encrypted credentials',async()=>{
    await saveConnection(env,'owner','cloudflare',{apiKey:'test-cloudflare-token',accountId:'a'.repeat(32)});
    const r:CloudJobRequest={...request,provider:'cloudflare',modelId:'@cf/black-forest-labs/flux-1-schnell',values:{}};
    validateRequest(env,r);
    const fetchMock=vi.fn().mockResolvedValue(Response.json({success:true,result:{image:'AQID'}}));vi.stubGlobal('fetch',fetchMock);
    const job=await acceptJob(env,'owner','cloudflare-test-token',r);
    await runGeneration(env,job.id,step);
    expect((await getJob(env,job.id))?.state).toBe('saved');
    expect(fetchMock.mock.calls[0][0]).toContain(`/accounts/${'a'.repeat(32)}/ai/run/`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-cloudflare-token');
  });
  it('preserves input MIME and refuses references belonging to another owner',async()=>{
    db.prepare("INSERT INTO account_uploads (id,user_id,object_key,mime_type,expected_bytes,state,created_at,expires_at) VALUES ('ref','owner','accounts/owner/inputs/ref','image/jpeg',3,'ready',1,?)").run(Date.now()+60000);
    await writeOutput(env,'accounts/owner/inputs/ref',new Uint8Array([1,2,3]),'image/jpeg');
    const job=await acceptJob(env,'owner','gemini-reference-token',{...request,inputMode:'image',referenceIds:['ref']});
    expect(await inlineReferences(env,job)).toEqual([{data:'AQID',mimeType:'image/jpeg'}]);
    await expect(inlineReferences(env,{...job,user_id:'someone-else'})).rejects.toThrow();
  });
  it('checks aggregate inline input size before creating a paid job',async()=>{
    db.prepare("INSERT INTO account_uploads (id,user_id,object_key,mime_type,expected_bytes,state,created_at,expires_at) VALUES ('ref','owner','accounts/owner/inputs/ref','image/jpeg',12000001,'ready',1,?)").run(Date.now()+60000);
    await expect(acceptJob(env,'owner','gemini-large-input',{...request,inputMode:'image',referenceIds:['ref']})).rejects.toThrow(/12 MB/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_jobs').get()?.n).toBe(0);
  });
  it('rejects unsupported settings and aborts malformed base64 staging',async()=>{
    expect(()=>validateRequest(env,{...request,values:{imageSize:'8K'}})).toThrow();
    const job=await acceptJob(env,'owner','gemini-bad-output',request);
    await expect(stageImage(env,job,'not base64!!','image/png')).rejects.toThrow();
    expect(await env.ASSETS!.head(`accounts/owner/jobs/${job.id}/0`)).toBeNull();
    expect(adapterFor(env,'gemini').recover).toBeDefined();
  });
});
