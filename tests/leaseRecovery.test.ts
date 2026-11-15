import 'fake-indexeddb/auto';
import {beforeEach,afterAll,describe,expect,it} from 'vitest';
import {db,createProject,emptyDocument,fresh,makeBackup,restoreBackup,deleteProject,type Scene} from '../src/data';
import type {JSONContent} from '@tiptap/react';
import {acquireProjectLease,assertProjectCanChange,clearOwnedLease,guardedProjectWrite,LEASE_DURATION_MS,releaseProjectLease,renewProjectLease,setOwnedLease} from '../src/projectLease';
import {createNamedCheckpoint,persistManuscript,preserveEmergencyDraft,restoreRecoveryRecord} from '../src/recovery';

const doc=(value:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:value}]}]});
const firstText=(value:JSONContent)=>value.content?.[0]?.content?.[0]?.text;
beforeEach(async()=>{db.close();await db.delete();await db.open();});
afterAll(()=>db.close());
async function sample(){
 const project=await createProject({title:'복구 실험실',kind:'TRPG 시나리오',stage:'원고 작성 중',difficulty:'',mode:'혼합형'},'');
 return project;
}
describe('exclusive project edit lease',()=>{
 it('grants editing to just one owner and renews only the current owner',async()=>{
  const p=await sample();
  const a='browser-tab-a',b='browser-tab-b';
  expect(await acquireProjectLease(p.id,a)).toBe(true);
  expect(await acquireProjectLease(p.id,b)).toBe(false);
  expect(await renewProjectLease(p.id,a)).toBe(true);
  expect(await renewProjectLease(p.id,b)).toBe(false);
  await releaseProjectLease(p.id,b);
  expect((await db.editLeases.get(p.id))?.ownerId).toBe(a);
  await releaseProjectLease(p.id,a);
  expect(await acquireProjectLease(p.id,b)).toBe(true);
 });
 it('fences non-manuscript project mutations inside the same transaction',async()=>{
  const p=await sample();
  await acquireProjectLease(p.id,'owner');
  await expect(guardedProjectWrite(p.id,[db.ideas],async()=>{
   await db.ideas.add({...fresh(p.id),title:'침입한 탭',body:'',status:'미분류',category:'소재',tags:''});
  })).rejects.toThrow('편집');
  expect(await db.ideas.where('projectId').equals(p.id).count()).toBe(0);
  setOwnedLease(p.id,'owner');
  await guardedProjectWrite(p.id,[db.ideas],async()=>{
   await db.ideas.add({...fresh(p.id),title:'정상 탭',body:'',status:'미분류',category:'소재',tags:''});
  });
  expect((await db.ideas.where('projectId').equals(p.id).toArray())[0].title).toBe('정상 탭');
  clearOwnedLease(p.id,'owner');
 });
 it('refuses a stale or foreign writer and prevents cross-tab deletion',async()=>{
  const p=await sample();
  const a='first',b='second';
  await acquireProjectLease(p.id,a);
  setOwnedLease(p.id,a);
  await persistManuscript(p.id,undefined,doc('첫 번째 작성'));
  clearOwnedLease(p.id,a); // a separate browser tab does not have the owner's token
  await expect(persistManuscript(p.id,undefined,doc('몰래 덮어쓰기'))).rejects.toThrow('편집');
  await expect(deleteProject(p.id)).rejects.toThrow('편집');
  await expect(assertProjectCanChange(p.id)).rejects.toThrow('편집');
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('첫 번째 작성');
  const when=Date.now()+LEASE_DURATION_MS+100;
  expect(await renewProjectLease(p.id,a,when)).toBe(false);
  expect(await acquireProjectLease(p.id,b,when)).toBe(true);
  expect(await renewProjectLease(p.id,a,when)).toBe(false);
  setOwnedLease(p.id,b);
  await persistManuscript(p.id,undefined,doc('두 번째 작성'));
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('두 번째 작성');
  clearOwnedLease(p.id,b);
 });
});
describe('manuscript recovery records',()=>{
 it('creates a named checkpoint and restores it without discarding the current document',async()=>{
  const p=await sample();
  await persistManuscript(p.id,undefined,doc('첫 번째 원고'));
  await persistManuscript(p.id,undefined,doc('두 번째 원고'));
  const named=await createNamedCheckpoint(p.id,undefined,'두 번째 완성본');
  await persistManuscript(p.id,undefined,doc('세 번째 원고'));
  await restoreRecoveryRecord(p.id,named.id);
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('두 번째 원고');
  const records=await db.recoveryRecords.where('projectId').equals(p.id).toArray();
  expect(records.some(x=>x.kind==='named'&&x.id===named.id)).toBe(true);
  const safe=records.find(x=>x.kind==='before-restore');
  expect(safe).toBeDefined();
  expect(firstText(safe!.content)).toBe('세 번째 원고');
  await restoreRecoveryRecord(p.id,safe!.id);
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('세 번째 원고');
 });
 it('keeps unsaved work from a stale tab in an isolated emergency draft',async()=>{
  const p=await sample();
  await acquireProjectLease(p.id,'active-tab');
  setOwnedLease(p.id,'active-tab');
  await persistManuscript(p.id,undefined,doc('현재 저장된 원고'));
  clearOwnedLease(p.id,'active-tab');
  await expect(persistManuscript(p.id,undefined,doc('다른 탭의 미저장 문장'))).rejects.toThrow('편집');
  const emergency=await preserveEmergencyDraft(p.id,undefined,doc('다른 탭의 미저장 문장'));
  expect(emergency.kind).toBe('emergency');
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('현재 저장된 원고');
  expect(firstText((await db.recoveryRecords.get(emergency.id))!.content)).toBe('다른 탭의 미저장 문장');
  setOwnedLease(p.id,'active-tab');
  await restoreRecoveryRecord(p.id,emergency.id);
  expect(firstText((await db.manuscripts.get(p.id))!.content)).toBe('다른 탭의 미저장 문장');
  clearOwnedLease(p.id,'active-tab');
 });
 it('preserves scene checkpoint references in imported project backups',async()=>{
  const p=await sample();
  const scene:Scene={...fresh(p.id),title:'결말',purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',order:0,stage:'결말'};
  await db.scenes.add(scene);
  await persistManuscript(p.id,scene.id,doc('장면 원고'));
  const named=await createNamedCheckpoint(p.id,scene.id,'완성된 결말');
  const saved=await makeBackup(p.id);
  const restored=await restoreBackup(JSON.stringify(saved));
  const copiedScene=(await db.scenes.where('projectId').equals(restored.id).toArray())[0];
  const copiedRecord=(await db.recoveryRecords.where('projectId').equals(restored.id).toArray()).find(x=>x.label===named.label);
  expect(copiedRecord?.docKey).toBe(copiedScene.id);
  expect(copiedRecord?.id).not.toBe(named.id);
  await persistManuscript(restored.id,copiedScene.id,doc('수정한 결말'));
  await restoreRecoveryRecord(restored.id,copiedRecord!.id);
  const current=await db.sceneDocs.where('sceneId').equals(copiedScene.id).first();
  expect(firstText(current!.content)).toBe('장면 원고');
 });
 it('does not prune manually named checkpoints while keeping automatic history bounded',async()=>{
  const p=await sample();
  await persistManuscript(p.id,undefined,doc('첫 원고'));
  const named=await createNamedCheckpoint(p.id,undefined,'중요한 보존 지점');
  await db.recoveryRecords.where('projectId').equals(p.id).filter(x=>x.kind==='auto').delete();
  for(let i=0;i<12;i++)await db.recoveryRecords.add({...fresh(p.id),docKey:'legacy',kind:'auto',label:'과거 기록',content:emptyDocument,createdAt:1000+i});
  await persistManuscript(p.id,undefined,doc('새 원고'));
  const records=await db.recoveryRecords.where('projectId').equals(p.id).toArray();
  expect(records.filter(x=>x.kind==='auto')).toHaveLength(12);
  expect(records.some(x=>x.id===named.id)).toBe(true);
 });
});
