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

it('requires confirmation before stopping an attention job and hides the action in other states',()=>{
  const onDismiss=vi.fn();
  const jobs:CloudJobView[]=['needs_attention','queued','running'].map((state,index)=>({id:`dismiss-${index}`,provider:'gemini',request,state:state as CloudJobView['state'],errorCode:state==='needs_attention'?'submission_ambiguous':null,createdAt:1,updatedAt:1}));
  render(<CloudJobList jobs={jobs} onResume={vi.fn()} onDismiss={onDismiss}/>);
  expect(screen.getAllByRole('button',{name:'Stop tracking this job'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Stop tracking this job'}));
  expect(onDismiss).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('The provider may still finish and charge for this job.');
  fireEvent.click(screen.getByRole('button',{name:'Stop tracking'}));
  expect(onDismiss).toHaveBeenCalledWith('dismiss-0');
});

it('labels an explicitly dismissed failure as tracking stopped',()=>{
  const job:CloudJobView={id:'dismissed',provider:'gemini',request,state:'failed',errorCode:'tracking_stopped',createdAt:1,updatedAt:1};
  render(<CloudJobList jobs={[job]} onResume={vi.fn()}/>);
  expect(screen.getByText('Tracking stopped')).toBeInTheDocument();
  // One line per row, not the paragraph: the long form runs in the confirm
  // dialog, where the decision is actually made.
  expect(screen.getByText('The provider may have charged for this — check its history.')).toBeInTheDocument();
});

it('removes a finished job on request and offers no removal for one still running', () => {
  const onRemove=vi.fn();
  const jobs:CloudJobView[]=[
    {id:'stopped',provider:'gemini',request,state:'failed',errorCode:'tracking_stopped',createdAt:1,updatedAt:1},
    {id:'live',provider:'gemini',request,state:'running',errorCode:null,createdAt:1,updatedAt:1},
    {id:'waiting',provider:'gemini',request,state:'needs_attention',errorCode:'submission_ambiguous',createdAt:1,updatedAt:1},
  ];
  render(<CloudJobList jobs={jobs} onResume={vi.fn()} onRemove={onRemove}/>);
  const remove=screen.getAllByRole('button',{name:/^Remove /});
  expect(remove).toHaveLength(1);
  fireEvent.click(remove[0]);
  expect(onRemove).toHaveBeenCalledWith(['stopped']);
});

it('clears every finished job in one confirmed action, and offers no bulk clear for a single row', () => {
  const onRemove=vi.fn();
  const finished:CloudJobView[]=[
    {id:'stopped-a',provider:'gemini',request,state:'failed',errorCode:'tracking_stopped',createdAt:1,updatedAt:1},
    {id:'stopped-b',provider:'gemini',request,state:'failed',errorCode:'tracking_stopped',createdAt:1,updatedAt:1},
    {id:'cancelled',provider:'gemini',request,state:'cancelled',errorCode:null,createdAt:1,updatedAt:1},
    {id:'live',provider:'gemini',request,state:'running',errorCode:null,createdAt:1,updatedAt:1},
  ];
  const view=render(<CloudJobList jobs={[finished[0],finished[3]]} onResume={vi.fn()} onRemove={onRemove}/>);
  expect(screen.queryByRole('button',{name:/^Clear /})).not.toBeInTheDocument();

  view.rerender(<CloudJobList jobs={finished} onResume={vi.fn()} onRemove={onRemove}/>);
  fireEvent.click(screen.getByRole('button',{name:'Clear 3 finished jobs'}));
  expect(onRemove).not.toHaveBeenCalled();
  // One call, not three: the surfaces hold a single busy flag, so a burst of
  // separate calls would land only the first.
  fireEvent.click(screen.getByRole('button',{name:'Clear jobs'}));
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledWith(['stopped-a','stopped-b','cancelled']);
});

it('shows no removal controls on a surface that does not offer removal', () => {
  const jobs:CloudJobView[]=['failed','cancelled'].map((state,index)=>({id:`done-${index}`,provider:'gemini',request,state:state as CloudJobView['state'],errorCode:null,createdAt:1,updatedAt:1}));
  render(<CloudJobList jobs={jobs} onResume={vi.fn()}/>);
  expect(screen.queryByRole('button',{name:/^Remove /})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/^Clear /})).not.toBeInTheDocument();
});
