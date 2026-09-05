'use client';

import { useEffect, useState } from 'react';
import { Cloud, RefreshCw, Trash2 } from 'lucide-react';
import ResultStack from '@/components/ResultStack';
import ConfirmDialog from '@/components/ConfirmDialog';
import { accountAssetUrl } from '@/lib/account/client';
import { convertedForDownload } from '@/lib/image/download-format';
import { useAppStore } from '@/store/useAppStore';
import type { CloudAsset, CloudJobState, CloudJobView } from '@/lib/account/contracts';
import { AccountSurface } from './AccountSurface';

const labels: Record<CloudJobState, string> = { queued:'Queued',submitting:'Starting',running:'Generating',saving:'Saving',saved:'Saved',needs_attention:'Needs attention',failed:'Failed',cancelled:'Cancelled' };
const tones: Record<CloudJobState, string> = { queued:'text-sky-300',submitting:'text-sky-300',running:'text-violet-300',saving:'text-cyan-300',saved:'text-emerald-300',needs_attention:'text-amber-300',failed:'text-red-300',cancelled:'text-[var(--foreground-muted)]' };
interface Storage { limitBytes:number;usedBytes:number;reservedBytes:number;activeJobs:number }
function size(bytes:number){if(bytes===0)return '0 MB';if(bytes<1_000)return `${bytes} B`;const unit=bytes<1_000_000?'KB':'MB';return new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(bytes/(unit==='KB'?1_000:1_000_000))+' '+unit;}
async function read<T>(path:string,signal?:AbortSignal):Promise<T>{const response=await fetch(`/api/account/${path}`,{cache:'no-store',signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load your cloud workspace.');return data;}

export default function AccountLibrary({ localTest }: {localTest:boolean}) {
  const [jobs,setJobs]=useState<CloudJobView[]>([]);
  const [assets,setAssets]=useState<CloudAsset[]>([]);
  const [storage,setStorage]=useState<Storage|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [removing,setRemoving]=useState<CloudAsset|null>(null);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [cursor,setCursor]=useState<string|null>(null);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    async function refresh(){
      if(running)return;running=true;
      try{
        const [jobPage,assetPage,quota]=await Promise.all([read<{jobs:CloudJobView[]}>('jobs',controller.signal),read<{assets:CloudAsset[];nextCursor:string|null}>(`assets${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,controller.signal),read<{storage:Storage}>('storage',controller.signal)]);
        if(!controller.signal.aborted){setJobs(jobPage.jobs);setAssets(assetPage.assets);setNextCursor(assetPage.nextCursor);setStorage(quota.storage);setError(null);}
      }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not load your cloud workspace.');}
      finally{running=false;}
    }
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[revision,cursor]);
  async function action(path:string,method='POST',body?:unknown){
    setBusy(true);setError(null);
    try{const response=await fetch(`/api/account/${path}`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRevision(n=>n+1);}
    catch(error){setError(error instanceof Error?error.message:'Please try again.');}
    finally{setBusy(false);setRemoving(null);}
  }
  async function download(asset:CloudAsset){
    try{
      const response=await fetch(await accountAssetUrl(asset.id),{credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('Could not download this asset.');
      const original=await response.blob();
      const blob=asset.kind==='image'?await convertedForDownload(original,useAppStore.getState().imageFormat):original;
      const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','video/mp4':'mp4','video/webm':'webm'};
      const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`scene-assembly-${asset.id}.${extensions[blob.type]||'bin'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(error){setError(error instanceof Error?error.message:'Download failed.');}
  }
  return <AccountSurface label="Cloud library" className="mt-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Cloud size={18} className="text-[var(--neon-cyan)]" aria-hidden="true"/>Cloud library</h2>
    {storage&&<div className="mt-4"><div className="flex justify-between gap-2 text-sm"><span>{size(storage.usedBytes)} saved</span><span className="text-[var(--foreground-muted)]">1 GB included</span></div><div role="meter" aria-valuemin={0} aria-valuemax={storage.limitBytes} aria-valuenow={Math.min(storage.limitBytes,storage.usedBytes+storage.reservedBytes)} aria-valuetext={`${size(storage.usedBytes)} saved, ${size(storage.reservedBytes)} reserved`} aria-label="Cloud storage used and reserved" className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10"><span className="bg-[var(--neon-cyan)] transition-[width] duration-300 motion-reduce:transition-none" style={{width:`${Math.min(100,storage.usedBytes/storage.limitBytes*100)}%`}}/><span className="bg-violet-400/70 transition-[width] duration-300 motion-reduce:transition-none" style={{width:`${Math.min(100,storage.reservedBytes/storage.limitBytes*100)}%`}}/></div><p className="mt-2 text-xs text-[var(--foreground-muted)]">{size(storage.reservedBytes)} reserved for active jobs</p></div>}
    {localTest&&<button disabled={busy} type="button" className="btn-secondary mt-4 w-full justify-center" onClick={()=>void action('jobs','POST',{token:crypto.randomUUID(),request:{provider:'local-test',modelId:'local-test',mediaType:'image',inputMode:'text',prompt:'Local background test',values:{},referenceIds:[]}})}>Run local background test</button>}
    {jobs.length>0&&<ul className="mt-5 divide-y divide-[var(--border)]">{jobs.slice(0,10).map(job=><li key={job.id} className="py-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium">{job.request.prompt}</p><span className={`shrink-0 text-xs font-semibold ${tones[job.state]}`}>{labels[job.state]}</span></div>{job.state==='needs_attention'&&<div className="mt-2"><p className="text-xs leading-relaxed text-amber-200">{job.errorCode==='submission_ambiguous'?'The provider may have accepted this job. Check its history before starting another paid generation.':'Tracking or saving was interrupted. Resume the existing job without generating again.'}</p>{job.errorCode!=='submission_ambiguous'&&<button disabled={busy} className="btn-secondary mt-2 text-xs" onClick={()=>void action(`jobs/${job.id}/resume`)}><RefreshCw size={13} aria-hidden="true"/>Resume</button>}</div>}</li>)}</ul>}
    <div className="mt-5"><ResultStack items={assets.filter(a=>a.kind==='image').map(a=>({id:a.id,src:`/api/account/assets/${a.id}/content`,mimeType:a.mimeType,label:a.metadata.modelId}))} emptyState={<p className="px-5 text-center text-sm text-[var(--foreground-muted)]">Your saved images will appear here.</p>} onDownload={item=>{const asset=assets.find(a=>a.id===item.id);if(asset)return download(asset);}}/></div>
    {assets.length>0&&<ul className="mt-4 divide-y divide-[var(--border)]">{assets.map(asset=><li key={asset.id} className="py-3">{asset.kind==='video'&&<video controls preload="metadata" src={`/api/account/assets/${asset.id}/content`} className="mb-3 w-full rounded-lg"/>}<div className="flex items-center justify-between gap-3"><button type="button" className="min-w-0 text-left text-sm underline underline-offset-4" onClick={()=>void download(asset)}><span className="line-clamp-2">{asset.metadata.prompt}</span><span className="text-xs text-[var(--foreground-muted)]">{size(asset.bytes)}</span></button><button type="button" disabled={busy} aria-label="Delete saved asset" onClick={()=>setRemoving(asset)} className="rounded-lg p-3 text-[var(--foreground-muted)] hover:bg-red-400/10 hover:text-red-300"><Trash2 size={16} aria-hidden="true"/></button></div></li>)}</ul>}
    {(cursor||nextCursor)&&<div className="mt-4 flex justify-between gap-2">{cursor&&<button className="btn-secondary text-sm" onClick={()=>setCursor(null)}>Latest assets</button>}{nextCursor&&<button className="btn-secondary text-sm" onClick={()=>setCursor(nextCursor)}>Older assets</button>}</div>}
    {error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    <ConfirmDialog open={!!removing} title="Delete this saved asset?" description="This removes the cloud copy from your account on every device. Download a copy first if you want to keep it." confirmLabel="Delete asset" onConfirm={()=>void action(`assets/${removing?.id}`,'DELETE')} onCancel={()=>setRemoving(null)}/>
  </AccountSurface>;
}
