import { accountAssetUrl } from './client';
import type { CloudAsset } from './contracts';
import { knownAccountAssetFilenameBase } from './asset-name';
import { boundedMediaBlob, extensionForMedia } from '@/lib/media-download';
import { MAX_EDIT_VIDEO_BYTES, validateEditVideo } from '@/lib/providers/video-edit';
import { useAccountStore } from '@/store/useAccountStore';

/** Explicit selection only; account bytes stay in memory, never the guest gallery. */
export async function videoFileFromAccount(asset: CloudAsset, owner: string): Promise<File> {
  const epoch = useAccountStore.getState().epoch;
  const assertOwner = () => {
    const state = useAccountStore.getState();
    if (state.epoch !== epoch || state.session?.account?.id !== owner) throw new Error('Your account changed. Choose the video again.');
  };
  assertOwner();
  validateEditVideo({type: asset.mimeType, size: asset.bytes});
  const url = await accountAssetUrl(asset.id, undefined, owner);
  assertOwner();
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error('This saved video is no longer available.');
  const blob = await boundedMediaBlob(response, response.headers.get('Content-Type')?.split(';')[0] || '', AbortSignal.timeout(120_000), MAX_EDIT_VIDEO_BYTES);
  assertOwner();
  validateEditVideo(blob);
  return new File([blob], `${knownAccountAssetFilenameBase(asset)}.${extensionForMedia('video', blob.type)}`, {type: blob.type});
}
