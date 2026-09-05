import type { CloudAsset, CloudJobRequest } from '../../lib/account/contracts';
import { AccountError, type JobRow } from './jobs';
import type { Env } from './security';

export const MAX_OUTPUT_BYTES = 1_000_000_000;
export const MAX_JOB_OUTPUTS = 8;
interface AssetRow { id: string; user_id: string; job_id: string | null; object_key: string; kind: 'image'|'video'; mime_type: string; bytes: number; metadata_json: string; created_at: number; deleted: number }
export interface ResultSource { url?: string; objectKey?: string; mimeType?: string }
export interface ProviderResult { sources: ResultSource[]; cost?: number; usage?: { promptTokens: number; outputTokens: number } }
export function assetView(row: AssetRow): CloudAsset { return { id:row.id, jobId:row.job_id, kind:row.kind, mimeType:row.mime_type, bytes:row.bytes, createdAt:row.created_at, metadata:JSON.parse(row.metadata_json) }; }
export async function getAsset(env:Env,id:string,owner:string) { return env.DB.prepare('SELECT * FROM account_assets WHERE id = ? AND user_id = ? AND deleted = 0').bind(id,owner).first<AssetRow>(); }

/** Host allowlist prevents a provider result from turning the capture worker into a URL proxy. */
export function safeResultUrl(value:string): URL {
  const url=new URL(value);
  const domains=['fal.media','fal.ai','kie.ai','kieai.redpandaai.co','tempfile.ai','tempfile.redpandaai.co','redpandaai.co','runware.ai','atlascloud.ai','cometapi.com','filesystem.site'];
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !domains.some(d=>url.hostname===d||url.hostname.endsWith(`.${d}`))) throw new AccountError('Provider returned an unsupported result location.',502,'result_location');
  return url;
}
async function fetchOutput(url:string):Promise<Response> {
  let target=safeResultUrl(url);
  for(let i=0;i<4;i++) {
    const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(120_000)});
    if([301,302,303,307,308].includes(response.status)) { const next=response.headers.get('location'); await response.body?.cancel(); if(!next)break; target=safeResultUrl(new URL(next,target).href); continue; }
    if(!response.ok || !response.body)throw new AccountError('Could not fetch the generated file.',502,'save_failed');
    return response;
  }
  throw new AccountError('Provider returned too many redirects.',502,'result_location');
}
export async function writeOutput(env:Env,key:string,body:ReadableStream<Uint8Array>|Uint8Array,mimeType:string,maxBytes=MAX_OUTPUT_BYTES) {
  if(!env.ASSETS)throw new Error('Asset storage is unavailable');
  if(!/^(image\/(png|jpeg|webp|avif)|video\/(mp4|webm))$/.test(mimeType))throw new AccountError('Unsupported generated file type.',502,'result_type');
  let length=0;
  const input=body instanceof Uint8Array ? new ReadableStream<Uint8Array>({start(controller){controller.enqueue(body);controller.close();}}) : body;
  const bounded=input.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){length+=chunk.byteLength;if(length>maxBytes)throw new AccountError('Generated file exceeds the supported transfer limit.',502,'result_size');controller.enqueue(chunk);}}));
  // R2.put needs known length for a stream. Multipart keeps memory bounded and
  // leaves the object invisible until all parts have been uploaded.
  const upload=await env.ASSETS.createMultipartUpload(key,{httpMetadata:{contentType:mimeType}});
  const reader=bounded.getReader();
  const parts:R2UploadedPart[]=[];
  const partSize=8*1024*1024;
  let pending=new Uint8Array(partSize), used=0;
  try {
    while(true){
      const {value,done}=await reader.read();if(done)break;
      let offset=0;
      while(offset<value.length){const count=Math.min(partSize-used,value.length-offset);pending.set(value.subarray(offset,offset+count),used);used+=count;offset+=count;if(used===partSize){parts.push(await upload.uploadPart(parts.length+1,pending));pending=new Uint8Array(partSize);used=0;}}
    }
    if(length===0)throw new Error('Empty result');
    if(used)parts.push(await upload.uploadPart(parts.length+1,pending.slice(0,used)));
    return await upload.complete(parts);
  }catch(error){await reader.cancel().catch(()=>{});await upload.abort().catch(()=>{});throw error;}
}
export async function captureResult(env:Env,job:JobRow,result:ProviderResult) {
  if(!env.ASSETS)throw new Error('Asset storage is unavailable');
  if(result.sources.length===0||result.sources.length>MAX_JOB_OUTPUTS)throw new AccountError('Unsupported number of results.',502,'result_count');
  const request=JSON.parse(job.request_json) as CloudJobRequest;
  for(let i=0;i<result.sources.length;i++){
    const id=`${job.id}-${i}`, source=result.sources[i], key=`accounts/${job.user_id}/jobs/${job.id}/${i}`;
    const existing=await env.DB.prepare('SELECT id FROM account_assets WHERE id = ?').bind(id).first();
    if(existing)continue; // Includes tombstones: never resurrect a deleted asset.
    let object=await env.ASSETS.head(key);
    if(!object){
      if(source.objectKey){
        if(source.objectKey!==key)throw new Error('Invalid staged result');
        throw new Error('Staged result is unavailable');
      }
      if(!source.url)throw new Error('Missing result source');
      const response=await fetchOutput(source.url);
      const mime=(response.headers.get('content-type')||source.mimeType||'').split(';')[0].trim().toLowerCase();
      if(!mime.startsWith(`${request.mediaType}/`)){await response.body?.cancel();throw new Error('Unexpected result type');}
      object=await writeOutput(env,key,response.body!,mime);
    }
    if(object.size<=0)throw new Error('Empty stored result');
    // The marker is the insert itself. Replays cannot count the same object twice.
    // If deletion raced the transfer, this inserts nothing; cleanup removes the orphan.
    await env.DB.batch([
      env.DB.prepare(`UPDATE account_storage SET used_bytes = used_bytes + ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM account_assets WHERE id = ?) AND EXISTS (SELECT 1 FROM account_jobs WHERE id = ? AND deleted = 0)`).bind(object.size,job.user_id,id,job.id),
      env.DB.prepare(`INSERT OR IGNORE INTO account_assets (id,user_id,job_id,object_key,kind,mime_type,bytes,metadata_json,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM account_jobs WHERE id = ? AND deleted = 0)`)
        .bind(id,job.user_id,job.id,key,request.mediaType,object.httpMetadata?.contentType||source.mimeType||'application/octet-stream',object.size,job.request_json,Date.now(),job.id),
    ]);
  }
}
export async function deleteAsset(env:Env,id:string,owner:string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE account_storage SET used_bytes = used_bytes - COALESCE((SELECT bytes FROM account_assets WHERE id = ? AND user_id = ? AND deleted = 0),0) WHERE user_id = ?').bind(id,owner,owner),
    env.DB.prepare('UPDATE account_assets SET deleted = 1 WHERE id = ? AND user_id = ?').bind(id,owner),
  ]);
  const row=await env.DB.prepare('SELECT object_key FROM account_assets WHERE id = ? AND user_id = ? AND deleted = 1').bind(id,owner).first<{object_key:string}>();
  if(row && env.ASSETS)await env.ASSETS.delete(row.object_key);
}
