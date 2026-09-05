import type { CloudJobRequest } from '../../../lib/account/contracts';
import { writeOutput, type ProviderResult } from '../assets';
import { AccountError, type JobRow } from '../jobs';
import type { Env } from '../security';

import { MAX_INLINE_INPUT_BYTES } from '../limits';
const MAX_INLINE_OUTPUT_BYTES = 24_000_000;
const stagedKey = (job: JobRow) => `accounts/${job.user_id}/jobs/${job.id}/0`;

export async function recoverStagedImage(env: Env, job: JobRow): Promise<ProviderResult | undefined> {
  const key = stagedKey(job), object = await env.ASSETS?.head(key);
  if (!object || object.size <= 0) return undefined;
  return {sources:[{objectKey:key,mimeType:object.httpMetadata?.contentType}]};
}

/** Decode in aligned chunks so a base64 response does not require two more full copies. */
export async function stageImage(env: Env, job: JobRow, base64: string, mimeType: string): Promise<ProviderResult> {
  if (!base64 || base64.length > Math.ceil(MAX_INLINE_OUTPUT_BYTES / 3) * 4) throw new AccountError('The returned image exceeds the supported inline size.',502,'result_size');
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({pull(controller) {
    if (offset >= base64.length) {controller.close(); return;}
    const chunk = base64.slice(offset, offset + 65536); offset += chunk.length;
    controller.enqueue(Uint8Array.from(atob(chunk), char => char.charCodeAt(0)));
  }});
  const key = stagedKey(job);
  await writeOutput(env,key,stream,mimeType,MAX_INLINE_OUTPUT_BYTES);
  return {sources:[{objectKey:key,mimeType}]};
}

/** Resolve references from owned R2 keys, never fetch a browser-supplied URL. */
export async function inlineReferences(env: Env, job: JobRow) {
  const r: CloudJobRequest = JSON.parse(job.request_json);
  const references: Array<{data:string;mimeType:string}> = [];
  let total = 0;
  for (const id of r.referenceIds) {
    const row = await env.DB.prepare("SELECT u.object_key,u.expected_bytes,u.mime_type FROM account_uploads u JOIN account_job_inputs i ON i.upload_id=u.id WHERE u.id=? AND u.user_id=? AND u.state='ready' AND i.job_id=?")
      .bind(id,job.user_id,job.id).first<{object_key:string;expected_bytes:number;mime_type:string}>();
    if (!row || (total += row.expected_bytes) > MAX_INLINE_INPUT_BYTES) throw new Error('Inline references unavailable or too large');
    const object = await env.ASSETS!.get(row.object_key);
    if (!object || object.size !== row.expected_bytes) throw new Error('Reference unavailable');
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    const chunks: string[] = [];
    // Multiple of three preserves base64 padding only at the final chunk.
    for (let offset=0; offset<bytes.length; offset+=49152) chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset,offset+49152))));
    references.push({data:chunks.join(''),mimeType:row.mime_type});
  }
  return references;
}
