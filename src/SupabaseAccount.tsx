import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Button } from './UI';

export default function SupabaseAccount() {
 const [user, setUser] = useState<User | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 useEffect(() => {
  let active = true;
  void supabase.auth.getUser().then(({ data, error }) => {
   if (!active) return;
   setUser(data.user);
   if (error && error.name !== 'AuthSessionMissingError') setError(error.message);
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
   if (active) setUser(session?.user ?? null);
  });
  return () => { active = false; subscription.unsubscribe(); };
 }, []);
 async function signIn() {
  setBusy(true); setError('');
  try {
   const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL }
   });
   if (error) throw error;
  } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
 }
 async function signOut() {
  setBusy(true); setError('');
  const { error } = await supabase.auth.signOut();
  if (error) setError(error.message);
  setBusy(false);
 }
 return <section className="settings-panel">
  <h2>Supabase 계정</h2>
  <p className="muted">Google 계정으로 로그인할 수 있습니다. 로그인만으로 프로젝트가 서버에 업로드되지는 않습니다.</p>
  {user ? <>
   <p className="muted">로그인됨: {user.email || user.id}</p>
   <div className="settings-actions"><Button variant="soft" disabled={busy} onClick={() => void signOut()}>로그아웃</Button></div>
  </> : <div className="settings-actions"><Button disabled={busy} onClick={() => void signIn()}>{busy ? '로그인 중…' : 'Google 계정으로 로그인'}</Button></div>}
  {error && <p role="alert" className="muted">인증 오류: {error}</p>}
  <p className="muted small">암호화 백업 및 데이터 동기화는 서버 테이블·RLS 정책 확인 후 연결할 예정입니다.</p>
 </section>;
}
