import type { CloudJobRequest } from '../../lib/account/contracts';
import { AccountError, type JobRow } from './jobs';
import { isLocal, type Env } from './security';
import { writeOutput, type ProviderResult } from './assets';

export interface ProviderHandle { id: string; protocol?: string }
export interface GenerationAdapter {
  submit(env: Env, job: JobRow): Promise<{handle?:ProviderHandle; result?:ProviderResult}>;
  poll(env: Env, job: JobRow, handle: ProviderHandle): Promise<{state:'running'|'failed'|'success'; result?:ProviderResult}>;
}
// Production providers are added only after contract verification. A local fake
// exercises the complete durable flow without calling or charging any vendor.
const localAdapter:GenerationAdapter={
  async submit(){return {handle:{id:crypto.randomUUID()}};},
  async poll(env,job){
    if(!isLocal(env))throw new Error('Local adapter unavailable');
    const key=`accounts/${job.user_id}/jobs/${job.id}/0`;
    const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    if(!await env.ASSETS!.head(key))await writeOutput(env,key,png,'image/png');
    return {state:'success',result:{sources:[{objectKey:key,mimeType:'image/png'}]}};
  },
};
export function adapterFor(env:Env,provider:CloudJobRequest['provider']):GenerationAdapter {
  if(provider==='local-test'&&isLocal(env))return localAdapter;
  throw new AccountError('Background generation for this provider is not enabled yet. Continue with the existing browser workflow.',409,'provider_unavailable');
}
export function validateRequest(env:Env,value:unknown):CloudJobRequest {
  if(!value||typeof value!=='object')throw new AccountError('Invalid generation request.',400,'invalid_request');
  const r=value as Partial<CloudJobRequest>;
  if(typeof r.prompt!=='string'||!r.prompt.trim()||r.prompt.length>20000||typeof r.modelId!=='string'||r.modelId.length>256||!['image','video'].includes(r.mediaType||'')||!['text','image','frames','reference'].includes(r.inputMode||'')||!Array.isArray(r.referenceIds)||r.referenceIds.length>16||r.referenceIds.some(id=>typeof id!=='string'||id.length>128)||!r.values||typeof r.values!=='object'||Array.isArray(r.values)||Object.keys(r.values).length>64||Object.values(r.values).some(v=>!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>2048))throw new AccountError('Invalid generation settings.',400,'invalid_request');
  adapterFor(env,r.provider!);
  if(r.referenceIds.length)throw new AccountError('Cloud reference uploads are not enabled yet.',409,'references_unavailable');
  return {provider:r.provider!,modelId:r.modelId,mediaType:r.mediaType as 'image'|'video',inputMode:r.inputMode as CloudJobRequest['inputMode'],prompt:r.prompt.trim(),values:r.values,referenceIds:r.referenceIds};
}
