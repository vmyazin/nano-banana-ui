'use client';
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { accountRequest } from '@/lib/account/client';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';

export default function AccountDeletion({ownerId,variant='panel'}:{ownerId:string;variant?:'panel'|'rail'}) {
  const [confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const pending=useRef(false);
  async function remove(){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError(null);
    try{
      await accountRequest('profile',{method:'DELETE',headers:{'X-Account-Id':ownerId}});
      if(useAccountStore.getState().session?.account?.id===ownerId){
        accountChanged(true);await refreshAccount();
        toast.success('Account deleted. Cloud files are queued for removal.');
      }
    }catch(error){setError(error instanceof Error?error.message:'Could not delete your account.');}
    finally{pending.current=false;setBusy(false);setConfirming(false);}
  }
  const dialog=<ConfirmDialog open={confirming} title="Permanently delete your account?" description="All sessions will end and saved keys and cloud files will become inaccessible immediately. File removal continues in the background. Generations already accepted by a provider may still be billed. Download anything you want to keep first." confirmLabel={busy?'Deleting…':'Delete account'} onConfirm={()=>void remove()} onCancel={()=>{if(!busy)setConfirming(false);}}/>;
  if(variant==='rail')return <section aria-label="Delete account">
    <p className="text-[11px] leading-relaxed text-[var(--foreground-subtle)]">Permanently remove your account, saved keys and cloud library. Browser-only work stays on this device.</p>
    {/* Underline stays on the words only: carrying it under the glyph makes
        the icon read as part of the link text. */}
    <button type="button" disabled={busy} onClick={()=>setConfirming(true)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-red-300 transition-colors hover:text-red-200 disabled:opacity-50"><Trash2 size={13} aria-hidden="true"/><span className="underline underline-offset-4">{busy?'Deleting…':'Delete account and cloud files'}</span></button>
    {error&&<p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
    {dialog}
  </section>;
  return <section className="mt-6 rounded-xl border border-red-300/20 p-4" aria-label="Delete account">
    <h2 className="text-sm font-semibold text-[var(--foreground)]">Delete account</h2>
    <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">Permanently remove your account, saved keys and cloud library. Browser-only work stays on this device.</p>
    <button type="button" disabled={busy} onClick={()=>setConfirming(true)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300/40 bg-red-300/10 px-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-300/20 disabled:opacity-50"><Trash2 size={15} aria-hidden="true"/>{busy?'Deleting…':'Delete account and cloud files'}</button>
    {error&&<p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    {dialog}
  </section>;
}
