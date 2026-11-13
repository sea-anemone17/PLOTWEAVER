/** Optional password-encrypted ZIP wrapper. Keys and passwords never leave this device. */
const HEADER=new TextEncoder().encode('PWE1');
const SALT_SIZE=16;
const IV_SIZE=12;
const MAX_INPUT=305*1024*1024;
async function keyFor(password:string,salt:Uint8Array){
 if(password.length<8)throw Error('암호는 최소 8자 이상이어야 합니다.');
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt as BufferSource,iterations:250000},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function isEncryptedBackup(blob:Blob){return blob.type==='application/x-plotweaver-encrypted'||blob instanceof File&&blob.name.toLowerCase().endsWith('.pwenc');}
export async function encryptBackup(zip:Blob,password:string):Promise<Blob>{
 if(zip.size>MAX_INPUT)throw Error('백업 크기가 암호화 한도를 초과합니다.');
 const salt=crypto.getRandomValues(new Uint8Array(SALT_SIZE));
 const iv=crypto.getRandomValues(new Uint8Array(IV_SIZE));
 const key=await keyFor(password,salt);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,await zip.arrayBuffer());
 return new Blob([HEADER,salt,iv,encrypted],{type:'application/x-plotweaver-encrypted'});
}
export async function decryptBackup(encrypted:Blob,password:string):Promise<Blob>{
 if(encrypted.size>MAX_INPUT+64||encrypted.size<HEADER.length+SALT_SIZE+IV_SIZE+16)throw Error('암호화 백업의 크기가 올바르지 않습니다.');
 const buffer=await encrypted.arrayBuffer();
 const data=new Uint8Array(buffer);
 if(!HEADER.every((b,i)=>data[i]===b))throw Error('PLOTWEAVER 암호화 백업 형식이 아닙니다.');
 const salt=data.slice(4,20),iv=data.slice(20,32);
 const key=await keyFor(password,salt);
 try{
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data.slice(32));
  return new Blob([plain],{type:'application/zip'});
 }catch{throw Error('암호가 틀렸거나 암호화된 파일이 손상되었습니다.');}
}
