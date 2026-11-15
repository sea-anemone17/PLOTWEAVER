import {buildWorkspacePackage,restorePackage} from './backupZip';
import {encryptBackup,decryptBackup} from './encryptedBackup';
import {supabaseAuth} from './supabaseAuth';

export const CLOUD_VAULT_BUCKET='plotweaver-backups';
export const CLOUD_VAULT_LIMIT=45*1024*1024;
export type VaultEntry={name:string;createdAt:string;size:number|null};

function client(){
 if(!supabaseAuth)throw Error('Supabase 연결 설정이 없습니다.');
 return supabaseAuth;
}
async function ownerId(){
 const {data,error}=await client().auth.getUser();
 if(error||!data.user)throw Error('Google 로그인 후 다시 시도해 주세요.');
 return data.user.id;
}
export function isSafeVaultName(name:string){
 return /^workspace-[0-9TZ-]{19,40}-[0-9a-f-]{36}\.pwenc$/.test(name)&&!name.includes('/')&&!name.includes('..');
}
function vaultName(){
 return 'workspace-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.pwenc';
}
function storageError(error:{message:string}){
 if(/bucket not found|not found/i.test(error.message))return 'Supabase에 비공개 plotweaver-backups 버킷을 먼저 설정해야 합니다.';
 if(/row-level security|permission|unauthorized|403/i.test(error.message))return 'Supabase Storage의 사용자별 접근 정책(RLS)을 확인해 주세요.';
 return error.message;
}
export async function listCloudBackups():Promise<VaultEntry[]>{
 const id=await ownerId();
 const {data,error}=await client().storage.from(CLOUD_VAULT_BUCKET).list(id,{
  limit:100,sortBy:{column:'created_at',order:'desc'}
 });
 if(error)throw Error(storageError(error));
 return (data||[]).filter(item=>isSafeVaultName(item.name)).map(item=>({
  name:item.name,createdAt:item.created_at||'',size:typeof item.metadata?.size==='number'?item.metadata.size:null
 }));
}
export async function uploadEncryptedWorkspace(password:string):Promise<VaultEntry>{
 if(password.length<8)throw Error('암호는 8자 이상이어야 합니다.');
 const id=await ownerId();
 const zip=await buildWorkspacePackage();
 const encrypted=await encryptBackup(zip,password);
 if(encrypted.size>CLOUD_VAULT_LIMIT)throw Error('암호화된 전체 백업이 45MiB를 초과합니다. ZIP 파일로 로컬 백업해 주세요.');
 const name=vaultName();
 const {error}=await client().storage.from(CLOUD_VAULT_BUCKET).upload(id+'/'+name,encrypted,{
  contentType:'application/octet-stream',cacheControl:'0',upsert:false
 });
 if(error)throw Error(storageError(error));
 return {name,createdAt:new Date().toISOString(),size:encrypted.size};
}
export async function restoreEncryptedWorkspace(name:string,password:string){
 if(!isSafeVaultName(name))throw Error('유효하지 않은 백업 파일 이름입니다.');
 const id=await ownerId();
 const {data,error}=await client().storage.from(CLOUD_VAULT_BUCKET).download(id+'/'+name);
 if(error||!data)throw Error(storageError(error||{message:'백업 다운로드 실패'}));
 if(data.size>CLOUD_VAULT_LIMIT)throw Error('허용된 클라우드 백업 크기를 초과했습니다.');
 const zip=await decryptBackup(data,password);
 // Additive, transactional restore; never overwrite local projects.
 return restorePackage(zip);
}
