import {useEffect,useState} from 'react';
import {Cloud,CloudOff,RefreshCw,ShieldCheck} from 'lucide-react';
import {cloudConfig} from './cloudConfig';
import CloudAuth from './CloudAuth';
import CloudVault from './CloudVault';
import {checkSupabaseConnection,type CloudCheck} from './supabaseConnection';
export default function CloudConnection(){
 const [status,setStatus]=useState<CloudCheck>({state:'idle',message:'연결 상태를 확인할 수 있습니다.'});
 const [busy,setBusy]=useState(false);
 async function check(signal?:AbortSignal){
  setBusy(true);setStatus({state:'checking',message:'Supabase 연결 확인 중…'});
  try{const result=await checkSupabaseConnection(signal);if(!signal?.aborted)setStatus(result);}
  finally{if(!signal?.aborted)setBusy(false);}
 }
 useEffect(()=>{const controller=new AbortController();void check(controller.signal);return ()=>controller.abort();},[]);
 return <section className="cloud-connect-panel" aria-label="Supabase 클라우드 연결">
  <div className="cloud-connect-title">{status.state==='connected'?<ShieldCheck size={21}/>:status.state==='offline'?<CloudOff size={21}/>:<Cloud size={21}/>}
   <div><strong>Supabase 클라우드</strong><small>연결 준비 · 로컬 우선</small></div>
  </div>
  <p role="status">{status.message}</p>
  <div className="cloud-connect-actions">
   <span>{cloudConfig.enabled?'연결 대상: tihhjzwmlnisndlycgpe.supabase.co':'클라우드 설정 필요'}</span>
   <button className="button soft" disabled={busy} onClick={()=>void check()}><RefreshCw size={15}/>{busy?'확인 중…':'연결 다시 확인'}</button>
  </div>
  <CloudAuth/>
  <CloudVault/>
  <p className="cloud-connect-note">수동 암호화 백업은 명시적으로 실행할 때만 업로드됩니다. 실시간 동기화·Google Drive 연동은 아직 지원하지 않습니다. 원고 편집은 계속 로컬 우선으로 작동합니다.</p>
 </section>;
}
