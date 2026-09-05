import { findModel, resolveDuration, resolveSize, resolveVideoInput } from '../../../lib/providers/catalog';
import { atlasCreateImage, atlasCreateVideo, atlasPollVideo } from '../../../lib/providers/atlas';
import { runwareCreateImage, runwareCreateVideo, runwarePollImage, runwarePollVideo } from '../../../lib/providers/runware';
import { cometGenerateImage, cometCreateVideo, cometPollVideo } from '../../../lib/providers/comet';
import type { ProviderId } from '../../../lib/providers/types';
import type { CloudJobRequest } from '../../../lib/account/contracts';
import type { GenerationAdapter } from '../providers';
import { AccountError } from '../jobs';
import { inputUrls } from '../uploads';
import { credentials } from './queued';
import { inlineReferences, recoverStagedImage, stageImage } from './media';

export function validateAggregatorRequest(r: CloudJobRequest) {
  if (r.provider !== 'runware' && r.provider !== 'atlas' && r.provider !== 'comet') throw new Error('Unsupported aggregator');
  const model = findModel(r.provider, r.modelId);
  const invalid = () => { throw new AccountError('Review the selected model and generation settings.', 400, 'invalid_settings'); };
  if (!model || model.kind !== r.mediaType || !model.modes.includes(r.inputMode)) return invalid();
  const count = r.referenceIds.length;
  if (r.inputMode === 'text' && count !== 0 || r.inputMode !== 'text' && count === 0) return invalid();
  if (r.mediaType === 'image') {
    if (count > Math.min(model.maxInputImages ?? 1, r.provider === 'runware' ? 4 : 1)) return invalid();
  } else if (r.inputMode !== 'text') {
    const capability = resolveVideoInput(r.provider, r.modelId, r.inputMode);
    if (!capability || count > capability.maxImages || r.inputMode === 'frames' && count !== 2) return invalid();
    // Atlas's existing transport accepts one image, not an array of frames.
    if (r.provider !== 'runware' && count > 1) return invalid();
  }
  const {aspectRatio, size, durationSeconds} = r.values;
  if (aspectRatio !== undefined && !['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9'].includes(String(aspectRatio))) return invalid();
  if (size !== undefined && (typeof size !== 'string' || !model.sizes?.some(s => s.label === size))) return invalid();
  if (durationSeconds !== undefined && (typeof durationSeconds !== 'number' || resolveDuration(r.provider, r.modelId, durationSeconds) !== durationSeconds)) return invalid();
  if (Object.keys(r.values).some(key => !['aspectRatio','size','durationSeconds'].includes(key))) return invalid();
}

export const aggregatorAdapter: GenerationAdapter = {
  async recover(env,job) {
    const r:CloudJobRequest=JSON.parse(job.request_json);
    return r.provider==='comet'&&r.mediaType==='image' ? recoverStagedImage(env,job) : undefined;
  },
  async submit(env, job) {
    const r: CloudJobRequest = JSON.parse(job.request_json);
    validateAggregatorRequest(r);
    const provider = r.provider as ProviderId;
    const model = findModel(provider, r.modelId)!;
    const common = {
      apiKey: await credentials(env, job), model: r.modelId, prompt: r.prompt,
      images: provider === 'comet' ? (await inlineReferences(env,job)).map(ref=>`data:${ref.mimeType};base64,${ref.data}`) : await inputUrls(env, job), aspectRatio: r.values.aspectRatio as string | undefined,
    };
    if (r.mediaType === 'image') {
      if (provider === 'comet') {
        const result = await cometGenerateImage(common);
        if (result.base64) return {result:await stageImage(env,job,result.base64,result.mimeType || 'image/png')};
        if (result.url) return {result:{sources:[{url:result.url}]}};
        throw new Error('Missing output');
      }
      const create = provider === 'runware' ? runwareCreateImage : atlasCreateImage;
      const result = await create({...common, imageInput: model.imageInput});
      return {handle: {id: result.taskId}};
    }
    const size = resolveSize(provider, r.modelId, r.values.size as string | undefined);
    const create = provider === 'runware' ? runwareCreateVideo : provider === 'comet' ? cometCreateVideo : atlasCreateVideo;
    const result = await create({
      ...common, inputMode: r.inputMode,
      inputField: resolveVideoInput(provider, r.modelId, r.inputMode)?.field,
      durationSeconds: resolveDuration(provider, r.modelId, r.values.durationSeconds as number | undefined),
      width: size?.width, height: size?.height, resolution: size?.preset,
    });
    return {handle: {id: result.taskId}};
  },
  async poll(env, job, handle) {
    const r: CloudJobRequest = JSON.parse(job.request_json);
    const poll = job.provider === 'atlas' ? atlasPollVideo : job.provider === 'comet' ? cometPollVideo : r.mediaType === 'image' ? runwarePollImage : runwarePollVideo;
    const result = await poll({apiKey: await credentials(env, job), taskId: handle.id});
    if (result.state === 'error') return {state: 'failed'};
    if (result.state !== 'success') return {state: 'running'};
    if (!result.urls.length) throw new Error('Missing output');
    return {state: 'success', result: {sources: result.urls.map(url => ({url}))}};
  },
};
