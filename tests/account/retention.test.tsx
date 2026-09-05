import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TemporaryAssetNotice from '@/components/account/TemporaryAssetNotice';
import CloudJobList from '@/components/account/CloudJobList';
import type { CloudAsset, CloudJobView } from '@/lib/account/contracts';

const request={provider:'gemini' as const,modelId:'gemini-3-pro-image-preview',mediaType:'image' as const,inputMode:'text' as const,prompt:'Fixture result',values:{},referenceIds:[]};
describe('temporary cloud results',()=>{
  it('explains a download deadline and saving the existing result after freeing space',()=>{
    const asset:CloudAsset={id:'fixture',jobId:'job',kind:'image',mimeType:'image/png',bytes:68,createdAt:1,metadata:request,expiresAt:Date.now()+86400000};
    render(<TemporaryAssetNotice assets={[asset]}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Temporary results need storage space');
    expect(screen.getByRole('status').querySelector('time')).toHaveAttribute('dateTime',new Date(asset.expiresAt!).toISOString());
    expect(screen.getByRole('status')).toHaveTextContent('resume saving the existing job');
  });
  it('offers saving recovery for storage-full jobs without a new generation action',()=>{
    const job:CloudJobView={id:'job',provider:'gemini',request,state:'needs_attention',errorCode:'storage_full',createdAt:1,updatedAt:1};
    render(<CloudJobList jobs={[job]} onResume={vi.fn()}/>);
    expect(screen.getByText(/free library space and resume saving/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Resume existing job'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Generate/})).not.toBeInTheDocument();
  });
});

it('offers cancellation only before submission, including a queued click target',()=>{
  const onCancel=vi.fn();
  const jobs:CloudJobView[]=['queued','submitting','running','saved'].map((state,index)=>({id:`job-${index}`,provider:'gemini',request,state:state as CloudJobView['state'],errorCode:null,createdAt:1,updatedAt:1}));
  render(<CloudJobList jobs={jobs} onResume={vi.fn()} onCancel={onCancel}/>);
  expect(screen.getAllByRole('button',{name:'Cancel queued job'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Cancel queued job'}));
  expect(onCancel).toHaveBeenCalledWith('job-0');
});
