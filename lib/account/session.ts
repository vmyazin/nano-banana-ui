import { accountRequest } from './client';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';
let refreshSequence=0;
export async function refreshAccount(signal?:AbortSignal) {
  const sequence=++refreshSequence;
  const epoch=useAccountStore.getState().epoch;
  try{
    const session=await accountRequest<AccountSession>('session',{signal});
    if(sequence===refreshSequence&&useAccountStore.getState().epoch===epoch&&!signal?.aborted)useAccountStore.getState().applySession(session);
    return session;
  }catch(error){if(sequence===refreshSequence&&useAccountStore.getState().epoch===epoch&&!signal?.aborted)useAccountStore.getState().unavailable();throw error;}
}
export function accountChanged(clear=false) {
  refreshSequence++;
  if(clear)useAccountStore.getState().clear();
  if(typeof window!=='undefined'){
    window.dispatchEvent(new Event('scene-account-changed'));
    if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('scene-account');channel.postMessage('changed');channel.close();}
  }
}
