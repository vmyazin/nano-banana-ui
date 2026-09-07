import { accountAssetUrl } from './client';
import type { CloudAsset } from './contracts';
import { prepareReferences } from '@/lib/draft/ingest';
import { extensionForMedia } from '@/lib/media-download';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';

/**
 * What the Worker accepts as a staged job input — `MAX_INPUT_BYTES` in
 * `cloud/src/uploads.ts`, which this cannot import across project boundaries.
 */
export const MAX_REFERENCE_BYTES = 20_000_000;
/**
 * What we are willing to pull into memory to *try*, which is deliberately not
 * the same number.
 *
 * A cloud result is a full-resolution provider PNG — that is what background
 * mode saves — and `prepareReferences` re-encodes it to WebP on the way in,
 * typically to a quarter of its size or less. Gating on the *stored* size
 * rejected those results before the conversion that would have made them fit,
 * so every background-mode image was unusable as an edit reference while the
 * same picture kept from browser storage went through. The upload cap belongs
 * on the bytes actually being uploaded; this one only bounds the download.
 */
export const MAX_REFERENCE_SOURCE_BYTES = 120_000_000;

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** Explicitly copy a selected image into the draft, never the guest gallery. */
export async function addAccountAssetAsReference(asset:CloudAsset,ownerId:string,limit:number) {
  const epoch=useAccountStore.getState().epoch;
  const assertOwner=()=>{
    const current=useAccountStore.getState();
    if(current.status!=='ready'||current.epoch!==epoch||current.session?.account?.id!==ownerId)throw new Error('Your account changed. Choose the image again.');
  };
  assertOwner();
  const legacyGenericImage=asset.kind==='image'&&asset.mimeType==='application/octet-stream';
  if(asset.kind!=='image'||(!asset.mimeType.startsWith('image/')&&!legacyGenericImage))throw new Error('Choose an image to use as a reference.');
  if(asset.bytes>MAX_REFERENCE_SOURCE_BYTES)throw new Error(`This image is over ${megabytes(MAX_REFERENCE_SOURCE_BYTES)} and is too large to open as a reference. Download and resize it first.`);
  // A swap keeps the count the same, so a full stack is not a reason to refuse
  // it - the slot being replaced is already spoken for.
  const isReplacing=()=>useDraftStore.getState().replaceTarget!==null;
  if(!isReplacing()&&useDraftStore.getState().references.length>=limit)throw new Error('Remove a reference before adding another.');
  const url=await accountAssetUrl(asset.id,undefined,ownerId);
  assertOwner();
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});
  assertOwner();
  if(!response.ok)throw new Error('This cloud image is no longer available.');
  const blob=await response.blob();
  assertOwner();
  if(!blob.type.startsWith('image/')||blob.size>MAX_REFERENCE_SOURCE_BYTES)throw new Error('This file cannot be used as a reference.');
  const prepared=await prepareReferences([{file:new File([blob],`cloud-${asset.id}.${extensionForMedia('image',blob.type)}`,{type:blob.type}),sourceLabel:`From ${asset.metadata.prompt||'cloud library'}`}],useAppStore.getState().imageFormat);
  assertOwner();
  // Measured after conversion, because conversion is what decides the payload.
  if(prepared.some(entry=>entry.file.size>MAX_REFERENCE_BYTES))throw new Error(`This image is still over ${megabytes(MAX_REFERENCE_BYTES)} after compression. Download and resize it first.`);
  if(!isReplacing()&&useDraftStore.getState().references.length>=limit)throw new Error('Remove a reference before adding another.');
  useDraftStore.getState().addReferences(prepared,limit);
}

/** @deprecated Prefer addAccountAssetAsReference; retained for existing callers. */
export const useAccountAssetAsReference=addAccountAssetAsReference;
