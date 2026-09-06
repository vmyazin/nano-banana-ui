'use client';
import { useEffect } from 'react';
import { accountRequest } from '@/lib/account/client';
import { isActiveJob } from '@/lib/account/job-status';
import { refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
import type { CloudAsset, CloudJobView } from '@/lib/account/contracts';

/** Fast enough that a finished background job shows up without a reload. */
const ACTIVE_POLL_MS=5000;
/** Idle heartbeat: catches sign-out or work from another device without
 *  hammering the account for a page that has nothing running. */
const IDLE_POLL_MS=60000;

export default function AccountSessionProvider({children}:{children:React.ReactNode}) {
  useEffect(()=>{
    const controller=new AbortController();let refreshing=false;let lastFull=0;
    const readWork=async(owner:string,epoch:number)=>{
      const [jobs,assets]=await Promise.all([
        accountRequest<{accountId:string;jobs:CloudJobView[]}>('jobs',{signal:controller.signal}),
        accountRequest<{accountId:string;assets:CloudAsset[]}>('assets',{signal:controller.signal}),
      ]);
      if(!controller.signal.aborted&&jobs.accountId===owner&&assets.accountId===owner)useAccountStore.getState().applyJobs(owner,epoch,jobs.jobs,assets.assets);
    };
    /** Full: re-check the session first, then the work. Light: the work only —
     *  the session was confirmed moments ago and a stale id is rejected by the
     *  owner check on the response. */
    const refresh=async(mode:'full'|'light'='full')=>{
      if(refreshing||controller.signal.aborted)return;refreshing=true;
      try{
        if(mode==='full'){
          const session=await refreshAccount(controller.signal);
          lastFull=Date.now();
          const state=useAccountStore.getState();
          if(!session.account||state.session?.account?.id!==session.account.id)return;
          await readWork(session.account.id,state.epoch);
        }else{
          const state=useAccountStore.getState(),owner=state.session?.account?.id;
          if(owner)await readWork(owner,state.epoch);
        }
      }catch{/* Preserve accepted jobs during a transient outage; never fall back to guest execution. */}
      finally{refreshing=false;}
    };
    const changed=()=>{useAccountStore.getState().clear();void refresh();};
    const focus=()=>void refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    // One timer, two speeds: a hidden tab polls nothing, a tab with work in
    // flight reads it every tick, and an idle tab only re-confirms the session
    // on the heartbeat. The previous unconditional 5 s loop hit three endpoints
    // forever, on every open tab, with nothing running.
    const tick=()=>{
      if(document.visibilityState==='hidden')return;
      const state=useAccountStore.getState();
      if(state.session?.account&&state.jobs.some(isActiveJob))void refresh('light');
      else if(Date.now()-lastFull>=IDLE_POLL_MS)void refresh();
    };
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('scene-account'):null;
    if(channel)channel.onmessage=changed;
    window.addEventListener('scene-account-changed',focus);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    void refresh();const timer=setInterval(tick,ACTIVE_POLL_MS);
    return()=>{controller.abort();clearInterval(timer);channel?.close();window.removeEventListener('scene-account-changed',focus);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return children;
}
