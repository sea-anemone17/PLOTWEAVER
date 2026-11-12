import {describe,it,expect,vi,afterEach} from 'vitest';
import {checkSupabaseConnection} from '../src/supabaseConnection';
afterEach(()=>vi.unstubAllGlobals());
describe('read-only Supabase connection',()=>{
 it('checks auth settings without sending manuscript content',async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({external:{google:false}})}));
  vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('navigator',{onLine:true});
  expect((await checkSupabaseConnection()).state).toBe('connected');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toContain('/auth/v1/settings');
  expect(fetcher.mock.calls[0][1].method).toBe('GET');
 });
 it('leaves local writing available when offline',async()=>{
  const fetcher=vi.fn();
  vi.stubGlobal('fetch',fetcher);vi.stubGlobal('navigator',{onLine:false});
  expect((await checkSupabaseConnection()).state).toBe('offline');
  expect(fetcher).not.toHaveBeenCalled();
 });
});
