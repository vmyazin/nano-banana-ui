import { accountAssetUrl } from './client';
import type { CloudAsset } from './contracts';
import { prepareReferences } from '@/lib/draft/ingest';
import { extensionForMedia } from '@/lib/media-download';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';

/** Explicitly copy a selected image into the draft, never the guest gallery. */
export async function addAccountAssetAsReference(asset:CloudAsset,ownerId:string,limit:number) {
  const epoch=useAccountStore.getState().epoch;
  const assertOwner=()=>{
    const current=useAccountStore.getState();
    if(current.status!=='ready'||current.epoch!==epoch||current.session?.account?.id!==ownerId)throw new Error('Your account changed. Choose the image again.');
  };
  assertOwner();
  if(asset.kind!=='image'||!asset.mimeType.startsWith('image/'))throw new Error('Choose an image to use as a reference.');
  if(asset.bytes>20_000_000)throw new Error('This image exceeds the 20 MB reference limit. Download and resize it first.');
  if(useDraftStore.getState().references.length>=limit)throw new Error('Remove a reference before adding another.');
  const url=await accountAssetUrl(asset.id,undefined,ownerId);
  assertOwner();
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});
  assertOwner();
  if(!response.ok)throw new Error('This cloud image is no longer available.');
  const blob=await response.blob();
  assertOwner();
  if(!blob.type.startsWith('image/')||blob.size>20_000_000)throw new Error('This file cannot be used as a reference.');
  const prepared=await prepareReferences([{file:new File([blob],`cloud-${asset.id}.${extensionForMedia('image',blob.type)}`,{type:blob.type}),sourceLabel:`From ${asset.metadata.prompt||'cloud library'}`}],useAppStore.getState().imageFormat);
  assertOwner();
  if(useDraftStore.getState().references.length>=limit)throw new Error('Remove a reference before adding another.');
  useDraftStore.getState().addReferences(prepared,limit);
}

/** @deprecated Prefer addAccountAssetAsReference; retained for existing callers. */
export const useAccountAssetAsReference=addAccountAssetAsReference;
