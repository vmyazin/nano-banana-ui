// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
afterEach(()=>vi.unstubAllGlobals());
it('does not restore an old identity from a delayed session response after invalidation',async()=>{
  let deliver!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{deliver=resolve;})));
  const pending=refreshAccount();
  useAccountStore.getState().clear();
  deliver(Response.json({account:{id:'old-owner',name:'Old',email:'old@example.test'},googleEnabled:true,localSignIn:false,providers:[],connections:[]}));
  await pending;
  expect(useAccountStore.getState().session?.account).toBeNull();
  expect(useAccountStore.getState().jobs).toHaveLength(0);
});
