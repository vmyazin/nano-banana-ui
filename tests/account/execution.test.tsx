import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';
import { useCloudWorkspace } from '@/lib/account/useCloudWorkspace';
import { useAppStore } from '@/store/useAppStore';
import { useKieJobsStore } from '@/store/useKieJobsStore';
import { useDraftStore } from '@/store/useDraftStore';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import type { CloudJobView } from '@/lib/account/contracts';
import GenerationInterface from '@/components/GenerationInterface';
import ProviderVideoWorkspace from '@/components/ProviderVideoWorkspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FEATURES } from '@/types';
import { useProviderJobsStore } from '@/store/useProviderJobsStore';
const {refresh,upload,submit,guestSubmit}=vi.hoisted(()=>({refresh:vi.fn(),upload:vi.fn(),submit:vi.fn(),guestSubmit:vi.fn()}));
vi.mock('@/lib/account/session',()=>({refreshAccount:refresh}));
vi.mock('@/lib/account/client',()=>({uploadAccountReferences:upload,submitAccountJob:submit,accountRequest:vi.fn(),accountAssetUrl:vi.fn()}));
vi.mock('@/lib/kie/browser',()=>({submitKieJob:guestSubmit,uploadKieFiles:vi.fn().mockResolvedValue([]),fetchKieCredits:vi.fn().mockResolvedValue(null)}));
const session:AccountSession={account:{id:'owner',name:'Owner',email:'owner@example.test'},googleEnabled:true,localSignIn:false,providers:['kie'],connections:[{id:'connection',provider:'kie',hint:'test',revision:1}]};
const request={modelId:'nano-banana-pro',mediaType:'image' as const,inputMode:'text' as const,prompt:'Product photo',values:{}};
const job:CloudJobView={id:'account-job',provider:'kie',state:'queued',errorCode:null,request:{...request,provider:'kie',referenceIds:[]},createdAt:1,updatedAt:1};
beforeEach(()=>{
  vi.clearAllMocks();useAccountStore.getState().applySession(session);refresh.mockResolvedValue(session);upload.mockResolvedValue([]);submit.mockResolvedValue({job});
  useKieJobsStore.getState().clearJobs();useDraftStore.getState().reset();useAppStore.setState({kieApiKey:'',kieImageModel:'nano-banana-pro'});
});
describe('account execution and isolation',()=>{
  it('uses the common image workspace account connection without a browser key',async()=>{
    const geminiSession:AccountSession={...session,providers:['gemini'],connections:[{id:'gemini-connection',provider:'gemini',revision:1,hint:'test'}]};
    useAccountStore.getState().applySession(geminiSession);refresh.mockResolvedValue(geminiSession);
    useAppStore.setState({engine:'gemini',apiKey:''});
    render(<QueryClientProvider client={new QueryClient()}><GenerationInterface feature={FEATURES.find(f=>f.id==='text-to-image')!} apiKey="" onBack={()=>{}} onOpenConnections={()=>{}}/></QueryClientProvider>);
    fireEvent.change(screen.getByRole('textbox',{name:'Prompt'}),{target:{value:'Account image request'}});
    fireEvent.click(screen.getByRole('button',{name:/Generate Image/i}));
    await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][1]).toMatchObject({provider:'gemini',modelId:'gemini-3-pro-image-preview',prompt:'Account image request',mediaType:'image'});
    expect(submit.mock.calls[0][1]).not.toHaveProperty('apiKey');
  });
  it('submits aggregator cloud video without adding a guest video job',async()=>{
    const runwareSession:AccountSession={...session,providers:['runware'],connections:[{id:'runware-connection',provider:'runware',revision:1,hint:'test'}]};
    useAccountStore.getState().applySession(runwareSession);refresh.mockResolvedValue(runwareSession);
    useAppStore.setState({runwareApiKey:'',runwareVideoModel:'lightricks:ltx@2.5-fast'});useProviderJobsStore.getState().clearJobs();
    render(<ProviderVideoWorkspace provider="runware" label="Runware" inputMode="text" onBack={()=>{}} onOpenConnections={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Prompt'}),{target:{value:'Account video request'}});
    fireEvent.click(screen.getByRole('button',{name:'Generate video'}));
    await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][1]).toMatchObject({provider:'runware',mediaType:'video',values:{durationSeconds:6,size:'720p · 16:9'}});
    expect(useProviderJobsStore.getState().jobs).toHaveLength(0);
  });
  it('submits with a saved account connection without reading a guest key or creating a guest job',async()=>{
    render(<KieGenerationWorkspace mediaType="image" inputMode="text" onBack={()=>{}} onOpenConnections={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Prompt'}),{target:{value:'Product photo'}});
    fireEvent.click(screen.getByRole('button',{name:'Generate image'}));
    await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][1]).toMatchObject({provider:'kie',prompt:'Product photo'});
    expect(submit.mock.calls[0][1]).not.toHaveProperty('apiKey');
    expect(submit.mock.calls[0][3]).toBe('owner');
    expect(guestSubmit).not.toHaveBeenCalled();expect(useKieJobsStore.getState().jobs).toHaveLength(0);
    expect(await screen.findByText('Queued')).toBeInTheDocument();
  });
  it('reuses its intake token after a lost response and coalesces double-clicks',async()=>{
    submit.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({job});
    const {result}=renderHook(()=>useCloudWorkspace('kie'));
    await act(async()=>{await expect(result.current.submit(request,[])).rejects.toThrow('Response lost');});
    await act(async()=>{await Promise.all([result.current.submit(request,[]),result.current.submit(request,[])]);});
    expect(submit).toHaveBeenCalledTimes(2);expect(upload).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toBe(submit.mock.calls[1][0]);
  });
  it('does not submit when the server reports another account',async()=>{
    refresh.mockResolvedValue({...session,account:{...session.account!,id:'other'}});
    const {result}=renderHook(()=>useCloudWorkspace('kie'));
    await act(async()=>{await expect(result.current.submit(request,[])).rejects.toThrow(/account changed/);});
    expect(upload).not.toHaveBeenCalled();expect(submit).not.toHaveBeenCalled();
  });
  it('drops delayed account results after sign-out or switching accounts',()=>{
    const epoch=useAccountStore.getState().epoch;
    useAccountStore.getState().applyJobs('owner',epoch,[job],[]);
    useAccountStore.getState().clear();
    useAccountStore.getState().applySession({...session,account:{...session.account!,id:'other'}});
    useAccountStore.getState().applyJobs('owner',epoch,[job],[]);
    expect(useAccountStore.getState().jobs).toHaveLength(0);
    expect(useAppStore.getState().kieApiKey).toBe('');
  });
  it('never silently falls back when account capacity or provider availability rejects a job',async()=>{
    submit.mockRejectedValue(new Error('Storage quota is full.'));
    render(<KieGenerationWorkspace mediaType="image" inputMode="text" onBack={()=>{}} onOpenConnections={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Prompt'}),{target:{value:'Product photo'}});
    fireEvent.click(screen.getByRole('button',{name:'Generate image'}));
    expect(await screen.findByText('Storage quota is full.')).toBeInTheDocument();
    expect(guestSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Use browser-only generation instead'}));
    expect(screen.getByText(/Keep this tab open/)).toBeInTheDocument();
  });
});
