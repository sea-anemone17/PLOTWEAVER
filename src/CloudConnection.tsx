import {useEffect,useState} from 'react';
import {Cloud,CloudOff,RefreshCw,ShieldCheck} from 'lucide-react';
import {cloudConfig} from './cloudConfig';
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
  <p className="cloud-connect-note">현재는 서버 연결만 확인합니다. 로그인·원고 업로드·동기화·Google Drive 백업은 아직 활성화되지 않았습니다. 기존 프로젝트는 이 기기에만 저장됩니다.</p>
 </section>;
}
