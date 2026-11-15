import 'fake-indexeddb/auto';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { db, createProject, deleteProject, fresh, makeBackup, now, restoreBackup, restoreDeletedProject, uid } from '../src/data';

beforeEach(async()=>{
 db.close();
 await db.delete();
 await db.open();
});
afterAll(()=>db.close());

const createSample=async()=>{
 const project=await createProject({title:'테스트 시나리오',kind:'TRPG 시나리오',stage:'원고 작성 중',difficulty:'',mode:'혼합형'},'시작 아이디어');
 const scene={...fresh(project.id),title:'마지막 선택',purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',order:0,stage:'결말'};
 await db.scenes.add(scene);
 await db.sceneDocs.add({id:uid(),projectId:project.id,sceneId:scene.id,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'원고는 보존되어야 합니다.'}]}]},updatedAt:now()});
 const npc={...fresh(project.id),title:'마녀',body:'',kind:'NPC',private:true};
 await db.lore.add(npc);
 await db.sceneLinks.add({...fresh(project.id),sceneId:scene.id,resourceId:npc.id,resourceKind:'lore',role:'장면 안내자'});
 return {project,scene,npc};
};

describe('PLOTWEAVER backup and recovery',()=>{
 it('moves a project to the trash and restores its scene manuscript and resource links',async()=>{
  const {project}=await createSample();
  await deleteProject(project.id);
  expect(await db.projects.get(project.id)).toBeUndefined();
  expect(await db.trash.get(project.id)).toBeDefined();
  const restored=await restoreDeletedProject(project.id);
  const scenes=await db.scenes.where('projectId').equals(restored.id).toArray();
  const documents=await db.sceneDocs.where('projectId').equals(restored.id).toArray();
  const links=await db.sceneLinks.where('projectId').equals(restored.id).toArray();
  const lore=await db.lore.where('projectId').equals(restored.id).toArray();
  expect(scenes).toHaveLength(1);
  expect(documents).toHaveLength(1);
  expect(documents[0].sceneId).toBe(scenes[0].id);
  expect(documents[0].content.content?.[0].content?.[0].text).toBe('원고는 보존되어야 합니다.');
  expect(links[0].sceneId).toBe(scenes[0].id);
  expect(links[0].resourceId).toBe(lore[0].id);
  expect(await db.trash.get(project.id)).toBeUndefined();
 });
 it('rejects corrupt references without altering existing projects',async()=>{
  const {project}=await createSample();
  const backup=await makeBackup(project.id);
  const corrupted=JSON.parse(JSON.stringify(backup));
  corrupted.data.scenes[0].nextIds=['unknown-scene-id'];
  await expect(restoreBackup(JSON.stringify(corrupted))).rejects.toThrow('참조');
  expect(await db.projects.count()).toBe(1);
 });
 it('imports legacy v1 JSON backups without the new scene tables',async()=>{
  const {project}=await createSample();
  const backup=JSON.parse(JSON.stringify(await makeBackup(project.id)));
  delete backup.data.sceneDocs;
  delete backup.data.sceneLinks;
  const restored=await restoreBackup(JSON.stringify(backup));
  expect(restored.id).not.toBe(project.id);
  expect(await db.projects.count()).toBe(2);
  expect(await db.scenes.where('projectId').equals(restored.id).count()).toBe(1);
 });
 it('rejects malformed JSON and never deletes current data',async()=>{
  await createSample();
  await expect(restoreBackup('{ broken')).rejects.toThrow('JSON');
  expect(await db.projects.count()).toBe(1);
 });
});
