// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountRequest } from '@/lib/account/client';
import { useAccountStore } from '@/store/useAccountStore';
afterEach(()=>vi.unstubAllGlobals());
describe('account transport identity',()=>{
  it('binds mutations to the initiating owner but lets session refresh discover an account change',async()=>{
    useAccountStore.getState().applySession({account:{id:'owner',name:'Owner',email:'owner@example.test'},googleEnabled:true,localSignIn:false,providers:[],connections:[]});
    const fetcher=vi.fn().mockImplementation(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
    await accountRequest('jobs',{method:'POST'});
    await accountRequest('session');
    await accountRequest('jobs',{method:'POST',headers:{'X-Account-Id':'original-owner'}});
    expect(fetcher.mock.calls[0][1].headers.get('x-account-id')).toBe('owner');
    expect(fetcher.mock.calls[1][1].headers.has('x-account-id')).toBe(false);
    expect(fetcher.mock.calls[2][1].headers.get('x-account-id')).toBe('original-owner');
  });
});
