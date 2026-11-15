import {describe,it,expect} from 'vitest';
import {parseCloudConfig} from '../src/cloudConfig';
describe('optional cloud configuration',()=>{
 it('keeps cloud disabled by default without interfering with offline mode',()=>{
  expect(parseCloudConfig(undefined,undefined)).toEqual({enabled:false,supabaseUrl:null,publishableKey:null,error:null});
 });
 it('rejects incomplete settings',()=>{
  const result=parseCloudConfig('https://sample.supabase.co',undefined);
  expect(result.enabled).toBe(false);expect(result.error).toContain('모두');
 });
 it('rejects unsafe URLs and secrets passed as URL parameters',()=>{
  for(const url of ['http://sample.supabase.co','https://sample.supabase.co/?secret=123','https://example.com','invalid']){
   expect(parseCloudConfig(url,'sb_publishable_example_key_123').enabled).toBe(false);
  }
 });
 it('accepts a valid public client configuration without contacting the network',()=>{
  const result=parseCloudConfig('https://sample.supabase.co','sb_publishable_example_key_123');
  expect(result.enabled).toBe(true);
  expect(result.supabaseUrl).toBe('https://sample.supabase.co');
 });
});
