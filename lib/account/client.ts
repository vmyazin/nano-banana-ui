import { useAccountStore } from '@/store/useAccountStore';
import type { CloudJobRequest, CloudJobView } from './contracts';
import { RouteError } from '@/lib/providers/route-error';

export async function accountRequest<T>(path:string,init:RequestInit={}):Promise<T> {
  const headers=new Headers(init.headers);
  const owner=useAccountStore.getState().session?.account?.id;
  if(owner&&path!=='session'&&!headers.has('X-Account-Id'))headers.set('X-Account-Id',owner);
  const response=await fetch(`/api/account/${path}`,{...init,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new RouteError(data.error||'Your account request could not be completed.',response.status);
  return data as T;
}
const post=(body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

/** Upload bytes straight to the scoped Worker URL, never through Vercel's body limit. */
export async function uploadAccountReferences(files:File[],signal?:AbortSignal,owner?:string):Promise<string[]> {
  const ids:string[]=[];
  try{
    for(const file of files){
      const upload=await accountRequest<{id:string;url:string}>('uploads',{...post({bytes:file.size,mimeType:file.type}),signal,headers:{'Content-Type':'application/json',...(owner?{'X-Account-Id':owner}:{})}});
      ids.push(upload.id);
      const response=await fetch(upload.url,{method:'PUT',headers:{'Content-Type':file.type},body:file,signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('Could not upload this reference. Please try again.');
    }
    return ids;
  }catch(error){
    // Intake has not happened yet. Release only references from this operation.
    await Promise.allSettled(ids.map(id=>accountRequest(`uploads/${id}`,{method:'DELETE',headers:owner?{'X-Account-Id':owner}:undefined})));
    throw error;
  }
}
/** Caller keeps the token for retries; an uncertain response must reuse it. */
export async function submitAccountJob(token:string,request:CloudJobRequest,signal?:AbortSignal,owner?:string) {
  return accountRequest<{job:CloudJobView}>('jobs',{...post({token,request}),signal,headers:{'Content-Type':'application/json',...(owner?{'X-Account-Id':owner}:{})}});
}
export async function accountAssetUrl(id:string,signal?:AbortSignal) {
  return (await accountRequest<{url:string;expiresAt:number}>(`assets/${id}/access`,{method:'POST',signal})).url;
}
