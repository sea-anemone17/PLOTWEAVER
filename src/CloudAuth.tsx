import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {LogIn,LogOut} from 'lucide-react';
import {supabaseAuth} from './supabaseAuth';

export default function CloudAuth(){
 const [user,setUser]=useState<User|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(!supabaseAuth){setLoading(false);return;}
  let alive=true;
  void supabaseAuth.auth.getUser().then(({data,error})=>{
   if(alive){setUser(data.user);setLoading(false);if(error&&error.name!=='AuthSessionMissingError')setMessage('로그인 상태 확인 실패: '+error.message);}
  }).catch(()=>{if(alive){setLoading(false);setMessage('로그인 상태를 확인하지 못했습니다.');}});
  const {data:{subscription}}=supabaseAuth.auth.onAuthStateChange((_event,session)=>{
   if(alive){setUser(session?.user??null);setLoading(false);}
  });
  return ()=>{alive=false;subscription.unsubscribe();};
 },[]);
 async function signIn(){
  if(!supabaseAuth)return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabaseAuth.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:window.location.origin+import.meta.env.BASE_URL,skipBrowserRedirect:false}
   });
   if(error)throw error;
  }catch(error){setMessage('Google 로그인 시작 실패: '+String(error));setBusy(false);}
 }
 async function signOut(){
  if(!supabaseAuth)return;
  setBusy(true);setMessage('');
  try{const {error}=await supabaseAuth.auth.signOut();if(error)throw error;}
  catch(error){setMessage('로그아웃 실패: '+String(error));}
  finally{setBusy(false);}
 }
 return <div className="cloud-auth-panel">
  <strong>Google 계정</strong>
  {loading?<p>로그인 상태 확인 중…</p>:user?
   <><p>로그인됨: {user.email??'Google 사용자'}</p><button className="button soft" disabled={busy} onClick={()=>void signOut()}><LogOut size={15}/> 로그아웃</button></>:
   <><p>계정을 연결하면 로그인 상태를 확인할 수 있습니다.</p><button className="button soft" disabled={busy||!supabaseAuth} onClick={()=>void signIn()}><LogIn size={15}/> Google로 로그인</button></>}
  {message&&<p role="alert">{message}</p>}
  <p className="cloud-connect-note">Google OAuth 공급자 설정 전에는 로그인이 완료되지 않습니다. 로그인해도 원고·프로젝트 데이터는 업로드되지 않으며, 클라우드 동기화는 비활성 상태입니다.</p>
 </div>;
}
