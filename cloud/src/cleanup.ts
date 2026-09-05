import type { Env } from './security';

export async function deleteQueuedObject(env:Env,key:string) {
  if(!env.ASSETS)return;
  try{
    await env.ASSETS.delete(key);
    await env.DB.prepare('DELETE FROM account_object_deletions WHERE object_key=?').bind(key).run();
  }catch{/* The durable queue retries next pass. Reads are already revoked. */}
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
