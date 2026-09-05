import { mediaAccess } from './media';
export { byteRange } from './range';
import { currentAccount } from './sessions';
import { json, type Env } from './security';
import { acceptJob, AccountError, cancelQueuedJob, dismissAttentionJob, dispatchJob, getJob, jobView, type JobRow } from './jobs';
import { adapterFor, validateRequest } from './providers';
import { assetView, deleteAsset, getAsset } from './assets';

export async function jobRoutes(request:Request,env:Env):Promise<Response|null>{
  const path=new URL(request.url).pathname;
  if(!/^\/api\/account\/(jobs|assets|storage)(\/|$)/.test(path))return null;
  const account=await currentAccount(request,env);
  if(!account)return json({error:'Sign in to access your cloud workspace.'},401);
  try{
    if(path==='/api/account/storage'&&request.method==='GET'){
      const storage=await env.DB.prepare('SELECT limit_bytes AS limitBytes, used_bytes AS usedBytes, reserved_bytes AS reservedBytes, active_jobs AS activeJobs FROM account_storage WHERE user_id = ?').bind(account.id).first();
      return json({storage:storage||{limitBytes:1_000_000_000,usedBytes:0,reservedBytes:0,activeJobs:0}});
    }
    if(path==='/api/account/jobs'&&request.method==='POST'){
      const text=await request.text();if(text.length>40000)return json({error:'Request is too large.'},413);
      const body=JSON.parse(text);
      if(!body||typeof body!=='object')return json({error:'Invalid request.'},400);
      const settings=validateRequest(env,body.request);
      const job=await acceptJob(env,account.id,body.token,settings);
      // Acceptance is durable even when dispatch fails. Scheduled reconciliation repairs it.
      if(!job.dispatched)await dispatchJob(env,job).catch(()=>{});
      return json({job:jobView(job)},202);
    }
    if(path==='/api/account/jobs'&&request.method==='GET'){
      const rows=await env.DB.prepare('SELECT * FROM account_jobs WHERE user_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 100').bind(account.id).all<JobRow>();
      return json({accountId:account.id,jobs:rows.results.map(jobView)});
    }
    const jobMatch=path.match(/^\/api\/account\/jobs\/([a-zA-Z0-9-]+)(\/(?:resume|cancel|dismiss))?$/);
    if(jobMatch){
      const job=await getJob(env,jobMatch[1],account.id);if(!job)return json({error:'Job not found.'},404);
      if(request.method==='GET'&&!jobMatch[2])return json({job:jobView(job)});
      if(request.method==='POST'&&jobMatch[2]==='/cancel'){
        const cancelled=await cancelQueuedJob(env,job.id,account.id);
        if(!cancelled)return json({error:'Job not found.'},404);
        return json({job:jobView(cancelled)});
      }
      if(request.method==='POST'&&jobMatch[2]==='/dismiss'){
        const dismissed=await dismissAttentionJob(env,job.id,account.id);
        if(!dismissed)return json({error:'Job not found.'},404);
        return json({job:jobView(dismissed)});
      }
      if(request.method==='POST'&&jobMatch[2]==='/resume'){
        if(job.state==='needs_attention'&&!job.provider_task&&!job.result_json){
          const result=await adapterFor(env,job.provider).recover?.(env,job);
          if(result){
            job.result_json=JSON.stringify(result);
            await env.DB.prepare("UPDATE account_jobs SET result_json=? WHERE id=? AND state='needs_attention' AND deleted=0").bind(job.result_json,job.id).run();
          }
        }
        if(job.state!=='needs_attention'||(!job.provider_task&&!job.result_json))return json({error:'This submission needs provider reconciliation before it can be resumed.'},409);
        const claimed=await env.DB.prepare("UPDATE account_jobs SET state = ?, workflow_attempt = workflow_attempt + 1, dispatched = 0, error_code = NULL WHERE id = ? AND state = 'needs_attention'").bind(job.result_json?'saving':'running',job.id).run();
        if(!claimed.meta.changes)return json({error:'This generation is no longer waiting for a tracking decision.',code:'tracking_state_changed'},409);
        const resumed=await getJob(env,job.id,account.id);
        if(resumed)await dispatchJob(env,resumed).catch(()=>{});
        return json({job:jobView(resumed!)},202);
      }
    }
    if(path==='/api/account/assets'&&request.method==='GET'){
      const cursor=new URL(request.url).searchParams.get('cursor');
      const match=cursor?.match(/^(\d+):([a-zA-Z0-9-]+)$/);
      if(cursor&&!match)return json({error:'Invalid page cursor.'},400);
      const before=match?Number(match[1]):Number.MAX_SAFE_INTEGER;
      const beforeId=match?match[2]:'~';
      const rows=await env.DB.prepare('SELECT a.*,r.expires_at FROM account_assets a LEFT JOIN account_asset_retention r ON r.asset_id=a.id WHERE a.user_id = ? AND a.deleted = 0 AND (r.expires_at IS NULL OR r.expires_at>?) AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?)) ORDER BY a.created_at DESC, a.id DESC LIMIT 51').bind(account.id,Date.now(),before,before,beforeId).all<Parameters<typeof assetView>[0]>();
      const page=rows.results.slice(0,50), last=page.at(-1);
      return json({accountId:account.id,assets:page.map(assetView),nextCursor:rows.results.length>50&&last?`${last.created_at}:${last.id}`:null});
    }
    const assetMatch=path.match(/^\/api\/account\/assets\/([a-zA-Z0-9-]+)(\/(?:content|access))?$/);
    if(assetMatch){
      const asset=await getAsset(env,assetMatch[1],account.id);if(!asset)return json({error:'Asset not found.'},404);
      if(request.method==='DELETE'&&!assetMatch[2]){await deleteAsset(env,asset.id,account.id);return json({ok:true});}
      if(request.method==='POST'&&assetMatch[2]==='/access')return json(await mediaAccess(env,account.id,asset.id,'download'));
      if(request.method==='GET'&&assetMatch[2]==='/content'){
        const access=await mediaAccess(env,account.id,asset.id,'download');
        return new Response(null,{status:302,headers:{Location:access.url,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
      }
    }
    return json({error:'Not found.'},404);
  }catch(error){if(error instanceof AccountError)return json({error:error.message,code:error.code},error.status);if(error instanceof SyntaxError)return json({error:'Invalid request.'},400);throw error;}
}
