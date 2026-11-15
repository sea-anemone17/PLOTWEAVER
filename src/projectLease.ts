import {db,now,type EditorLease} from './data';
import type {Table} from 'dexie';

export const LEASE_DURATION_MS=16000;
export const LEASE_REFRESH_MS=4000;

// Each live page instance owns only the sessions acquired in that page.
// Stale tabs cannot reuse a lease token after another tab takes ownership.
const owned=new Map<string,string>();
export function ownedLeaseToken(projectId:string){return owned.get(projectId)||null;}
export function setOwnedLease(projectId:string,ownerId:string){owned.set(projectId,ownerId);}
export function clearOwnedLease(projectId:string,ownerId:string){
 if(owned.get(projectId)===ownerId)owned.delete(projectId);
}
export async function acquireProjectLease(projectId:string,ownerId:string,at=now()):Promise<boolean>{
 if(!ownerId)throw Error('편집 세션 식별자가 없습니다.');
 return db.transaction('rw',db.projects,db.editLeases,async()=>{
  if(!await db.projects.get(projectId))return false;
  const existing=await db.editLeases.get(projectId);
  if(existing&&existing.ownerId!==ownerId&&existing.expiresAt>at)return false;
  const lease:EditorLease={projectId,ownerId,expiresAt:at+LEASE_DURATION_MS,updatedAt:at};
  await db.editLeases.put(lease);
  return true;
 });
}
export async function renewProjectLease(projectId:string,ownerId:string,at=now()):Promise<boolean>{
 return db.transaction('rw',db.editLeases,async()=>{
  const current=await db.editLeases.get(projectId);
  if(!current||current.ownerId!==ownerId||current.expiresAt<=at)return false;
  await db.editLeases.update(projectId,{expiresAt:at+LEASE_DURATION_MS,updatedAt:at});
  return true;
 });
}
export async function releaseProjectLease(projectId:string,ownerId:string){
 await db.transaction('rw',db.editLeases,async()=>{
  const existing=await db.editLeases.get(projectId);
  if(existing?.ownerId===ownerId)await db.editLeases.delete(projectId);
 });
}
/**
 * Run INSIDE the same IndexedDB transaction as an edit.
 * The lease read and the data write are serialized across browser tabs.
 */
export async function assertProjectLeaseWritable(projectId:string,at=now()){
 const lease=await db.editLeases.get(projectId);
 const token=owned.get(projectId);
 if(lease){
  if(lease.expiresAt<=at||token!==lease.ownerId)throw Error('다른 탭에서 편집 중이거나 편집권이 만료되었습니다. 이 변경을 저장하지 않았습니다.');
 }else if(token){
  throw Error('편집권이 해제되었습니다. 다시 편집권을 획득해 주세요.');
 }
}
export async function assertProjectCanChange(projectId:string){
 await db.transaction('r',db.editLeases,()=>assertProjectLeaseWritable(projectId));
}

/**
 * Guard shorter project mutations too, not only the rich text autosave path.
 * IndexedDB serializes ownership checks with the write transaction across tabs.
 */
export async function guardedProjectWrite<T>(projectId:string,tables:Table<any,any>[],operation:()=>Promise<T>):Promise<T>{
 const activeTables=[...new Set<Table<any,any>>([db.editLeases,db.projects,...tables])];
 return db.transaction('rw',activeTables,async()=>{
  await assertProjectLeaseWritable(projectId);
  if(!await db.projects.get(projectId))throw Error('삭제되었거나 누락된 프로젝트입니다.');
  return operation();
 });
}
