import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import JobQueueOverlay from '@/components/account/JobQueueOverlay';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';
import { useJobQueueStore } from '@/store/useJobQueueStore';
import type { CloudJobState, CloudJobView } from '@/lib/account/contracts';

const session: AccountSession = {account:{id:'owner',name:'Owner',email:'owner@example.test'},googleEnabled:true,localSignIn:false,providers:['runware'],connections:[]};
function job(id:string,state:CloudJobState,over:Partial<CloudJobView>={}):CloudJobView {
  return {id,provider:'runware',state,errorCode:null,createdAt:1,updatedAt:1,
    request:{provider:'runware',modelId:'bytedance:seedance@2.0-mini',mediaType:'video',inputMode:'text',prompt:'A canal at dusk',values:{},referenceIds:[]},...over};
}
function show(jobs:CloudJobView[]) {
  const state=useAccountStore.getState();
  state.applyJobs('owner',state.epoch,jobs,[]);
  render(<JobQueueOverlay/>);
}
beforeEach(()=>{
  vi.clearAllMocks();
  useAccountStore.getState().applySession(session);
  useJobQueueStore.setState({dismissed:[]});
});

describe('job queue overlay',()=>{
  it('names the media and model of each job still in flight',()=>{
    show([job('a','running'),job('b','queued')]);
    expect(screen.getAllByText('Video, Seedance 2.0 Mini')).toHaveLength(2);
    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });
  it('falls back to the raw id for a provider the catalogs do not carry',()=>{
    // `local-test` is a real CloudProvider that reaches the browser in local
    // development, and the shared catalog throws on any key it does not hold.
    show([job('a','running',{provider:'local-test',request:{provider:'local-test',modelId:'local-test',mediaType:'image',inputMode:'text',prompt:'x',values:{},referenceIds:[]}})]);
    expect(screen.getByText('Image, local-test')).toBeInTheDocument();
  });
  it('names each fixed-engine model rather than its API id',()=>{
    show([job('a','running',{provider:'gemini',request:{provider:'gemini',modelId:'gemini-3-pro-image-preview',mediaType:'image',inputMode:'text',prompt:'x',values:{},referenceIds:[]}})]);
    expect(screen.getByText('Image, Gemini 3 Pro Image')).toBeInTheDocument();
  });
  it('renders nothing when no job is in flight',()=>{
    show([job('a','saved'),job('b','cancelled')]);
    expect(screen.queryByLabelText('Job queue')).toBeNull();
  });
  it('drops a finished job but keeps one that needs a person',()=>{
    show([job('a','saved'),job('b','needs_attention',{errorCode:'storage_full'}),job('c','failed')]);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
  it('hides a dismissed row without touching the account',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    show([job('a','failed')]);
    fireEvent.click(screen.getByRole('button',{name:'Dismiss Video, Seedance 2.0 Mini'}));
    expect(screen.queryByLabelText('Job queue')).toBeNull();
    // Dismissal is a view state. Stopping tracking is a separate, confirmed action.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAccountStore.getState().jobs).toHaveLength(1);
    vi.unstubAllGlobals();
  });
  it('offers no dismiss on a job that is still running',()=>{
    show([job('a','running')]);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('names a tracking-stopped job by what happened to it',()=>{
    show([job('a','failed',{errorCode:'tracking_stopped'})]);
    expect(screen.getByText('Tracking stopped')).toBeInTheDocument();
  });
  it('sends overflow to the account page rather than growing',()=>{
    show(['a','b','c','d','e','f','g'].map(id=>job(id,'running')));
    expect(screen.getAllByText('Video, Seedance 2.0 Mini')).toHaveLength(5);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
