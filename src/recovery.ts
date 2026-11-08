import type {JSONContent} from '@tiptap/react';
import {db,emptyDocument,fresh,now,type RecoveryRecord} from './data';
import {assertProjectLeaseWritable} from './projectLease';
import {flushProjectEdits} from './saveBarrier';

const AUTO_INTERVAL_MS=10*60*1000;
const MAX_AUTO_PER_DOCUMENT=12;
export const documentKey=(sceneId?:string)=>sceneId||'legacy';

function validateDocument(content:JSONContent){
 if(content?.type!=='doc'||!Array.isArray(content.content))throw Error('원고 문서의 구조가 올바르지 않습니다.');
}
async function currentDocument(projectId:string,sceneId?:string):Promise<JSONContent>{
 if(sceneId){
  const scene=await db.scenes.get(sceneId);
  if(!scene||scene.projectId!==projectId||scene.deletedAt)throw Error('복구할 장면이 없거나 휴지통에 있습니다.');
  return (await db.sceneDocs.where('sceneId').equals(sceneId).first())?.content||emptyDocument;
 }
 return (await db.manuscripts.get(projectId))?.content||emptyDocument;
}
async function setDocument(projectId:string,content:JSONContent,sceneId?:string){
 if(sceneId){
  const previous=await db.sceneDocs.where('sceneId').equals(sceneId).first();
  await db.sceneDocs.put({id:previous?.id||crypto.randomUUID(),projectId,sceneId,content:structuredClone(content),updatedAt:now()});
 }else await db.manuscripts.put({projectId,content:structuredClone(content),updatedAt:now()});
}
async function snapshot(projectId:string,key:string,kind:RecoveryRecord['kind'],label:string,content:JSONContent){
 const record:RecoveryRecord={...fresh(projectId),docKey:key,kind,label,content:structuredClone(content)};
 await db.recoveryRecords.add(record);
 return record;
}
/** Document writes and automatic history are committed atomically. */
export async function persistManuscript(projectId:string,sceneId:string|undefined,content:JSONContent){
 validateDocument(content);
 await db.transaction('rw',[db.projects,db.editLeases,db.scenes,db.sceneDocs,db.manuscripts,db.recoveryRecords],async()=>{
  await assertProjectLeaseWritable(projectId);
  if(!await db.projects.get(projectId))throw Error('삭제된 프로젝트에는 원고를 저장할 수 없습니다.');
  const previous=await currentDocument(projectId,sceneId);
  const previousText=JSON.stringify(previous);
  if(previousText!==JSON.stringify(content)){
   const key=documentKey(sceneId);
   const autos=(await db.recoveryRecords.where('docKey').equals(key)
    .filter(x=>x.projectId===projectId&&x.kind==='auto').toArray()).sort((a,b)=>b.createdAt-a.createdAt);
   if(!autos.length||now()-autos[0].createdAt>=AUTO_INTERVAL_MS){
    await snapshot(projectId,key,'auto','자동 복구 기록',previous);
    const old=autos.slice(Math.max(0,MAX_AUTO_PER_DOCUMENT-1));
    if(old.length)await db.recoveryRecords.bulkDelete(old.map(x=>x.id));
   }
   await setDocument(projectId,content,sceneId);
   await db.projects.update(projectId,{updatedAt:now()});
  }
 });
}
export async function createNamedCheckpoint(projectId:string,sceneId:string|undefined,label:string){
 const name=label.trim();
 if(!name||name.length>100)throw Error('복구 지점 이름을 1~100자로 입력해 주세요.');
 await flushProjectEdits(projectId);
 return db.transaction('rw',[db.projects,db.editLeases,db.scenes,db.sceneDocs,db.manuscripts,db.recoveryRecords],async()=>{
  await assertProjectLeaseWritable(projectId);
  if(!await db.projects.get(projectId))throw Error('프로젝트가 없습니다.');
  const document=await currentDocument(projectId,sceneId);
  return snapshot(projectId,documentKey(sceneId),'named',name,document);
 });
}
export async function restoreRecoveryRecord(projectId:string,recordId:string){
 await flushProjectEdits(projectId);
 return db.transaction('rw',[db.projects,db.editLeases,db.scenes,db.sceneDocs,db.manuscripts,db.recoveryRecords],async()=>{
  await assertProjectLeaseWritable(projectId);
  if(!await db.projects.get(projectId))throw Error('프로젝트가 없습니다.');
  const selected=await db.recoveryRecords.get(recordId);
  if(!selected||selected.projectId!==projectId)throw Error('이 프로젝트의 복구 기록이 아닙니다.');
  validateDocument(selected.content);
  const sceneId=selected.docKey==='legacy'?undefined:selected.docKey;
  const previous=await currentDocument(projectId,sceneId);
  await snapshot(projectId,selected.docKey,'before-restore','복원 직전 안전 기록',previous);
  await setDocument(projectId,selected.content,sceneId);
  await db.projects.update(projectId,{updatedAt:now()});
  return sceneId||'legacy';
 });
}
export async function deleteRecoveryRecord(projectId:string,recordId:string){
 await db.transaction('rw',db.recoveryRecords,db.editLeases,async()=>{
  await assertProjectLeaseWritable(projectId);
  const item=await db.recoveryRecords.get(recordId);
  if(!item||item.projectId!==projectId)throw Error('복구 기록을 찾을 수 없습니다.');
  await db.recoveryRecords.delete(item.id);
 });
}
