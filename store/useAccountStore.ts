import { create } from 'zustand';
import type { CloudAsset, CloudJobView, CloudProvider } from '@/lib/account/contracts';

export interface AccountIdentity { id:string; name:string; email:string; picture?:string|null }
export interface AccountConnection { id:string;provider:string;revision:number;hint:string }
export interface AccountSession {
  account:AccountIdentity|null;googleEnabled:boolean;localSignIn:boolean;
  providers:CloudProvider[];connections:AccountConnection[];
}
interface AccountState {
  session:AccountSession|null;
  status:'loading'|'ready'|'unavailable';
  epoch:number;
  jobs:CloudJobView[];
  assets:CloudAsset[];
  applySession:(session:AccountSession)=>void;
  clear:()=>void;
  unavailable:()=>void;
  applyJobs:(owner:string,epoch:number,jobs:CloudJobView[],assets:CloudAsset[])=>void;
}
/** Account data is memory-only. Guest keys, gallery and ledger are never overwritten. */
export const useAccountStore=create<AccountState>((set)=>({
  session:null,status:'loading',epoch:0,jobs:[],assets:[],
  applySession:session=>set(state=>{
    const changed=state.session?.account?.id!==session.account?.id;
    return {session,status:'ready',...(changed?{epoch:state.epoch+1,jobs:[],assets:[]}:{} )};
  }),
  clear:()=>set(state=>({session:state.session?{...state.session,account:null,connections:[]}:null,status:'loading',epoch:state.epoch+1,jobs:[],assets:[]})),
  unavailable:()=>set({status:'unavailable'}),
  applyJobs:(owner,epoch,jobs,assets)=>set(state=>state.epoch===epoch&&state.session?.account?.id===owner?{jobs,assets}:{}),
}));
