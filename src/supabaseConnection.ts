import {cloudConfig} from './cloudConfig';
export type CloudConnectionState='idle'|'checking'|'connected'|'offline'|'error';
export type CloudCheck={state:CloudConnectionState;message:string};
/**
 * Read-only connectivity check. Does not sign in, create users, upload projects,
 * read private tables or modify IndexedDB. Safe for offline-first projects.
 */
export async function checkSupabaseConnection(signal?:AbortSignal):Promise<CloudCheck>{
 if(!cloudConfig.enabled||!cloudConfig.supabaseUrl||!cloudConfig.publishableKey){
  return {state:'error',message:cloudConfig.error||'Supabase 설정이 없습니다.'};
 }
 if(typeof navigator!=='undefined'&&!navigator.onLine){
  return {state:'offline',message:'오프라인입니다. 로컬 원고는 계속 사용할 수 있습니다.'};
 }
 const timeout=new AbortController();
 const timer=setTimeout(()=>timeout.abort(),10000);
 const cancel=()=>timeout.abort();
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  const response=await fetch(cloudConfig.supabaseUrl+'/auth/v1/settings',{
   method:'GET',headers:{apikey:cloudConfig.publishableKey},
   signal:timeout.signal,cache:'no-store'
  });
  if(!response.ok)return {state:'error',message:'Supabase 응답 오류 (HTTP '+response.status+'). 프로젝트 상태와 공개 키를 확인해 주세요.'};
  const body:unknown=await response.json();
  if(!body||typeof body!=='object')return {state:'error',message:'Supabase 인증 서비스의 응답 형식이 예상과 다릅니다.'};
  return {state:'connected',message:'Supabase 인증 서버에 연결되었습니다. 원고는 전송하지 않았습니다.'};
 }catch(e){
  if(signal?.aborted)return {state:'error',message:'연결 확인이 취소되었습니다.'};
  return {state:'offline',message:'Supabase에 연결할 수 없습니다. 네트워크와 프로젝트 상태를 확인해 주세요. 로컬 원고는 안전하게 유지됩니다.'};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
