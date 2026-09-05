import { geminiGenerate } from '../../../lib/engines/gemini';
import { cloudflareGenerate } from '../../../lib/engines/cloudflare';
import { pollinationsResponse } from '../../../lib/engines/pollinations';
import { writeOutput } from '../assets';
import type { CloudJobRequest } from '../../../lib/account/contracts';
import { AccountError } from '../jobs';
import type { GenerationAdapter } from '../providers';
import { resolveConnection } from '../vault';
import { inlineReferences, recoverStagedImage, stageImage } from './media';
import { SINGLE_IMAGE_MODELS } from '../../../lib/account/models';

export function validateSynchronousRequest(r: CloudJobRequest) {
  const invalid = () => {throw new AccountError('Review the selected model and image settings.',400,'invalid_settings');};
  if (r.provider !== 'gemini' && r.provider !== 'cloudflare' && r.provider !== 'pollinations') return invalid();
  if (r.modelId !== SINGLE_IMAGE_MODELS[r.provider] || r.mediaType !== 'image' || !['text','image'].includes(r.inputMode)) return invalid();
  if (r.inputMode === 'text' && r.referenceIds.length || r.inputMode === 'image' && !r.referenceIds.length) return invalid();
  if (r.provider === 'cloudflare' && (r.inputMode !== 'text' || Object.keys(r.values).length)) return invalid();
  if (r.provider === 'pollinations' && (r.inputMode !== 'text' || Object.keys(r.values).some(key=>key!=='aspectRatio'))) return invalid();
  if (r.referenceIds.length > 14 || Object.keys(r.values).some(key => !['aspectRatio','imageSize','useGoogleSearch'].includes(key))) return invalid();
  if (r.values.aspectRatio !== undefined && !['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9'].includes(String(r.values.aspectRatio))) return invalid();
  if (r.values.imageSize !== undefined && !['1K','2K','4K'].includes(String(r.values.imageSize))) return invalid();
  if (r.values.useGoogleSearch !== undefined && typeof r.values.useGoogleSearch !== 'boolean') return invalid();
}

export const synchronousAdapter: GenerationAdapter = {
  recover: recoverStagedImage,
  async submit(env,job) {
    const r: CloudJobRequest = JSON.parse(job.request_json);
    validateSynchronousRequest(r);
    if (!job.connection_id || job.connection_revision === null) throw new Error('Connection unavailable');
    const connection = await resolveConnection(env,job.user_id,job.connection_id,job.connection_revision);
    if (connection.provider !== job.provider) throw new Error('Connection mismatch');
    if (r.provider === 'pollinations') {
      const response=await pollinationsResponse({prompt:r.prompt,aspectRatio:r.values.aspectRatio as string|undefined,apiKey:connection.secret.apiKey});
      const mimeType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if (!response.body || !mimeType.startsWith('image/')) {await response.body?.cancel();throw new Error('Unexpected Pollinations output');}
      const key=`accounts/${job.user_id}/jobs/${job.id}/0`;
      await writeOutput(env,key,response.body,mimeType);
      return {result:{sources:[{objectKey:key,mimeType}]}};
    }
    const result = r.provider === 'gemini'
      ? await geminiGenerate({apiKey:connection.secret.apiKey,prompt:r.prompt,referenceImages:await inlineReferences(env,job),config:r.values,singleAttempt:true})
      : await cloudflareGenerate({prompt:r.prompt,accountId:connection.secret.accountId!,token:connection.secret.apiKey});
    return {result:{...await stageImage(env,job,result.imageData,result.mimeType),usage:result.usage}};
  },
  async poll() {throw new Error('Synchronous engines have no status endpoint');},
};
