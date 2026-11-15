import {buildWorkspacePackage,restorePackage} from './backupZip';
import {encryptBackup,decryptBackup} from './encryptedBackup';
import {isSafeVaultName,CLOUD_VAULT_LIMIT} from './cloudVault';

// Drive-specific, least-privilege authorization. Google login through Supabase does NOT grant Drive access.
// Token lives only in memory and is never persisted.
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const DRIVE_CLIENT_ID=(import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID||'').trim();
const API='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size';
let token='';
let tokenClient:TokenClient|null=null;
type TokenResponse={access_token?:string;error?:string;error_description?:string};
type TokenClient={requestAccessToken:(options:{prompt:string})=>void};
type GIS={accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;callback:(response:TokenResponse)=>void;error_callback?:(error:{type:string})=>void})=>TokenClient;revoke:(token:string,callback:()=>void)=>void}}};
declare global {interface Window {google?:GIS}}
export type DriveBackup={id:string;name:string;createdTime:string;size?:string};
export function driveConfigured(){return !!DRIVE_CLIENT_ID;}
export function isDriveBackup(value:DriveBackup){return !!value.id&&isSafeVaultName(value.name);}
function loadGIS():Promise<GIS>{
 if(window.google?.accounts?.oauth2)return Promise.resolve(window.google);
 return new Promise((resolve,reject)=>{
  const existing=document.querySelector<HTMLScriptElement>('script[data-plotweaver-gis]');
  const script=existing||document.createElement('script');
  const timeout=window.setTimeout(()=>reject(Error('Google 인증 스크립트 로딩 시간 초과')),15000);
  const ok=()=>{window.clearTimeout(timeout);if(window.google?.accounts?.oauth2)resolve(window.google);else reject(Error('Google 인증 기능을 불러오지 못했습니다.'));};
  const fail=()=>{window.clearTimeout(timeout);reject(Error('Google 인증 스크립트 로딩 실패'));};
  script.addEventListener('load',ok,{once:true});script.addEventListener('error',fail,{once:true});
  if(!existing){script.dataset.plotweaverGis='true';script.src='https://accounts.google.com/gsi/client';script.async=true;document.head.append(script);}
 });
}
export async function connectDrive(){
 if(!DRIVE_CLIENT_ID)throw Error('VITE_GOOGLE_DRIVE_CLIENT_ID 설정이 필요합니다.');
 const gis=await loadGIS();
 return new Promise<void>((resolve,reject)=>{
  tokenClient=gis.accounts.oauth2.initTokenClient({
   client_id:DRIVE_CLIENT_ID,scope:DRIVE_SCOPE,
   callback:(response)=>{
    if(response.error||!response.access_token){reject(Error(response.error_description||response.error||'Google Drive 권한을 받지 못했습니다.'));return;}
    token=response.access_token;resolve();
   },
   error_callback:(error)=>reject(Error('Google Drive 권한 요청 실패: '+error.type))
  });
  tokenClient.requestAccessToken({prompt:'consent'});
 });
}
export function driveConnected(){return !!token;}
export function disconnectDrive(){
 const current=token;token='';tokenClient=null;
 if(current&&window.google?.accounts?.oauth2)window.google.accounts.oauth2.revoke(current,()=>{});
}
async function driveFetch(url:string,init:RequestInit={}){
 if(!token)throw Error('먼저 Google Drive 연결 버튼을 눌러 주세요.');
 const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+token);
 const response=await fetch(url,{...init,headers});
 if(response.status===401){token='';throw Error('Google Drive 권한이 만료되었습니다. 다시 연결해 주세요.');}
 if(!response.ok){
  let detail='';try{const json=await response.json();detail=json.error?.message||'';}catch{}
  throw Error('Google Drive 요청 실패 ('+response.status+'): '+detail);
 }
 return response;
}
function newName(){return 'workspace-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.pwenc';}
export async function listDriveBackups():Promise<DriveBackup[]>{
 const query=new URLSearchParams({q:"trashed = false and name contains 'workspace-' and mimeType = 'application/octet-stream'",fields:'nextPageToken,files(id,name,createdTime,size)',page_size:'100',orderBy:'createdTime desc'});
 const response=await driveFetch(API+'?'+query);
 const data=await response.json() as {files?:DriveBackup[]};
 return (data.files||[]).filter(isDriveBackup);
}
export async function uploadDriveBackup(password:string):Promise<DriveBackup>{
 if(password.length<8)throw Error('암호는 8자 이상이어야 합니다.');
 if(!token)throw Error('먼저 Google Drive를 연결해 주세요.');
 const encrypted=await encryptBackup(await buildWorkspacePackage(),password);
 if(encrypted.size>CLOUD_VAULT_LIMIT)throw Error('암호화 백업이 45MiB를 초과합니다.');
 const name=newName();
 const boundary='plotweaver-'+crypto.randomUUID();
 const metadata=JSON.stringify({name,mimeType:'application/octet-stream',description:'PLOTWEAVER encrypted workspace backup'});
 const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',metadata,'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n',encrypted,'\r\n--'+boundary+'--\r\n'],{type:'multipart/related; boundary='+boundary});
 const response=await driveFetch(UPLOAD,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const file=await response.json() as DriveBackup;
 if(!isDriveBackup(file))throw Error('Google Drive가 예상하지 못한 백업 정보를 반환했습니다.');
 return file;
}
export async function restoreDriveBackup(entry:DriveBackup,password:string){
 if(!isDriveBackup(entry))throw Error('올바르지 않은 백업 파일입니다.');
 const response=await driveFetch(API+'/'+encodeURIComponent(entry.id)+'?alt=media');
 const blob=await response.blob();
 if(blob.size>CLOUD_VAULT_LIMIT)throw Error('백업 파일 크기가 제한을 초과했습니다.');
 const zip=await decryptBackup(blob,password);
 return restorePackage(zip);
}
