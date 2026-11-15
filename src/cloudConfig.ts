/// <reference types="vite/client" />
/** Cloud settings are optional. No remote requests occur merely by importing this module. */
export type CloudConfig={
 enabled:boolean;
 supabaseUrl:string|null;
 publishableKey:string|null;
 error:string|null;
};
export function parseCloudConfig(url:unknown,key:unknown):CloudConfig{
 const rawUrl=typeof url==='string'?url.trim():'';
 const rawKey=typeof key==='string'?key.trim():'';
 if(!rawUrl&&!rawKey)return {enabled:false,supabaseUrl:null,publishableKey:null,error:null};
 if(!rawUrl||!rawKey)return {enabled:false,supabaseUrl:null,publishableKey:null,error:'Supabase URL과 Publishable Key를 모두 설정해야 합니다.'};
 let parsed:URL;
 try{parsed=new URL(rawUrl);}catch{return {enabled:false,supabaseUrl:null,publishableKey:null,error:'Supabase URL이 유효하지 않습니다.'};}
 if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co')||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'){
  return {enabled:false,supabaseUrl:null,publishableKey:null,error:'Supabase 프로젝트의 HTTPS 기본 URL을 입력해 주세요.'};
 }
 if(rawKey.length<15||/\s/.test(rawKey))return {enabled:false,supabaseUrl:null,publishableKey:null,error:'Supabase Publishable Key를 확인해 주세요.'};
 return {enabled:true,supabaseUrl:parsed.origin,publishableKey:rawKey,error:null};
}
// Supabase publishable keys are designed for public browser clients. Never place secret/service_role keys here.
// Environment variables override the project's public connection defaults.
export const cloudConfig=parseCloudConfig(
 import.meta.env.VITE_SUPABASE_URL || 'https://tihhjzwmlnisndlycgpe.supabase.co',
 import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pZ169DXpu9LWhz5OSM8JVQ_C9aYKdzX'
);
