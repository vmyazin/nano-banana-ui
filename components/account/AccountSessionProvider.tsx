'use client';
import { useEffect } from 'react';
import { accountRequest } from '@/lib/account/client';
import { refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
import type { CloudAsset, CloudJobView } from '@/lib/account/contracts';

export default function AccountSessionProvider({children}:{children:React.ReactNode}) {
  useEffect(()=>{
    const controller=new AbortController();let refreshing=false;
    const refresh=async()=>{
      if(refreshing||controller.signal.aborted)return;refreshing=true;
      try{
        const session=await refreshAccount(controller.signal);
        const state=useAccountStore.getState(),epoch=state.epoch;
        if(!session.account||state.session?.account?.id!==session.account.id)return;
        const [jobs,assets]=await Promise.all([
          accountRequest<{accountId:string;jobs:CloudJobView[]}>('jobs',{signal:controller.signal}),
          accountRequest<{accountId:string;assets:CloudAsset[]}>('assets',{signal:controller.signal}),
        ]);
        if(!controller.signal.aborted&&jobs.accountId===session.account.id&&assets.accountId===session.account.id)useAccountStore.getState().applyJobs(session.account.id,epoch,jobs.jobs,assets.assets);
      }catch{/* Preserve accepted jobs during a transient outage; never fall back to guest execution. */}
      finally{refreshing=false;}
    };
    const changed=()=>{useAccountStore.getState().clear();void refresh();};
    const focus=()=>void refresh();
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('scene-account'):null;
    if(channel)channel.onmessage=changed;
    window.addEventListener('scene-account-changed',focus);window.addEventListener('focus',focus);
    void refresh();const timer=setInterval(focus,5000);
    return()=>{controller.abort();clearInterval(timer);channel?.close();window.removeEventListener('scene-account-changed',focus);window.removeEventListener('focus',focus);};
  },[]);
  return children;
}
