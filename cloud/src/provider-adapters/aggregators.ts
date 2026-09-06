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

/** Each rejection names what was wrong. One shared sentence hid which of a
 *  dozen checks fired, which sent people hunting through the wrong settings —
 *  a first-and-last-frame job read as an image-format problem. */
export function validateAggregatorRequest(r: CloudJobRequest) {
  if (r.provider !== 'runware' && r.provider !== 'atlas' && r.provider !== 'comet') throw new Error('Unsupported aggregator');
  const model = findModel(r.provider, r.modelId);
  const invalid = (message: string) => { throw new AccountError(message, 400, 'invalid_settings'); };
  const providerLabel = r.provider === 'runware' ? 'Runware' : r.provider === 'atlas' ? 'Atlas Cloud' : 'Comet';
  if (!model) return invalid(`${providerLabel} does not list the model "${r.modelId}". Pick a model from the list.`);
  if (model.kind !== r.mediaType) return invalid(`${model.label} makes ${model.kind}s, not ${r.mediaType}s. Pick a ${r.mediaType} model.`);
  if (!model.modes.includes(r.inputMode)) return invalid(`${model.label} does not offer ${describeMode(r.inputMode)}. Pick another model or input mode.`);
  const count = r.referenceIds.length;
  if (r.inputMode === 'text' && count !== 0) return invalid('A text-only run cannot include images. Remove them or switch to an image input mode.');
  if (r.inputMode !== 'text' && count === 0) return invalid(`${describeMode(r.inputMode, true)} needs at least one image.`);
  if (r.mediaType === 'image') {
    const maxImages = Math.min(model.maxInputImages ?? 1, r.provider === 'runware' ? 4 : 1);
    if (count > maxImages) return invalid(`${model.label} takes up to ${maxImages} input image${maxImages === 1 ? '' : 's'} in a background job. Remove ${count - maxImages}.`);
  } else if (r.inputMode !== 'text') {
    const capability = resolveVideoInput(r.provider, r.modelId, r.inputMode);
    if (!capability) return invalid(`${model.label} does not accept images for ${describeMode(r.inputMode)}.`);
    if (r.inputMode === 'frames' && count !== 2) return invalid('First and last frame needs exactly two images: the frame the clip opens on, then the one it ends on.');
    if (count > capability.maxImages) return invalid(`${model.label} takes up to ${capability.maxImages} input image${capability.maxImages === 1 ? '' : 's'}. Remove ${count - capability.maxImages}.`);
    // Comet's video route takes a single `input_reference`; Atlas maps a second
    // image to `last_image`, so only Comet is held to one.
    if (r.provider === 'comet' && count > 1) return invalid('Comet background jobs accept one input image, so first-and-last-frame runs are not available there yet.');
  }
  const {aspectRatio, size, durationSeconds} = r.values;
  if (aspectRatio !== undefined && !['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9'].includes(String(aspectRatio))) return invalid(`"${String(aspectRatio)}" is not an aspect ratio ${model.label} accepts.`);
  if (size !== undefined && (typeof size !== 'string' || !model.sizes?.some(s => s.label === size))) return invalid(`"${String(size)}" is not an output size ${model.label} publishes. Pick one from the list.`);
  if (durationSeconds !== undefined && (typeof durationSeconds !== 'number' || resolveDuration(r.provider, r.modelId, durationSeconds) !== durationSeconds)) return invalid(`${String(durationSeconds)} seconds is not a length ${model.label} publishes. Pick one from the list.`);
  const stray = Object.keys(r.values).find(key => !['aspectRatio','size','durationSeconds'].includes(key));
  if (stray) return invalid(`"${stray}" is not a setting this provider accepts.`);
}

function describeMode(mode: CloudJobRequest['inputMode'], capitalized = false): string {
  const label = mode === 'frames' ? 'first and last frame' : mode === 'reference' ? 'reference images' : mode === 'image' ? 'image input' : 'text input';
  return capitalized ? label[0].toUpperCase() + label.slice(1) : label;
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
    return {state: 'success', result: {sources: result.urls.map(url => ({url})), ...(result.cost !== undefined ? {cost: result.cost} : {})}};
  },
};
