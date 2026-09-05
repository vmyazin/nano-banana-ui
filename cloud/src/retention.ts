import { finishJob, type JobRow } from './jobs';
import type { Env } from './security';

export const OVERFLOW_TTL_MS = 86_400_000;
/** Other jobs' reservations stay protected while this job consumes its own. */
export const AVAILABLE_CAPACITY = `SELECT 1 FROM account_storage s JOIN account_jobs j ON j.user_id=s.user_id
  WHERE j.id=? AND j.deleted=0 AND j.state NOT IN ('failed','cancelled') AND s.used_bytes+s.reserved_bytes-CASE WHEN j.reservation_accounted=1 THEN j.reservation_bytes ELSE 0 END+?<=s.limit_bytes`;

export async function promoteTemporaryAsset(env:Env,job:JobRow,id:string,bytes:number) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE account_asset_retention SET promoting=1 WHERE asset_id=? AND expires_at>? AND EXISTS (${AVAILABLE_CAPACITY}) AND EXISTS (SELECT 1 FROM account_assets WHERE id=? AND deleted=0)`)
      .bind(id,Date.now(),job.id,bytes,id),
    env.DB.prepare('UPDATE account_storage SET used_bytes=used_bytes+? WHERE user_id=? AND EXISTS (SELECT 1 FROM account_asset_retention WHERE asset_id=? AND promoting=1)').bind(bytes,job.user_id,id),
    env.DB.prepare('DELETE FROM account_asset_retention WHERE asset_id=? AND promoting=1').bind(id),
  ]);
}

export async function cleanupRetainedAssets(env:Env) {
  if(!env.ASSETS)return;
  const expired=await env.DB.prepare('SELECT a.id,a.job_id FROM account_assets a JOIN account_asset_retention r ON r.asset_id=a.id WHERE r.expires_at<=? AND a.deleted=0 LIMIT 100').bind(Date.now()).all<{id:string;job_id:string|null}>();
  for(const asset of expired.results){
    // Condition stays inside the transaction so a concurrent promotion wins
    // safely rather than being deleted based on a stale expiry scan.
    const expiredAt=Date.now();
    const marked=await env.DB.prepare('UPDATE account_assets SET deleted=1 WHERE id=? AND deleted=0 AND EXISTS (SELECT 1 FROM account_asset_retention WHERE asset_id=? AND expires_at<=?)').bind(asset.id,asset.id,expiredAt).run();
    if(marked.meta.changes&&asset.job_id)await finishJob(env,asset.job_id,'failed','storage_expired');
  }
  // Retry object deletion using tombstones; a transient R2 failure retains the
  // metadata needed to retry on the next scheduled pass.
  const tombstones=await env.DB.prepare('SELECT a.id,a.object_key FROM account_assets a JOIN account_asset_retention r ON r.asset_id=a.id WHERE a.deleted=1 LIMIT 100').all<{id:string;object_key:string}>();
  for(const row of tombstones.results){
    try{
      await env.ASSETS.delete(row.object_key);
      await env.DB.prepare('DELETE FROM account_asset_retention WHERE asset_id=?').bind(row.id).run();
    }catch{/* Keep this retention tombstone and continue with the remaining rows. */}
  }
}
