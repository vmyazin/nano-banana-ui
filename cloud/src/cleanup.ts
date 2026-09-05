import type { Env } from './security';

export const TERMINAL_JOB_OBJECT_GRACE_MS = 86_400_000;
export const TERMINAL_JOB_OBJECT_RESCAN_MS = 600_000;
export const TERMINAL_JOB_OBJECT_RESCAN_WINDOW_MS = 3_600_000;
// Mirrors assets.MAX_JOB_OUTPUTS. Importing it here would create the runtime
// assets -> cleanup -> assets cycle at the deletion chokepoint.
export const TERMINAL_JOB_OBJECTS_PER_JOB = 8;
const TERMINAL_JOB_SEED_LIMIT = 100;
// Eight keys per job leave room in cleanupObjects' 100-object batch.
const TERMINAL_JOB_SCAN_LIMIT = 12;

export async function deleteQueuedObject(env:Env,key:string) {
  if(!env.ASSETS)return;
  try{
    await env.ASSETS.delete(key);
    await env.DB.prepare('DELETE FROM account_object_deletions WHERE object_key=?').bind(key).run();
  }catch{/* The durable queue retries next pass. Reads are already revoked. */}
}

interface TerminalJobCleanup {
  job_id:string;
  user_id:string;
  next_check_at:number;
  cleanup_until:number;
}

/**
 * Provider staging and final asset keys share this bounded layout. Terminal
 * jobs are journaled once, then rescanned after a 24-hour recovery grace so a
 * late R2 completion cannot become a permanent unmetered object.
 */
export async function cleanupTerminalJobObjects(env:Env,now=Date.now()) {
  if(!env.ASSETS)return;
  await env.DB.prepare(`INSERT OR IGNORE INTO account_job_object_cleanup (job_id,next_check_at,cleanup_until)
    SELECT id,updated_at+?,updated_at+?+? FROM account_jobs j
    WHERE state IN ('saved','failed','cancelled')
      AND NOT EXISTS (SELECT 1 FROM account_job_object_cleanup c WHERE c.job_id=j.id)
    ORDER BY updated_at ASC LIMIT ${TERMINAL_JOB_SEED_LIMIT}`)
    .bind(TERMINAL_JOB_OBJECT_GRACE_MS,TERMINAL_JOB_OBJECT_GRACE_MS,TERMINAL_JOB_OBJECT_RESCAN_WINDOW_MS).run();
  const due=await env.DB.prepare(`SELECT c.job_id,j.user_id,c.next_check_at,c.cleanup_until
    FROM account_job_object_cleanup c JOIN account_jobs j ON j.id=c.job_id
    WHERE c.next_check_at IS NOT NULL AND c.next_check_at<=?
      AND j.state IN ('saved','failed','cancelled')
    ORDER BY c.next_check_at,c.job_id LIMIT ${TERMINAL_JOB_SCAN_LIMIT}`).bind(now).all<TerminalJobCleanup>();
  for(const job of due.results){
    const next=now>=job.cleanup_until?null:Math.min(job.cleanup_until,now+TERMINAL_JOB_OBJECT_RESCAN_MS);
    const statements=[];
    for(let index=0;index<TERMINAL_JOB_OBJECTS_PER_JOB;index++){
      const key=`accounts/${job.user_id}/jobs/${job.job_id}/${index}`;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO account_object_deletions (object_key,created_at)
        SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM account_assets WHERE object_key=? AND deleted=0)`)
        .bind(key,now,key));
    }
    statements.push(env.DB.prepare('UPDATE account_job_object_cleanup SET next_check_at=? WHERE job_id=?').bind(next,job.job_id));
    await env.DB.batch(statements);
  }
}

export async function cleanupObjects(env:Env) {
  if(!env.ASSETS)return;
  const objects=await env.DB.prepare('SELECT object_key FROM account_object_deletions ORDER BY created_at LIMIT 100').all<{object_key:string}>();
  for(const object of objects.results)await deleteQueuedObject(env,object.object_key);
  const accounts=await env.DB.prepare('SELECT * FROM account_deletions WHERE next_check_at<=? ORDER BY next_check_at LIMIT 20').bind(Date.now()).all<{user_id:string;created_at:number;cursor:string|null}>();
  for(const account of accounts.results){
    try{
      const page=await env.ASSETS.list({prefix:`accounts/${account.user_id}/`,limit:1000,...(account.cursor?{cursor:account.cursor}:{})});
      if(page.objects.length)await env.ASSETS.delete(page.objects.map(object=>object.key));
      if(!page.truncated&&!page.objects.length&&Date.now()-account.created_at>=86_400_000){
        await env.DB.prepare('DELETE FROM account_deletions WHERE user_id=?').bind(account.user_id).run();
      }else{
        // Rescan after paginated deletion and through a grace period to catch
        // writes already in flight when the account metadata disappeared.
        await env.DB.prepare('UPDATE account_deletions SET cursor=?,next_check_at=? WHERE user_id=?').bind(page.truncated?page.cursor:null,Date.now()+(page.truncated?0:600_000),account.user_id).run();
      }
    }catch{
      await env.DB.prepare('UPDATE account_deletions SET next_check_at=? WHERE user_id=?').bind(Date.now()+600_000,account.user_id).run();
    }
  }
}
