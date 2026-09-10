'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { CloudJobView } from '@/lib/account/contracts';
import { JOB_STATE_LABELS as labels, JOB_STATE_TONES as tones, isActiveJob, isRemovableJob } from '@/lib/account/job-status';
import JobElapsed from '@/components/JobElapsed';
const stopTrackingDescription='The provider may still finish and charge for this job. Scene Assembly will stop checking and saving new outputs. Existing saved assets remain; temporary downloads keep their existing deadline. Check the provider history before starting another generation.';
export default function CloudJobList({jobs,onResume,onCancel,onDismiss,onRemove,busy=false,limit=5}:{jobs:CloudJobView[];onResume:(id:string)=>void;onCancel?:(id:string)=>void;onDismiss?:(id:string)=>void;onRemove?:(ids:string[])=>void;busy?:boolean;limit?:number}) {
  const [dismissing,setDismissing]=useState<CloudJobView|null>(null);
  const [clearing,setClearing]=useState(false);
  if(!jobs.length)return null;
  const shown=jobs.slice(0,limit);
  // Only what is on screen. Clearing rows the list is not showing would be a
  // second, invisible deletion behind a button that names a visible count.
  const removable=onRemove?shown.filter(isRemovableJob):[];
  return <>
    {removable.length>1&&<div className="mb-2 flex justify-end"><button disabled={busy} type="button" onClick={()=>setClearing(true)} className="text-xs text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)] disabled:opacity-50">Clear {removable.length} finished jobs</button></div>}
    <ul className="space-y-2">{shown.map(job=><li key={job.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 p-3">
    <div className="flex items-center justify-between gap-3"><p className="truncate text-sm">{job.request.prompt}</p><div className="flex shrink-0 items-center gap-2"><span className={`text-xs font-semibold ${job.state==='failed'&&job.errorCode==='tracking_stopped'?'text-[var(--foreground-muted)]':tones[job.state]}`}>{job.state==='failed'&&job.errorCode==='tracking_stopped'?'Tracking stopped':labels[job.state]}</span>
      <JobElapsed className="text-xs text-[var(--foreground-muted)]" startedAt={job.createdAt} finishedAt={isActiveJob(job)?undefined:job.updatedAt}/>
      {/* Unconfirmed on purpose: this removes a finished record, while the saved
          asset and the spend entry it describes both stay. The destructive
          decision was the one already taken to stop tracking. */}
      {onRemove&&isRemovableJob(job)&&<button disabled={busy} type="button" onClick={()=>onRemove([job.id])} title="Remove from this list" aria-label={`Remove "${job.request.prompt}" from this list`} className="-mr-1 rounded p-1 text-[var(--foreground-subtle)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50 motion-reduce:transition-none"><X size={14} aria-hidden="true"/></button>}</div></div>
    {job.state==='queued'&&onCancel&&<button disabled={busy} type="button" onClick={()=>onCancel(job.id)} className="mt-2 text-xs text-sky-200 underline underline-offset-4">Cancel queued job</button>}
    {job.state==='needs_attention'&&<div className="mt-2 text-xs leading-relaxed text-amber-200"><p>{job.errorCode==='storage_full'?'Your result is temporarily available. Download it before its deadline, or free library space and resume saving.':job.errorCode==='submission_ambiguous'?'The provider may have accepted this job. Check its history before starting another paid generation.':'Tracking or saving needs another attempt. Resume this job without generating again.'}</p>{job.errorCode!=='submission_ambiguous'&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 underline underline-offset-4">Resume existing job</button>}</div>}
    {job.state==='needs_attention'&&job.errorCode==='submission_ambiguous'&&job.request.mediaType==='image'&&['gemini','cloudflare','pollinations','comet'].includes(job.provider)&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 text-xs text-amber-200 underline underline-offset-4">Check for a saved output</button>}
    {job.state==='needs_attention'&&onDismiss&&<button disabled={busy} type="button" onClick={()=>setDismissing(job)} className="mt-2 block text-xs text-red-200 underline underline-offset-4">Stop tracking this job</button>}
    {/* One line, not the paragraph this used to carry: a stopped job is a row in
        a list of stopped jobs, and the full explanation repeated on each one
        buried the prompts that tell them apart. The long form still runs in the
        confirm dialog, at the moment the decision is actually made. */}
    {job.state==='failed'&&job.errorCode==='tracking_stopped'&&<p className="mt-2 text-xs text-[var(--foreground-muted)]">The provider may have charged for this — check its history.</p>}
    {job.state==='failed'&&job.errorCode==='storage_expired'&&<p className="mt-2 text-xs text-[var(--foreground-muted)]">The temporary download expired before library space became available.</p>}
  </li>)}</ul>
  {dismissing&&typeof document!=='undefined'&&createPortal(<ConfirmDialog open title="Stop tracking this job?" description={stopTrackingDescription} confirmLabel="Stop tracking" onConfirm={()=>{onDismiss?.(dismissing.id);setDismissing(null);}} onCancel={()=>setDismissing(null)}/>,document.body)}
  {clearing&&typeof document!=='undefined'&&createPortal(<ConfirmDialog open title={`Clear ${removable.length} finished jobs?`} description="Removes these stopped and cancelled jobs from the list. Saved assets and spend records are not affected, and nothing is recovered from the provider." confirmLabel="Clear jobs" onConfirm={()=>{onRemove?.(removable.map(job=>job.id));setClearing(false);}} onCancel={()=>setClearing(false)}/>,document.body)}
  </>;
}
