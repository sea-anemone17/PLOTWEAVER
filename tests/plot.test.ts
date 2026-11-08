import 'fake-indexeddb/auto';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { db, createProject, fresh, makeBackup, restoreBackup, type Scene } from '../src/data';
import { createPlotEdge, updatePlotEdge, deletePlotEdge, type EdgeDraft } from '../src/plotEdges';
import { autoLayout, graphBounds } from '../src/plotLayout';

beforeEach(async()=>{
 db.close();await db.delete();await db.open();
});
afterAll(()=>db.close());

async function fixture(){
 const project=await createProject({title:'분기 테스트',kind:'TRPG 시나리오',stage:'임시 플롯이 있음',difficulty:'',mode:'혼합형'},'');
 const base={purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',stage:'전개'};
 const scenes:Scene[]=['도입','선택','결말'].map((title,order)=>({...fresh(project.id),...base,title,order}));
 await db.scenes.bulkAdd(scenes);
 return {project,scenes};
}
const edge=(fromSceneId:string,toSceneId:string,type:EdgeDraft['type']='choice'):EdgeDraft=>({fromSceneId,toSceneId,type,label:'탈출한다',condition:'단서를 발견한 경우',note:'GM 진행 메모'});

describe('shared plot edges',()=>{
 it('supports multiple conditional paths between the same scenes, cycles and unknown endings',async()=>{
  const {project,scenes}=await fixture();
  const first=await createPlotEdge(project.id,edge(scenes[0].id,scenes[1].id));
  const second=await createPlotEdge(project.id,{...edge(scenes[0].id,scenes[1].id),label:'다른 선택'});
  const cyclic=await createPlotEdge(project.id,edge(scenes[1].id,scenes[0].id,'return'));
  const unknown=await createPlotEdge(project.id,edge(scenes[2].id,'','optional'));
  expect((await db.plotEdges.where('projectId').equals(project.id).toArray())).toHaveLength(4);
  expect(first.id).not.toBe(second.id);
  expect(cyclic.type).toBe('return');
  expect(unknown.toSceneId).toBe('');
  const positions=autoLayout(scenes,[first,second,cyclic,unknown]);
  expect(Object.keys(positions)).toHaveLength(3);
  expect(Number.isFinite(graphBounds(positions).width)).toBe(true);
 });
 it('edits and deletes an edge without deleting scenes',async()=>{
  const {project,scenes}=await fixture();
  const created=await createPlotEdge(project.id,edge(scenes[0].id,scenes[1].id));
  await updatePlotEdge(project.id,created.id,{...edge(scenes[1].id,scenes[2].id,'conditional'),condition:'종말 시점'});
  const updated=await db.plotEdges.get(created.id);
  expect(updated?.fromSceneId).toBe(scenes[1].id);
  expect(updated?.condition).toBe('종말 시점');
  await deletePlotEdge(project.id,created.id);
  expect(await db.plotEdges.count()).toBe(0);
  expect(await db.scenes.count()).toBe(3);
 });
 it('rejects cross-project references without altering a graph',async()=>{
  const a=await fixture(),b=await fixture();
  await expect(createPlotEdge(a.project.id,edge(a.scenes[0].id,b.scenes[0].id))).rejects.toThrow('장면');
  expect(await db.plotEdges.count()).toBe(0);
 });
 it('roundtrips graph edges and manual positions through project JSON backups',async()=>{
  const {project,scenes}=await fixture();
  const original=await createPlotEdge(project.id,edge(scenes[0].id,scenes[2].id));
  await db.plotLayouts.add({...fresh(project.id),sceneId:scenes[0].id,x:200,y:260});
  const copy=await restoreBackup(JSON.stringify(await makeBackup(project.id)));
  const restoredScenes=await db.scenes.where('projectId').equals(copy.id).toArray();
  const restoredEdges=await db.plotEdges.where('projectId').equals(copy.id).toArray();
  const restoredLayouts=await db.plotLayouts.where('projectId').equals(copy.id).toArray();
  expect(restoredEdges).toHaveLength(1);
  expect(restoredEdges[0].id).not.toBe(original.id);
  expect(restoredScenes.some(s=>s.id===restoredEdges[0].toSceneId)).toBe(true);
  expect(restoredLayouts).toHaveLength(1);
  expect(restoredLayouts[0].sceneId).toBe(restoredScenes[0].id);
  expect(restoredLayouts[0].x).toBe(200);
 });
 it('converts the old nextIds from legacy v1 backup into exactly one graph edge',async()=>{
  const {project,scenes}=await fixture();
  await db.scenes.update(scenes[0].id,{nextIds:[scenes[1].id,scenes[1].id]});
  const data=await makeBackup(project.id);
  delete data.data.plotEdges;
  delete data.data.plotLayouts;
  const restored=await restoreBackup(JSON.stringify(data));
  const migrated=await db.plotEdges.where('projectId').equals(restored.id).toArray();
  expect(migrated).toHaveLength(1);
  expect(migrated[0].type).toBe('normal');
 });
});
