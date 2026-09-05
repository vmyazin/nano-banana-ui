import { accountAssetUrl } from './client';
import { convertedForDownload } from '@/lib/image/download-format';
import { useAppStore } from '@/store/useAppStore';
import type { CloudAsset } from './contracts';
export async function downloadAccountAsset(asset:CloudAsset) {
  const response=await fetch(await accountAssetUrl(asset.id),{credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('Could not download this saved asset.');
  const original=await response.blob();
  const blob=asset.kind==='image'?await convertedForDownload(original,useAppStore.getState().imageFormat):original;
  const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','video/mp4':'mp4','video/webm':'webm'};
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`scene-assembly-${asset.id}.${extensions[blob.type]||'bin'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
