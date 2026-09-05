'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { CloudJobState, CloudJobView } from '@/lib/account/contracts';
const labels:Record<CloudJobState,string>={queued:'Queued',submitting:'Starting',running:'Generating',saving:'Saving',saved:'Saved',needs_attention:'Needs attention',failed:'Failed',cancelled:'Cancelled'};
const tones:Record<CloudJobState,string>={queued:'text-sky-300',submitting:'text-sky-300',running:'text-violet-300',saving:'text-cyan-300',saved:'text-emerald-300',needs_attention:'text-amber-300',failed:'text-red-300',cancelled:'text-[var(--foreground-muted)]'};
const stopTrackingDescription='The provider may still finish and charge for this job. Scene Assembly will stop checking and saving new outputs. Existing saved assets remain; temporary downloads keep their existing deadline. Check the provider history before starting another generation.';
export default function CloudJobList({jobs,onResume,onCancel,onDismiss,busy=false,limit=5}:{jobs:CloudJobView[];onResume:(id:string)=>void;onCancel?:(id:string)=>void;onDismiss?:(id:string)=>void;busy?:boolean;limit?:number}) {
  const [dismissing,setDismissing]=useState<CloudJobView|null>(null);
  if(!jobs.length)return null;
  return <><ul className="space-y-2">{jobs.slice(0,limit).map(job=><li key={job.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 p-3">
    <div className="flex items-center justify-between gap-3"><p className="truncate text-sm">{job.request.prompt}</p><span className={`shrink-0 text-xs font-semibold ${job.state==='failed'&&job.errorCode==='tracking_stopped'?'text-[var(--foreground-muted)]':tones[job.state]}`}>{job.state==='failed'&&job.errorCode==='tracking_stopped'?'Tracking stopped':labels[job.state]}</span></div>
    {job.state==='queued'&&onCancel&&<button disabled={busy} type="button" onClick={()=>onCancel(job.id)} className="mt-2 text-xs text-sky-200 underline underline-offset-4">Cancel queued job</button>}
    {job.state==='needs_attention'&&<div className="mt-2 text-xs leading-relaxed text-amber-200"><p>{job.errorCode==='storage_full'?'Your result is temporarily available. Download it before its deadline, or free library space and resume saving.':job.errorCode==='submission_ambiguous'?'The provider may have accepted this job. Check its history before starting another paid generation.':'Tracking or saving needs another attempt. Resume this job without generating again.'}</p>{job.errorCode!=='submission_ambiguous'&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 underline underline-offset-4">Resume existing job</button>}</div>}
    {job.state==='needs_attention'&&job.errorCode==='submission_ambiguous'&&job.request.mediaType==='image'&&['gemini','cloudflare','pollinations','comet'].includes(job.provider)&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 text-xs text-amber-200 underline underline-offset-4">Check for a saved output</button>}
    {job.state==='needs_attention'&&onDismiss&&<button disabled={busy} type="button" onClick={()=>setDismissing(job)} className="mt-2 block text-xs text-red-200 underline underline-offset-4">Stop tracking this job</button>}
    {job.state==='failed'&&job.errorCode==='tracking_stopped'&&<p className="mt-2 text-xs text-[var(--foreground-muted)]">Scene Assembly stopped checking and saving new outputs. The provider may still have finished or charged for this job, so check its history before starting another generation.</p>}
    {job.state==='failed'&&job.errorCode==='storage_expired'&&<p className="mt-2 text-xs text-[var(--foreground-muted)]">The temporary download expired before library space became available.</p>}
  </li>)}</ul>{dismissing&&typeof document!=='undefined'&&createPortal(<ConfirmDialog open title="Stop tracking this job?" description={stopTrackingDescription} confirmLabel="Stop tracking" onConfirm={()=>{onDismiss?.(dismissing.id);setDismissing(null);}} onCancel={()=>setDismissing(null)}/>,document.body)}</>;
}
