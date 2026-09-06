import { accountAssetUrl } from './client';
import { accountAssetFilenameBase } from './asset-name';
import { convertedForDownload } from '@/lib/image/download-format';
import { extensionForMedia } from '@/lib/media-download';
import { useAppStore } from '@/store/useAppStore';
import type { CloudAsset } from './contracts';
export async function downloadAccountAsset(asset:CloudAsset) {
  // The slug request runs alongside the fetch so a cold library download does not pay for both in sequence.
  const [response,filenameBase]=await Promise.all([fetch(await accountAssetUrl(asset.id),{credentials:'omit',referrerPolicy:'no-referrer'}),accountAssetFilenameBase(asset)]);
  if(!response.ok)throw new Error('Could not download this saved asset.');
  const original=await response.blob();
  const blob=asset.kind==='image'?await convertedForDownload(original,useAppStore.getState().imageFormat):original;
  // Named after the saved bytes, like the guest path: conversion may have declined the requested format.
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${filenameBase}.${extensionForMedia(asset.kind,blob.type)}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
