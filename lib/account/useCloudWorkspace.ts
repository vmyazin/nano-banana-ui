'use client';
import { useRef, useState } from 'react';
import { useAccountStore } from '@/store/useAccountStore';
import { refreshAccount } from './session';
import { submitAccountJob, uploadAccountReferences } from './client';
import type { CloudJobRequest, CloudJobView, CloudProvider } from './contracts';

interface Pending { owner:string;signature:string;files:File[];token:string;request:CloudJobRequest }
export function useCloudWorkspace(provider:CloudProvider) {
  const session=useAccountStore(state=>state.session);
  const status=useAccountStore(state=>state.status);
  const [guestOverride,setGuestOverride]=useState(false);
  const [browserOwner,setBrowserOwner]=useState<string|null>(null);
  const pending=useRef<Pending|null>(null);
  const flight=useRef<Promise<CloudJobView>|null>(null);
  const hasJobs=useAccountStore(state=>state.jobs.some(job=>job.provider===provider));
  const owner=session?.account?.id;
  const signedIn=Boolean(owner);
  const uncertain=status==='unavailable'&&!session;
  const cloud=signedIn&&browserOwner!==owner||uncertain&&!guestOverride;
  const enabled=Boolean(session?.providers?.includes(provider));
  const connected=Boolean(session?.connections?.some(c=>c.provider===provider));
  async function perform(request:Omit<CloudJobRequest,'provider'|'referenceIds'>,files:File[]) {
    if(!owner||!cloud)throw new Error('Your account changed. Review the generation before starting it.');
    const current=await refreshAccount();
    if(current.account?.id!==owner)throw new Error('Your account changed. Review the generation before starting it.');
    if(!current.providers.includes(provider))throw new Error('Background generation is not available for this provider yet. You can explicitly choose browser-only generation below.');
    if(!current.connections.some(c=>c.provider===provider))throw new Error('Save this provider connection in your account before starting a background job.');
    const signature=JSON.stringify(request);
    let attempt=pending.current;
    if(!attempt||attempt.owner!==owner||attempt.signature!==signature||attempt.files.length!==files.length||files.some((file,i)=>file!==attempt!.files[i])){
      const ids=await uploadAccountReferences(files,undefined,owner);
      attempt={owner,signature,files:[...files],token:crypto.randomUUID(),request:{...request,provider,referenceIds:ids}};
      pending.current=attempt;
    }
    const {job}=await submitAccountJob(attempt.token,attempt.request,undefined,owner);
    const state=useAccountStore.getState();
    if(state.session?.account?.id===owner)state.applyJobs(owner,state.epoch,[job,...state.jobs.filter(j=>j.id!==job.id)],state.assets);
    pending.current=null;
    return job;
  }
  function submit(request:Omit<CloudJobRequest,'provider'|'referenceIds'>,files:File[]){
    if(flight.current)return flight.current;
    const promise=perform(request,files).finally(()=>{flight.current=null;});
    flight.current=promise;return promise;
  }
  return {signedIn,cloud,enabled,connected,hasJobs,uncertain,checking:status==='loading'||uncertain&&!guestOverride,unavailable:status==='unavailable',
    useBrowser:()=>{setBrowserOwner(owner||null);setGuestOverride(true);},useCloud:()=>{setBrowserOwner(null);setGuestOverride(false);},submit};
}
