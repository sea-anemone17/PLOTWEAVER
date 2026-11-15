import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {CloudUpload,CloudDownload,RefreshCw,LockKeyhole} from 'lucide-react';
import {supabaseAuth} from './supabaseAuth';
import {listCloudBackups,uploadEncryptedWorkspace,restoreEncryptedWorkspace,type VaultEntry} from './cloudVault';

export default function CloudVault(){
 const [user,setUser]=useState<User|null>(null);
 const [entries,setEntries]=useState<VaultEntry[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(!supabaseAuth)return;
  let alive=true;
  void supabaseAuth.auth.getUser().then(({data})=>{if(alive)setUser(data.user);});
  const {data:{subscription}}=supabaseAuth.auth.onAuthStateChange((_event,session)=>{
   if(alive){setUser(session?.user??null);setEntries([]);setMessage('');}
  });
  return ()=>{alive=false;subscription.unsubscribe();};
 },[]);
 async function refresh(){
  setBusy(true);setMessage('');
  try{setEntries(await listCloudBackups());}
  catch(e){setMessage('목록을 읽지 못했습니다: '+String(e));}
  finally{setBusy(false);}
 }
 async function upload(){
  const password=prompt('클라우드 백업 암호를 입력하세요 (8자 이상). 이 암호는 복원에 필요하며 서버로 전송되지 않습니다.');
  if(password===null)return;
  if(password.length<8){setMessage('8자 이상의 암호가 필요합니다.');return;}
  const check=prompt('백업 암호를 한 번 더 입력하세요.');
  if(check!==password){setMessage('암호가 일치하지 않습니다. 업로드하지 않았습니다.');return;}
  if(!confirm('전체 작업 공간을 이 기기에서 암호화한 뒤 개인 비공개 저장소에 새 백업으로 추가합니다. 기존 백업은 변경하지 않습니다. 계속할까요?'))return;
  setBusy(true);setMessage('암호화 백업 생성 및 업로드 중…');
  try{
   await uploadEncryptedWorkspace(password);
   setEntries(await listCloudBackups());
   setMessage('암호화된 전체 작업 공간 백업을 새로 저장했습니다. 암호를 안전하게 보관하세요.');
  }catch(e){setMessage('업로드 실패 (기존 원고는 그대로입니다): '+String(e));}
  finally{setBusy(false);}
 }
 async function restore(name:string){
  const password=prompt('백업 암호를 입력하세요. 암호를 분실하면 복원할 수 없습니다.');
  if(password===null)return;
  if(!confirm('선택한 백업을 이 브라우저에 별도 복원본으로 추가합니다. 기존 원고는 덮어쓰지 않지만, 복원된 프로젝트와 연구 자료가 중복 생성됩니다. 계속할까요?'))return;
  setBusy(true);setMessage('암호화 백업 다운로드 및 검증 중…');
  try{
   const restored=await restoreEncryptedWorkspace(name,password);
   setMessage('복원 완료: 프로젝트 '+restored.length+'개를 별도 복원본으로 추가했습니다. 목록에서 확인해 주세요.');
  }catch(e){setMessage('복원 실패 (기존 원고는 그대로입니다): '+String(e));}
  finally{setBusy(false);}
 }
 if(!user)return <p className="cloud-connect-note">Google 로그인 후 비공개 암호화 백업을 사용할 수 있습니다.</p>;
 return <div className="cloud-vault-panel">
  <div className="cloud-connect-title"><LockKeyhole size={18}/><div><strong>암호화 클라우드 보관함</strong><small>수동 백업 · 자동 동기화 아님 · 기존 원고 보존</small></div></div>
  <p className="cloud-connect-note">전체 프로젝트·첨부파일·전역 연구 자료를 이 기기에서 암호화한 뒤 Supabase 비공개 저장소에 저장합니다. 암호를 분실하면 복원할 수 없습니다. 파일 크기 제한: 45MiB.</p>
  <div className="cloud-connect-actions">
   <button className="button soft" disabled={busy} onClick={()=>void upload()}><CloudUpload size={15}/> 새 암호화 백업</button>
   <button className="button soft" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/> 백업 목록 새로고침</button>
  </div>
  {entries.length>0&&<div className="cloud-vault-list">{entries.map(entry=><div key={entry.name} className="cloud-vault-row">
   <span>{entry.createdAt?new Date(entry.createdAt).toLocaleString('ko-KR'):entry.name}{entry.size!==null?' · '+(entry.size/1024/1024).toFixed(1)+'MiB':''}</span>
   <button className="button soft" disabled={busy} onClick={()=>void restore(entry.name)}><CloudDownload size={15}/> 복원본 추가</button>
  </div>)}</div>}
  {message&&<p role="status" className="cloud-connect-note">{message}</p>}
  <p className="cloud-connect-note">처음 사용하기 전에 Supabase SQL Editor에서 <code>supabase/migrations/20261115_private_cloud_vault.sql</code>을 실행해 비공개 버킷과 사용자별 RLS를 설정해야 합니다.</p>
 </div>;
}
