import type { CloudJobRequest, CloudJobState, CloudJobView } from '../../lib/account/contracts';
import { hash, type Env } from './security';
import type { Provider } from './vault';
export const FREE_BYTES = 1_000_000_000;
export const MAX_ACTIVE_JOBS = 3;
export const IMAGE_RESERVATION = 64_000_000;
export const VIDEO_RESERVATION = 256_000_000;
export interface JobRow {
  id: string; user_id: string; provider: CloudJobRequest['provider']; request_json: string; state: CloudJobState;
  connection_id: string | null; connection_revision: number | null; provider_task: string | null;
  result_json: string | null; error_code: string | null; reservation_bytes: number; reservation_accounted: number;
  request_digest: string; workflow_attempt: number; dispatched: number; deleted: number; created_at: number; updated_at: number;
}
export class AccountError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function jobView(row: JobRow): CloudJobView {
  return { id: row.id, provider: row.provider, state: row.state, errorCode: row.error_code, request: JSON.parse(row.request_json), createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function getJob(env: Env, id: string, owner?: string) {
  return env.DB.prepare(`SELECT * FROM account_jobs WHERE id = ? AND deleted = 0${owner ? ' AND user_id = ?' : ''}`).bind(...(owner ? [id, owner] : [id])).first<JobRow>();
}
export async function acceptJob(env: Env, owner: string, token: string, request: CloudJobRequest): Promise<JobRow> {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) throw new AccountError('Invalid submission token.', 400, 'invalid_token');
  if(new Set(request.referenceIds).size!==request.referenceIds.length)throw new AccountError('Duplicate references are not supported.',400,'invalid_references');
  const references=JSON.stringify(request.referenceIds);
  const digest = await hash(canonical(request));
  const existing = await env.DB.prepare('SELECT * FROM account_jobs WHERE user_id = ? AND request_token = ?').bind(owner, token).first<JobRow>();
  if (existing) { if (existing.request_digest !== digest || existing.deleted) throw new AccountError('Submission token already used.', 409, 'token_conflict'); return existing; }
  const connection = ['pollinations', 'local-test'].includes(request.provider) ? null : await env.DB.prepare('SELECT id, revision FROM account_connections WHERE user_id = ? AND provider = ?').bind(owner, request.provider as Provider).first<{ id: string; revision: number }>();
  if (!connection && !['pollinations', 'local-test'].includes(request.provider)) throw new AccountError('Save this provider connection in your account first.', 409, 'connection_required');
  const id = crypto.randomUUID(), now = Date.now();
  const reservation = request.mediaType === 'video' ? VIDEO_RESERVATION : IMAGE_RESERVATION;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO account_storage (user_id) VALUES (?)').bind(owner),
    env.DB.prepare(`INSERT OR IGNORE INTO account_jobs (id,user_id,request_token,request_digest,connection_id,connection_revision,provider,request_json,reservation_bytes,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? FROM account_storage WHERE user_id = ? AND used_bytes + reserved_bytes + ? <= limit_bytes AND active_jobs < ? AND (SELECT COUNT(*) FROM account_uploads WHERE user_id=? AND state='ready' AND expires_at>? AND id IN (SELECT value FROM json_each(?)))=?`)
      .bind(id, owner, token, digest, connection?.id ?? null, connection?.revision ?? null, request.provider, JSON.stringify(request), reservation, now, now, owner, reservation, MAX_ACTIVE_JOBS, owner, now, references, request.referenceIds.length),
    env.DB.prepare('UPDATE account_storage SET reserved_bytes = reserved_bytes + ?, active_jobs = active_jobs + 1 WHERE user_id = ? AND EXISTS (SELECT 1 FROM account_jobs WHERE id = ? AND reservation_accounted = 0)').bind(reservation, owner, id),
    env.DB.prepare('UPDATE account_jobs SET reservation_accounted = 1 WHERE id = ?').bind(id),
    env.DB.prepare('INSERT OR IGNORE INTO account_job_inputs (job_id,upload_id) SELECT ?,id FROM account_uploads WHERE user_id=? AND id IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM account_jobs WHERE id=?)').bind(id,owner,references,id),
  ]);
  const row = await env.DB.prepare('SELECT * FROM account_jobs WHERE user_id = ? AND request_token = ?').bind(owner, token).first<JobRow>();
  if (!row) throw new AccountError('Your account needs more available storage or fewer active jobs. Free space or wait for a job to finish.', 409, 'capacity');
  if (row.request_digest !== digest) throw new AccountError('Submission token already used.', 409, 'token_conflict');
  return row;
}
export async function setJobState(env: Env, id: string, state: CloudJobState, errorCode: string | null = null) {
  await env.DB.prepare('UPDATE account_jobs SET state = ?, error_code = ?, updated_at = ? WHERE id = ? AND deleted = 0').bind(state, errorCode, Date.now(), id).run();
}
/** Release once, under the same transaction as the terminal status. */
export async function finishJob(env: Env, id: string, state: 'saved' | 'failed' | 'cancelled', errorCode: string | null = null) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE account_storage SET reserved_bytes = reserved_bytes - (SELECT reservation_bytes FROM account_jobs WHERE id = ?), active_jobs = active_jobs - 1
      WHERE user_id = (SELECT user_id FROM account_jobs WHERE id = ? AND reservation_accounted = 1)`).bind(id, id),
    env.DB.prepare('UPDATE account_jobs SET state = ?, error_code = ?, reservation_accounted = 0, updated_at = ? WHERE id = ? AND deleted = 0').bind(state, errorCode, Date.now(), id),
  ]);
}
export async function dispatchJob(env: Env, job: JobRow) {
  if (!env.GENERATION) throw new Error('Workflow binding is unavailable');
  const instanceId = `${job.id}-${job.workflow_attempt}`;
  try { await env.GENERATION.create({ id: instanceId, params: { jobId: job.id } }); }
  catch {
    // Creation can succeed remotely before its response is lost. Confirm existence.
    const instance = await env.GENERATION.get(instanceId);
    await instance.status();
  }
  await env.DB.prepare('UPDATE account_jobs SET dispatched = 1 WHERE id = ? AND workflow_attempt = ?').bind(job.id, job.workflow_attempt).run();
}
