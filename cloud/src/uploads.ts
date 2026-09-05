import { AccountError, type JobRow } from './jobs';
import { writeOutput } from './assets';
import { mediaAccess, mediaCors, mediaOrigin, mediaToken, readMedia } from './media';
import { currentAccount } from './sessions';
import { json, type Env } from './security';
export const MAX_INPUT_BYTES=20_000_000;
export const MAX_TEMP_BYTES=256_000_000;
export const MAX_GLOBAL_TEMP_BYTES=10_000_000_000;
const INPUT_TTL=86_400_000;
interface Upload {id:string;user_id:string;object_key:string;mime_type:string;expected_bytes:number;state:string;expires_at:number}
export async function reserveUpload(env:Env,owner:string,bytes:number,mime:string) {
  mediaOrigin(env);
  if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>MAX_INPUT_BYTES||!/^image\/(png|jpeg|webp|avif)$/.test(mime))throw new AccountError('Use a PNG, JPEG, WebP or AVIF image up to 20 MB.',400,'invalid_upload');
  const id=crypto.randomUUID(),key=`accounts/${owner}/inputs/${id}`,now=Date.now();
  const inserted=await env.DB.prepare(`INSERT INTO account_uploads (id,user_id,object_key,mime_type,expected_bytes,created_at,expires_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(expected_bytes),0) FROM account_uploads WHERE user_id=? AND state!='deleted')+?<=?
    AND (SELECT COUNT(*) FROM account_uploads WHERE user_id=? AND state!='deleted')<32
    AND (SELECT COALESCE(SUM(expected_bytes),0) FROM account_uploads WHERE state!='deleted')+?<=?`)
    .bind(id,owner,key,mime,bytes,now,now+INPUT_TTL,owner,bytes,MAX_TEMP_BYTES,owner,bytes,MAX_GLOBAL_TEMP_BYTES).run();
  if(!inserted.meta.changes)throw new AccountError('Temporary input storage is full. Remove unused uploads or wait for cleanup.',409,'input_capacity');
  return {id,...await mediaAccess(env,owner,id,'upload')};
}
export async function inputUrls(env:Env,job:JobRow):Promise<string[]> {
  const request=JSON.parse(job.request_json) as {referenceIds:string[]};
  const urls:string[]=[];
  for(const id of request.referenceIds){
    const row=await env.DB.prepare("SELECT u.id FROM account_uploads u JOIN account_job_inputs i ON i.upload_id=u.id WHERE u.id=? AND u.user_id=? AND u.state='ready' AND i.job_id=?").bind(id,job.user_id,job.id).first();
    if(!row)throw new Error('Reference unavailable');
    urls.push((await mediaAccess(env,job.user_id,id,'input',job.id)).url);
  }
  return urls;
}
export async function publicMedia(request:Request,env:Env):Promise<Response|null> {
  const path=new URL(request.url).pathname;if(!path.startsWith('/media/'))return null;
  const respond=(response:Response)=>mediaCors(response,env);
  if(request.method==='OPTIONS')return respond(new Response(null,{status:204}));
  const token=await mediaToken(env,path);if(!token)return respond(json({error:'File access expired or is invalid.'},404));
  if(token.purpose!=='upload'){
    if(!['GET','HEAD'].includes(request.method))return respond(json({error:'Method not allowed.'},405));
    return respond(await readMedia(request,env,token));
  }
  if(request.method!=='PUT')return respond(json({error:'Method not allowed.'},405));
  if(request.headers.get('origin')!==env.APP_ORIGIN)return respond(json({error:'Request origin is not allowed.'},403));
  const upload=await env.DB.prepare("SELECT * FROM account_uploads WHERE id=? AND user_id=? AND state!='deleted' AND expires_at>?").bind(token.resource_id,token.user_id,Date.now()).first<Upload>();
  if(!upload)return respond(json({error:'Upload expired.'},404));
  if(request.headers.get('content-type')?.split(';')[0]!==upload.mime_type || !request.body)return respond(json({error:'Upload type does not match.'},400));
  if(upload.state==='ready')return respond(json({id:upload.id,state:'ready'}));
  const claim=await env.DB.prepare("UPDATE account_uploads SET state='uploading' WHERE id=? AND state='pending'").bind(upload.id).run();
  const existing=await env.ASSETS?.head(upload.object_key);
  if(!claim.meta.changes&&!existing)return respond(json({error:'Upload is still in progress. Check its status before retrying.'},409));
  try{
    const object=existing||await writeOutput(env,upload.object_key,request.body,upload.mime_type,upload.expected_bytes);
    if(object.size!==upload.expected_bytes)throw new AccountError('Uploaded size does not match.',400,'upload_size');
    const updated=await env.DB.prepare("UPDATE account_uploads SET state='ready' WHERE id=? AND state IN ('pending','uploading','ready')").bind(upload.id).run();
    if(!updated.meta.changes){await env.ASSETS?.delete(upload.object_key);return respond(json({error:'Upload was removed.'},409));}
    return respond(json({id:upload.id,state:'ready'}));
  }catch{
    await env.ASSETS?.delete(upload.object_key);
    await env.DB.prepare("UPDATE account_uploads SET state='pending' WHERE id=? AND state='uploading'").bind(upload.id).run();
    return respond(json({error:'Upload was interrupted or its size did not match. Retry this upload.'},400));
  }
}
export async function uploadRoutes(request:Request,env:Env):Promise<Response|null> {
  const path=new URL(request.url).pathname;if(!/^\/api\/account\/uploads(\/|$)/.test(path))return null;
  const account=await currentAccount(request,env);if(!account)return json({error:'Sign in to upload references.'},401);
  if(path==='/api/account/uploads'&&request.method==='POST'){
    const text=await request.text();if(text.length>2048)return json({error:'Request is too large.'},413);
    try{const body=JSON.parse(text);return json(await reserveUpload(env,account.id,body.bytes,body.mimeType),201);}
    catch(error){if(error instanceof AccountError)return json({error:error.message,code:error.code},error.status);if(error instanceof SyntaxError)return json({error:'Invalid request.'},400);throw error;}
  }
  const match=path.match(/^\/api\/account\/uploads\/([a-zA-Z0-9-]+)$/);
  if(match){
    const upload=await env.DB.prepare('SELECT * FROM account_uploads WHERE id=? AND user_id=?').bind(match[1],account.id).first<Upload>();
    if(!upload||upload.state==='deleted')return json({error:'Upload not found.'},404);
    if(request.method==='GET')return json({id:upload.id,state:upload.state,expiresAt:upload.expires_at});
    if(request.method==='DELETE'){
      const deleted=await env.DB.prepare(`UPDATE account_uploads SET state='deleted' WHERE id=? AND NOT EXISTS
        (SELECT 1 FROM account_job_inputs i JOIN account_jobs j ON j.id=i.job_id WHERE i.upload_id=? AND j.deleted=0 AND j.state NOT IN ('saved','failed','cancelled'))`).bind(upload.id,upload.id).run();
      if(!deleted.meta.changes)return json({error:'An active job still needs this reference.'},409);
      await env.ASSETS?.delete(upload.object_key).catch(()=>{});return json({ok:true});
    }
  }
  return json({error:'Not found.'},404);
}
export async function cleanupUploads(env:Env) {
  if(!env.ASSETS)return; // Missing bindings must not discard the deletion journal.
  // Tombstone first: new intake cannot attach a file while cleanup deletes it.
  await env.DB.prepare(`UPDATE account_uploads SET state='deleted' WHERE expires_at<? AND state!='deleted' AND NOT EXISTS
    (SELECT 1 FROM account_job_inputs i JOIN account_jobs j ON j.id=i.job_id WHERE i.upload_id=account_uploads.id AND j.deleted=0 AND j.state NOT IN ('saved','failed','cancelled'))
    `).bind(Date.now()).run();
  // Retain tombstones until deletion succeeds, so storage failures can retry.
  const tombstones=await env.DB.prepare("SELECT id,object_key FROM account_uploads WHERE state='deleted' LIMIT 100").all<{id:string;object_key:string}>();
  for(const row of tombstones.results){
    try{
      await env.ASSETS?.delete(row.object_key);
      await env.DB.prepare("DELETE FROM account_uploads WHERE id=? AND state='deleted'").bind(row.id).run();
    }catch{/* Keep this tombstone and continue so one R2 failure cannot starve cleanup. */}
  }
  await env.DB.prepare('DELETE FROM account_media_tokens WHERE expires_at<=?').bind(Date.now()).run();
}
