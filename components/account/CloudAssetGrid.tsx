'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageDown, Loader2, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import LastFrameActions from '@/components/LastFrameActions';
import { accountRequest } from '@/lib/account/client';
import type { CloudAsset } from '@/lib/account/contracts';
import { downloadAccountAsset } from '@/lib/account/download';
import { addAccountAssetAsReference } from '@/lib/account/reference';
import { formatAccountBytes } from '@/lib/account/use-library';
import { useAccountStore } from '@/store/useAccountStore';
import { useDraftStore } from '@/store/useDraftStore';
import TemporaryAssetNotice from './TemporaryAssetNotice';

export default function CloudAssetGrid({assets,ownerId,mode='browse',referenceLimit=8,onUsedReference,onChanged}: {
  assets:CloudAsset[];ownerId:string;mode?:'browse'|'pick-image';referenceLimit?:number;
  onUsedReference?:()=>void;onChanged:()=>void;
}) {
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  const [removing,setRemoving]=useState<CloudAsset|null>(null);
  const pending=useRef(false),mounted=useRef(true);
  const visible=mode==='pick-image'?assets.filter(asset=>asset.kind==='image'):assets;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function assertOwner(){
    if(useAccountStore.getState().session?.account?.id!==ownerId)throw new Error('Your account changed. Try again from the current library.');
  }
  async function run(asset:CloudAsset,action:()=>Promise<unknown>){
    if(pending.current)return;pending.current=true;setBusy(asset.id);setError(null);
    try{assertOwner();await action();}
    catch(error){if(mounted.current)setError(error instanceof Error&&error.message?error.message:'Please try again.');}
    finally{pending.current=false;if(mounted.current)setBusy(null);}
  }
  function reference(asset:CloudAsset){return run(asset,async()=>{await addAccountAssetAsReference(asset,ownerId,referenceLimit??8);assertOwner();toast.success('Added as a reference');onUsedReference?.();});}
  function restore(asset:CloudAsset){
    if(useAccountStore.getState().session?.account?.id!==ownerId)return;
    const draft=useDraftStore.getState();draft.setPrompt(asset.metadata.prompt);draft.rememberControlValues(asset.metadata.values);
    toast.success('Prompt and settings restored');onUsedReference?.();
  }
  async function remove(asset:CloudAsset){
    await run(asset,async()=>{await accountRequest(`assets/${asset.id}`,{method:'DELETE',headers:{'X-Account-Id':ownerId}});assertOwner();if(mounted.current)setRemoving(null);onChanged();});
  }
  return <>
    <TemporaryAssetNotice assets={visible}/>
    {error&&<p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
    {visible.length===0?<p className="py-6 text-center text-sm text-[var(--foreground-muted)]">{mode==='pick-image'?'No cloud images on this page.':'Your saved cloud assets will appear here.'}</p>:
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{visible.map(asset=><li key={asset.id} className="space-y-3 rounded-xl border border-cyan-300/25 bg-[var(--background-elevated)]/80 p-3 transition-colors hover:border-cyan-300/50 motion-reduce:transition-none">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black/40">
          {asset.kind==='image'?
            // Private same-origin authorization redirects to an expiring Worker capability.
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" src={`/api/account/assets/${asset.id}/content`} alt={asset.metadata.prompt||'Saved cloud image'} className="h-full w-full object-contain"/>:
            <video controls preload="none" crossOrigin="anonymous" aria-label={asset.metadata.prompt||'Saved cloud video'} src={`/api/account/assets/${asset.id}/content`} className="h-full w-full"/>}
        </div>
        <div><p className="line-clamp-2 text-sm font-medium text-[var(--foreground)]">{asset.metadata.prompt||'Untitled result'}</p><p className="mt-1 text-xs text-cyan-200">{asset.metadata.provider} · {asset.kind} · {formatAccountBytes(asset.bytes)}{asset.expiresAt?' · Temporary':''}</p></div>
        <div className="flex flex-wrap gap-2">
          {asset.kind==='image'&&<button type="button" disabled={busy!==null} onClick={()=>void reference(asset)} className="btn-secondary gap-1.5 px-2 py-1 text-xs">{busy===asset.id?<Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>:<ImageDown size={13} aria-hidden="true"/>}{mode==='pick-image'?'Use image':'Use as reference'}</button>}
          {mode==='browse'&&<>
            <button type="button" onClick={()=>restore(asset)} className="btn-secondary gap-1.5 px-2 py-1 text-xs"><Wand2 size={13} aria-hidden="true"/>Restore settings</button>
            <button type="button" disabled={busy!==null} onClick={()=>void run(asset,()=>downloadAccountAsset(asset))} aria-label={`Download ${asset.metadata.prompt||'cloud asset'}`} className="btn-secondary px-2 py-1 text-xs"><Download size={13} aria-hidden="true"/></button>
            <button type="button" disabled={busy!==null} onClick={()=>setRemoving(asset)} aria-label={`Delete ${asset.metadata.prompt||'cloud asset'}`} className="btn-secondary px-2 py-1 text-xs hover:text-red-300"><Trash2 size={13} aria-hidden="true"/></button>
          </>}
        </div>
        {mode==='browse'&&asset.kind==='video'&&<LastFrameActions videoUrl={`/api/account/assets/${asset.id}/content`} filenameBase={`scene-assembly-${asset.id}`} onContinue={onUsedReference}/>}
      </li>)}</ul>}
    {removing&&createPortal(<ConfirmDialog open title="Delete this saved asset?" description="This removes the cloud copy from your account on every device. Download a copy first if you want to keep it." confirmLabel="Delete asset" onConfirm={()=>void remove(removing)} onCancel={()=>setRemoving(null)}/>,document.body)}
  </>;
}
