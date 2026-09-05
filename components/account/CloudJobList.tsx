'use client';
import type { CloudJobState, CloudJobView } from '@/lib/account/contracts';
const labels:Record<CloudJobState,string>={queued:'Queued',submitting:'Starting',running:'Generating',saving:'Saving',saved:'Saved',needs_attention:'Needs attention',failed:'Failed',cancelled:'Cancelled'};
const tones:Record<CloudJobState,string>={queued:'text-sky-300',submitting:'text-sky-300',running:'text-violet-300',saving:'text-cyan-300',saved:'text-emerald-300',needs_attention:'text-amber-300',failed:'text-red-300',cancelled:'text-[var(--foreground-muted)]'};
export default function CloudJobList({jobs,onResume,busy=false,limit=5}:{jobs:CloudJobView[];onResume:(id:string)=>void;busy?:boolean;limit?:number}) {
  if(!jobs.length)return null;
  return <ul className="space-y-2">{jobs.slice(0,limit).map(job=><li key={job.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)]/40 p-3">
    <div className="flex items-center justify-between gap-3"><p className="truncate text-sm">{job.request.prompt}</p><span className={`shrink-0 text-xs font-semibold ${tones[job.state]}`}>{labels[job.state]}</span></div>
    {job.state==='needs_attention'&&<div className="mt-2 text-xs leading-relaxed text-amber-200"><p>{job.errorCode==='submission_ambiguous'?'The provider may have accepted this job. Check its history before starting another paid generation.':'Tracking or saving needs another attempt. Resume this job without generating again.'}</p>{job.errorCode!=='submission_ambiguous'&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 underline underline-offset-4">Resume existing job</button>}</div>}
    {job.state==='needs_attention'&&job.errorCode==='submission_ambiguous'&&job.request.mediaType==='image'&&['gemini','cloudflare','pollinations','comet'].includes(job.provider)&&<button disabled={busy} type="button" onClick={()=>onResume(job.id)} className="mt-2 text-xs text-amber-200 underline underline-offset-4">Check for a saved output</button>}
  </li>)}</ul>;
}
