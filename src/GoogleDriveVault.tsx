import {useState} from 'react';
import {HardDrive,CloudUpload,CloudDownload,RefreshCw,Unplug} from 'lucide-react';
import {DRIVE_CLIENT_ID,connectDrive,disconnectDrive,driveConnected,listDriveBackups,uploadDriveBackup,restoreDriveBackup,type DriveBackup} from './googleDrive';

export default function GoogleDriveVault(){
 const [connected,setConnected]=useState(driveConnected());
 const [entries,setEntries]=useState<DriveBackup[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function run(work:()=>Promise<void>){
  setBusy(true);setMessage('');
  try{await work();}catch(error){setMessage(String(error));}finally{setBusy(false);setConnected(driveConnected());}
 }
 async function refresh(){setEntries(await listDriveBackups());}
 async function upload(){
  const password=prompt('Google Drive 백업 암호를 입력하세요 (8자 이상). 복원할 때 필요합니다.');
  if(password===null)return;
  if(password.length<8)throw Error('암호는 8자 이상이어야 합니다.');
  const again=prompt('백업 암호를 다시 입력하세요.');
  if(again!==password)throw Error('암호가 일치하지 않습니다.');
  if(!confirm('현재 전체 작업 공간을 암호화하여 Google Drive에 새 파일로 저장합니다. 기존 파일은 변경하지 않습니다.'))return;
  await uploadDriveBackup(password);await refresh();setMessage('Google Drive에 암호화 백업을 저장했습니다.');
 }
 async function restore(entry:DriveBackup){
  const password=prompt('복원할 백업의 암호를 입력하세요.');
  if(password===null)return;
  if(!confirm('기존 원고는 덮어쓰지 않고 별도 복원본을 추가합니다. 계속할까요?'))return;
  const restored=await restoreDriveBackup(entry,password);
  setMessage('Google Drive 백업에서 프로젝트 '+restored.length+'개를 별도 복원했습니다.');
 }
 return <section className="cloud-vault-panel" aria-label="Google Drive 암호화 백업">
  <div className="cloud-connect-title"><HardDrive size={18}/><div><strong>Google Drive 암호화 백업</strong><small>선택적 권한 · 수동 백업 · 자동 동기화 아님</small></div></div>
  <p className="cloud-connect-note">Google 로그인과 Drive 접근 권한은 별개입니다. Drive 연결 시 앱에서 생성한 파일에 접근하는 제한된 권한을 요청합니다. 백업 암호는 Google에 전송하지 않습니다.</p>
  {!DRIVE_CLIENT_ID?<p className="cloud-connect-note">Google Cloud Console에서 Drive API를 활성화하고 OAuth 웹 클라이언트 ID를 VITE_GOOGLE_DRIVE_CLIENT_ID에 설정해야 합니다. 설정 전에는 연결할 수 없습니다.</p>:
   <div className="cloud-connect-actions">
    {!connected?<button className="button soft" disabled={busy} onClick={()=>void run(async()=>{await connectDrive();setConnected(true);await refresh();})}><HardDrive size={15}/> Google Drive 연결</button>:
     <>
      <button className="button soft" disabled={busy} onClick={()=>void run(upload)}><CloudUpload size={15}/> Drive에 새 백업</button>
      <button className="button soft" disabled={busy} onClick={()=>void run(refresh)}><RefreshCw size={15}/> 목록 새로고침</button>
      <button className="button soft" disabled={busy} onClick={()=>{disconnectDrive();setConnected(false);setEntries([]);setMessage('Drive 연결을 해제했습니다.');}}><Unplug size={15}/> 연결 해제</button>
     </>
    }
   </div>}
  {entries.length>0&&<div className="cloud-vault-list">{entries.map(entry=><div key={entry.id} className="cloud-vault-row">
   <span>{entry.createdTime?new Date(entry.createdTime).toLocaleString('ko-KR'):entry.name}</span>
   <button className="button soft" disabled={busy} onClick={()=>void run(()=>restore(entry))}><CloudDownload size={15}/> 복원본 추가</button>
  </div>)}</div>}
  {message&&<p className="cloud-connect-note" role="status">{message}</p>}
 </section>;
}
