import { falAdapter, kieAdapter, validateQueuedRequest } from './provider-adapters/queued';
import { aggregatorAdapter, validateAggregatorRequest } from './provider-adapters/aggregators';
import { synchronousAdapter, validateSynchronousRequest } from './provider-adapters/synchronous';
import type { CloudJobRequest } from '../../lib/account/contracts';
import { AccountError, type JobRow } from './jobs';
import { isLocal, type Env } from './security';
import { writeOutput, type ProviderResult } from './assets';

export interface ProviderHandle { id: string; protocol?: string; notBefore?:number }
export interface GenerationAdapter {
  recover?(env: Env, job: JobRow): Promise<ProviderResult | undefined>;
  submit(env: Env, job: JobRow): Promise<{handle?:ProviderHandle; result?:ProviderResult}>;
  poll(env: Env, job: JobRow, handle: ProviderHandle): Promise<{state:'running'|'failed'|'success'; result?:ProviderResult}>;
}
// Production providers are added only after contract verification. A local fake
// exercises the complete durable flow without calling or charging any vendor.
const localAdapter:GenerationAdapter={
  async submit(env){return {handle:{id:crypto.randomUUID(),...(env.DEV_FAKE_GENERATION==='1'?{notBefore:Date.now()+10000}:{})}};},
  async poll(env,job,handle){
    if(handle.notBefore&&Date.now()<handle.notBefore)return {state:'running'};
    if(!isLocal(env))throw new Error('Local adapter unavailable');
    const key=`accounts/${job.user_id}/jobs/${job.id}/0`;
    const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    if(!await env.ASSETS!.head(key))await writeOutput(env,key,png,'image/png');
    return {state:'success',result:{sources:[{objectKey:key,mimeType:'image/png'}]}};
  },
};
/** Every provider that can run a background job. `local-test` is excluded on
 *  purpose: it is the local fixture and is reached through its own branch below.
 *  One list, so a provider added to the union cannot be silently missing from the
 *  deployed configuration — `tests/providers-config.test.ts` compares the two. */
export const CLOUD_PROVIDERS = ['fal','kie','runware','atlas','comet','gemini','cloudflare','pollinations'] as const;
type EnabledProvider = typeof CLOUD_PROVIDERS[number];
export function enabledProviders(env:Env):CloudJobRequest['provider'][] {
  if(isLocal(env)&&env.DEV_FAKE_GENERATION==='1')return [...CLOUD_PROVIDERS];
  return (env.CLOUD_GENERATION_PROVIDERS||'').split(',').map(p=>p.trim()).filter((p):p is EnabledProvider=>(CLOUD_PROVIDERS as readonly string[]).includes(p));
}
export function adapterFor(env:Env,provider:CloudJobRequest['provider']):GenerationAdapter {
  if(provider==='local-test'&&isLocal(env))return localAdapter;
  if(enabledProviders(env).includes(provider)){
    if(isLocal(env)&&env.DEV_FAKE_GENERATION==='1')return localAdapter;
    if(provider==='fal')return falAdapter;
    if(provider==='kie')return kieAdapter;
    if(provider==='runware'||provider==='atlas'||provider==='comet')return aggregatorAdapter;
    if(provider==='gemini'||provider==='cloudflare'||provider==='pollinations')return synchronousAdapter;
  }
  throw new AccountError('Background generation for this provider is not enabled yet. Continue with the existing browser workflow.',409,'provider_unavailable');
}
export function validateRequest(env:Env,value:unknown):CloudJobRequest {
  if(!value||typeof value!=='object')throw new AccountError('Invalid generation request.',400,'invalid_request');
  const r=value as Partial<CloudJobRequest>;
  if(typeof r.prompt!=='string'||!r.prompt.trim()||r.prompt.length>20000||typeof r.modelId!=='string'||r.modelId.length>256||!['image','video'].includes(r.mediaType||'')||!['text','image','frames','reference'].includes(r.inputMode||'')||!Array.isArray(r.referenceIds)||r.referenceIds.length>16||r.referenceIds.some(id=>typeof id!=='string'||id.length>128)||!r.values||typeof r.values!=='object'||Array.isArray(r.values)||Object.keys(r.values).length>64||Object.values(r.values).some(v=>!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>2048))throw new AccountError('Invalid generation settings.',400,'invalid_request');
  if(isLocal(env)&&env.DEV_FAKE_GENERATION==='1'&&r.mediaType!=='image')throw new AccountError('The local fixture currently supports image generation only.',409,'local_fixture_mode');
  adapterFor(env,r.provider!);
  if(r.provider==='fal'||r.provider==='kie')validateQueuedRequest(r as CloudJobRequest);
  if(r.provider==='runware'||r.provider==='atlas'||r.provider==='comet')validateAggregatorRequest(r as CloudJobRequest);
  if(r.provider==='gemini'||r.provider==='cloudflare'||r.provider==='pollinations')validateSynchronousRequest(r as CloudJobRequest);
  return {provider:r.provider!,modelId:r.modelId,mediaType:r.mediaType as 'image'|'video',inputMode:r.inputMode as CloudJobRequest['inputMode'],prompt:r.prompt.trim(),values:r.values,referenceIds:r.referenceIds};
}
