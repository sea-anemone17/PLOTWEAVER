import 'fake-indexeddb/auto';
import {beforeEach,afterAll,describe,expect,it} from 'vitest';
import JSZip from 'jszip';
import {db,createProject,emptyDocument,fresh} from '../src/data';
import {buildDocxBlob} from '../src/Editor';
import {profilePreset} from '../src/exportProfiles';

beforeEach(async()=>{db.close();await db.delete();await db.open();});
afterAll(()=>db.close());

async function scenario(){
 const project=await createProject({title:'서식 출력 검증',kind:'TRPG 시나리오',stage:'원고 작성 중',difficulty:'',mode:'혼합형'},'');
 const scene={...fresh(project.id),title:'첫 번째 장면',purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',order:0,stage:'도입'};
 await db.scenes.add(scene);
 await db.sceneDocs.add({id:crypto.randomUUID(),projectId:project.id,sceneId:scene.id,updatedAt:Date.now(),content:{
  type:'doc',content:[
   {type:'paragraph',content:[{type:'text',text:'플레이어에게 공개될 문장'}]},
   {type:'trpgBlock',attrs:{kind:'gm',fields:{비밀:'출력하면 안 되는 정보'}},content:[{type:'paragraph',content:[{type:'text',text:'GM 기밀 코드'}]}]},
   {type:'trpgBlock',attrs:{kind:'read',fields:{낭독:'공개 가능'}},content:[{type:'paragraph',content:[{type:'text',text:'문이 열린다'}]}]}
  ]
 }});
 await db.handouts.bulkAdd([
  {...fresh(project.id),title:'플레이어의 편지',kind:'text',visibility:'player',assetId:null,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'공개 핸드아웃 내용'}]}]}},
  {...fresh(project.id),title:'GM의 편지',kind:'text',visibility:'gm',assetId:null,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'비밀 핸드아웃 내용'}]}]}}
 ]);
 return project;
}
async function xmlOf(blob:Blob){
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 return zip.file('word/document.xml')!.async('string');
}
describe('DOCX export profiles',()=>{
 it('omits GM blocks, confidential handouts and GM-only fields in player documents',async()=>{
  const project=await scenario();
  const xml=await xmlOf(await buildDocxBlob(project.id,project.title,profilePreset(project.id,'player')));
  expect(xml).toContain('플레이어에게 공개될 문장');
  expect(xml).toContain('공개 핸드아웃 내용');
  expect(xml).toContain('문이 열린다');
  expect(xml).not.toContain('GM 기밀 코드');
  expect(xml).not.toContain('출력하면 안 되는 정보');
  expect(xml).not.toContain('비밀 핸드아웃 내용');
 });
 it('includes GM-only blocks and handouts in GM profiles',async()=>{
  const project=await scenario();
  const xml=await xmlOf(await buildDocxBlob(project.id,project.title,profilePreset(project.id,'gm')));
  expect(xml).toContain('GM 기밀 코드');
  expect(xml).toContain('출력하면 안 되는 정보');
  expect(xml).toContain('비밀 핸드아웃 내용');
 });
 it('exports only scene IDs explicitly selected in a profile',async()=>{
  const project=await scenario();
  const first=(await db.scenes.where('projectId').equals(project.id).toArray())[0];
  const second={...fresh(project.id),title:'두 번째 장면',purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',order:1,stage:'전개'};
  await db.scenes.add(second);
  await db.sceneDocs.add({id:crypto.randomUUID(),projectId:project.id,sceneId:second.id,updatedAt:Date.now(),
   content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'선택하지 않은 장면'}]}]}});
  const options={...profilePreset(project.id,'player'),sceneIds:[first.id],includeHandouts:false};
  const xml=await xmlOf(await buildDocxBlob(project.id,project.title,options));
  expect(xml).toContain('플레이어에게 공개될 문장');
  expect(xml).not.toContain('선택하지 않은 장면');
 });
 it('does not silently include scenes and handouts excluded by a profile',async()=>{
  const project=await scenario();
  await db.manuscripts.put({projectId:project.id,updatedAt:Date.now(),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'기존 연속 원고'}]}]}});
  const options={...profilePreset(project.id,'review'),includeScenes:false,includeHandouts:false,includeLegacy:true};
  const xml=await xmlOf(await buildDocxBlob(project.id,project.title,options));
  expect(xml).toContain('기존 연속 원고');
  expect(xml).not.toContain('플레이어에게 공개될 문장');
  expect(xml).not.toContain('공개 핸드아웃 내용');
 });
});
