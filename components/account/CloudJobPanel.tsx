'use client';
import { useState } from 'react';
import { Cloud, Download, Loader2 } from 'lucide-react';
import ResultStack from '@/components/ResultStack';
import LastFrameActions from '@/components/LastFrameActions';
import { downloadFilenameBase } from '@/lib/download-name';
import { useAccountStore } from '@/store/useAccountStore';
import { downloadAccountAsset } from '@/lib/account/download';
import { accountRequest } from '@/lib/account/client';
import type { CloudAsset, CloudJobRequest } from '@/lib/account/contracts';
import CloudJobList from './CloudJobList';
import { AccountSurface } from './AccountSurface';
import TemporaryAssetNotice from './TemporaryAssetNotice';
export default function CloudJobPanel({provider,modelId,mediaType,inputMode,onContinueFromFrame}:Pick<CloudJobRequest,'provider'|'modelId'|'mediaType'|'inputMode'> & {onContinueFromFrame?:()=>void}) {
  const allJobs=useAccountStore(state=>state.jobs),allAssets=useAccountStore(state=>state.assets);
  const [error,setError]=useState<string|null>(null),[downloading,setDownloading]=useState<string|null>(null);
  const jobs=allJobs.filter(j=>j.provider===provider&&j.request.modelId===modelId&&j.request.mediaType===mediaType&&j.request.inputMode===inputMode);
  const assets=allAssets.filter(a=>a.metadata.provider===provider&&a.metadata.modelId===modelId&&a.kind===mediaType&&a.metadata.inputMode===inputMode);
  const active=jobs.some(j=>['queued','submitting','running','saving'].includes(j.state));
  async function download(asset:CloudAsset){setDownloading(asset.id);try{await downloadAccountAsset(asset);}catch(error){setError(error instanceof Error?error.message:'Download failed.');}finally{setDownloading(null);}}
  async function resume(id:string){try{await accountRequest(`jobs/${id}/resume`,{method:'POST'});}catch(error){setError(error instanceof Error?error.message:'Could not resume this job.');}}
  return <AccountSurface label="Account generation results" className="flex min-h-[420px] flex-col gap-4">
    <div><h3 className="display flex items-center gap-2 text-base font-semibold"><Cloud size={17} className="text-cyan-300" aria-hidden="true"/>Result</h3><p className="mt-1 text-xs text-[var(--foreground-muted)]">Saved to your account when complete. You can leave this page.</p></div>
    <CloudJobList jobs={jobs} onResume={id=>void resume(id)} />
    <TemporaryAssetNotice assets={assets} />
    {mediaType==='image'?<ResultStack items={assets.map(a=>({id:a.id,src:`/api/account/assets/${a.id}/content`,mimeType:a.mimeType,label:a.expiresAt?'Temporary result':undefined}))} isGenerating={active} pendingLabel="Your background job is running." downloadingId={downloading} onDownload={item=>{const asset=assets.find(a=>a.id===item.id);if(asset)return download(asset);}} emptyState={<p className="p-5 text-center text-sm text-[var(--foreground-muted)]">Your saved images will appear here.</p>}/>:assets[0]?<><video controls crossOrigin="anonymous" src={`/api/account/assets/${assets[0].id}/content`} className="w-full rounded-xl bg-black"/><button type="button" disabled={Boolean(downloading)} onClick={()=>void download(assets[0])} className="btn-secondary justify-center"><Download size={16} aria-hidden="true"/>Download video</button></>:<div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--foreground-muted)]">{active&&<Loader2 className="animate-spin text-cyan-300" aria-hidden="true"/>}{active?'Your background video job is running.':'Your saved video will appear here.'}</div>}
    {mediaType==='video'&&assets[0]&&<LastFrameActions key={assets[0].id} videoUrl={`/api/account/assets/${assets[0].id}/content`} filenameBase={downloadFilenameBase({prompt:assets[0].metadata.prompt,mediaType:'video',provider,modelId})} onContinue={onContinueFromFrame}/>}
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
  </AccountSurface>;
}
