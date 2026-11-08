import Dexie, { type Table } from 'dexie';
import type { JSONContent } from '@tiptap/react';
import { flushProjectEdits } from './saveBarrier';

export type Project = {id:string;title:string;kind:string;stage:string;difficulty:string;mode:string;model:string;nextTask:string;createdAt:number;updatedAt:number};
type Base = {id:string;projectId:string;createdAt:number;updatedAt:number};
export type Idea = Base & {title:string;body:string;category:string;status:string;tags:string};
export type EventCard = Base & {title:string;body:string;when:string;cause:string;result:string;order:number};
export type Scene = Base & {title:string;purpose:string;body:string;entry:string;information:string;actions:string;outcome:string;nextIds:string[];eventId:string;order:number;stage:string;deletedAt?:number};
export type Question = Base & {title:string;context:string;importance:string;status:string};
export type Hypothesis = Base & {questionId:string;body:string;evidence:string;effect:string;conflict:string;status:string};
export type Lore = Base & {title:string;body:string;kind:string;private:boolean};
export type Clue = Base & {title:string;body:string;truth:string;where:string;condition:string;alternate:string;audience:string};
export type Answer = Base & {promptId:string;body:string;status:'답변'|'보류'|'해당 없음'};
export type Manuscript = {projectId:string;content:JSONContent;updatedAt:number};
export type SceneDocument = {id:string;projectId:string;sceneId:string;content:JSONContent;updatedAt:number};
export type SceneLink = Base & {sceneId:string;resourceId:string;resourceKind:'lore'|'clues';role:string};
export type PlotEdgeType='normal'|'conditional'|'choice'|'return'|'optional';
export type PlotEdge = Base & {fromSceneId:string;toSceneId:string;type:PlotEdgeType;label:string;condition:string;note:string};
export type PlotLayout = Base & {sceneId:string;x:number;y:number};
export type Relation = Base & {sourceId:string;targetId:string;type:string};
export type TrashedProject = {id:string;deletedAt:number;backup:Backup;assets?:Asset[]};
export type EditorLease={projectId:string;ownerId:string;expiresAt:number;updatedAt:number};
export type RecoveryKind='auto'|'named'|'before-restore';
export type RecoveryRecord=Base & {docKey:string;kind:RecoveryKind;label:string;content:JSONContent};
export type Visibility='gm'|'player'|'draft';
export type Asset = Base & {name:string;mime:string;size:number;blob:Blob};
export type Handout = Base & {title:string;kind:'text'|'file';visibility:Visibility;content:JSONContent;assetId:string|null};
export type ExportProfile = Base & {name:string;includePrivate:boolean;includeLegacy:boolean;includeScenes:boolean;includeHandouts:boolean;includeGMResources:boolean;fontFamily:string;fontSize:number;pageMargin:number;sceneIds?:string[]};

// Global research data is intentionally independent of project-owned v0.1 idea cards.
export type GlobalIdea = {id:string;parentId:string|null;title:string;body:string;order:number;collapsed:boolean;createdAt:number;updatedAt:number;deletedAt?:number};
export type GlobalIdeaLink = {id:string;sourceId:string;targetId:string;createdAt:number};
export type KnowledgeKind='thinker'|'school'|'literature'|'concept';
export type KnowledgeNote = {id:string;kind:KnowledgeKind;title:string;content:JSONContent;sources:string;createdAt:number;updatedAt:number;deletedAt?:number};
export type KnowledgeLink = {id:string;fromId:string;toId:string;createdAt:number};
export type ThemeCardKind='claim'|'reason'|'objection'|'reconsideration';
export type ThemeCard = {id:string;themeId:string;kind:ThemeCardKind;text:string;order:number;createdAt:number;updatedAt:number};
export type Theme = {id:string;title:string;claim:string;prose:JSONContent;createdAt:number;updatedAt:number;deletedAt?:number};
export type ThemeSnapshot = {title:string;claim:string;prose:JSONContent;cards:Pick<ThemeCard,'id'|'kind'|'text'|'order'>[]};
export type ThemeRevision = {id:string;themeId:string;label:string;snapshot:ThemeSnapshot;createdAt:number};
export type ProjectTheme = Base & {themeId:string;revisionId:string;pinned:ThemeSnapshot;notes:string};
export type ThemeRelation = Base & {projectThemeId:string;targetKind:'scene'|'npc'|'clue'|'plotEdge';targetId:string;note:string};

export class PlotDB extends Dexie {
 projects!:Table<Project,string>;ideas!:Table<Idea,string>;events!:Table<EventCard,string>;
 scenes!:Table<Scene,string>;questions!:Table<Question,string>;hypotheses!:Table<Hypothesis,string>;
 lore!:Table<Lore,string>;clues!:Table<Clue,string>;answers!:Table<Answer,string>;
 manuscripts!:Table<Manuscript,string>;relations!:Table<Relation,string>;trash!:Table<TrashedProject,string>;
 sceneDocs!:Table<SceneDocument,string>;sceneLinks!:Table<SceneLink,string>;
 plotEdges!:Table<PlotEdge,string>;plotLayouts!:Table<PlotLayout,string>;
 globalIdeas!:Table<GlobalIdea,string>;globalIdeaLinks!:Table<GlobalIdeaLink,string>;
 knowledgeNotes!:Table<KnowledgeNote,string>;knowledgeLinks!:Table<KnowledgeLink,string>;
 themes!:Table<Theme,string>;themeCards!:Table<ThemeCard,string>;themeRevisions!:Table<ThemeRevision,string>;
 projectThemes!:Table<ProjectTheme,string>;themeRelations!:Table<ThemeRelation,string>;
 assets!:Table<Asset,string>;handouts!:Table<Handout,string>;exportProfiles!:Table<ExportProfile,string>;
 editLeases!:Table<EditorLease,string>;recoveryRecords!:Table<RecoveryRecord,string>;
 constructor(){super('plotweaver');this.version(1).stores({
 projects:'id,updatedAt',ideas:'id,projectId,status,category,updatedAt',
 events:'id,projectId,order',scenes:'id,projectId,order,stage',questions:'id,projectId,status',
 hypotheses:'id,projectId,questionId',lore:'id,projectId,kind',clues:'id,projectId',
 answers:'id,projectId,promptId',manuscripts:'projectId',relations:'id,projectId,sourceId,targetId'
 });
 this.version(2).stores({trash:'id,deletedAt'});
 this.version(3).stores({sceneDocs:'id,projectId,sceneId',sceneLinks:'id,projectId,sceneId,resourceId'});
 // Upgrade legacy nextIds once; new graph and mini map then share plotEdges as the source of truth.
 this.version(4).stores({plotEdges:'id,projectId,fromSceneId,toSceneId',plotLayouts:'id,projectId,&sceneId'})
  .upgrade(async tx=>{
   const scenes=await tx.table('scenes').toArray() as Scene[];
   const existing=new Map(scenes.map(s=>[s.id,s.projectId]));
   const stamp=Date.now();
   const edges:PlotEdge[]=[];
   for(const scene of scenes){
    for(const target of new Set(scene.nextIds||[])){
     if(target===scene.id||existing.get(target)!==scene.projectId)continue;
     edges.push({id:crypto.randomUUID(),projectId:scene.projectId,fromSceneId:scene.id,toSceneId:target,type:'normal',label:'',condition:'',note:'',createdAt:stamp,updatedAt:stamp});
    }
   }
   if(edges.length)await tx.table('plotEdges').bulkAdd(edges);
  });
 this.version(5).stores({
  globalIdeas:'id,parentId,order,updatedAt',globalIdeaLinks:'id,sourceId,targetId',
  knowledgeNotes:'id,kind,updatedAt',knowledgeLinks:'id,fromId,toId',
  themes:'id,updatedAt',themeCards:'id,themeId,kind,order',themeRevisions:'id,themeId,createdAt',
  projectThemes:'id,projectId,themeId,revisionId',themeRelations:'id,projectId,projectThemeId,targetId'
 });
 this.version(6).stores({
  assets:'id,projectId,updatedAt',handouts:'id,projectId,assetId,updatedAt',
  exportProfiles:'id,projectId,updatedAt'
 });
 this.version(7).stores({
  editLeases:'projectId,expiresAt',
  recoveryRecords:'id,projectId,docKey,kind,createdAt'
 });
 }
}
export const db=new PlotDB();
export const uid=()=>crypto.randomUUID();
export const now=()=>Date.now();
export const fresh=(projectId:string)=>({id:uid(),projectId,createdAt:now(),updatedAt:now()});
export const emptyDocument:JSONContent={type:'doc',content:[{type:'paragraph'}]};
export const STAGES=['발단','전개','위기','절정','결말'];
export const IDEA_CATEGORIES=['소재','장면','인물','세계관','기믹','대사','기타'];
export const IDEA_STATUSES=['미분류','검토','채택','보류','폐기'];
export const LORE_KINDS=['세계관','NPC','HO·비밀 설정','진상','특수 규칙','엔딩 조건'];
export const DIFFICULTIES=['시작점을 정하기 어려움','소재를 이야기로 연결하기 어려움','중심 갈등을 만들기 어려움','인과관계나 개연성이 고민됨','장면과 분기를 설계하기 어려움','막힌 부분 없음'];

export async function touch(id:string){await db.projects.update(id,{updatedAt:now()});}
export async function createProject(form:Pick<Project,'title'|'kind'|'stage'|'difficulty'|'mode'>,firstIdea:string){
 const p:Project={...form,id:uid(),title:form.title.trim()||'제목 미정',model:'사건 중심형',nextTask:'',createdAt:now(),updatedAt:now()};
 await db.transaction('rw',db.projects,db.manuscripts,db.ideas,async()=>{
  await db.projects.add(p);
  await db.manuscripts.add({projectId:p.id,content:emptyDocument,updatedAt:now()});
  if(firstIdea.trim())await db.ideas.add({...fresh(p.id),title:'첫 구상',body:firstIdea,category:'소재',status:'미분류',tags:''});
 });
 return p;
}
export const collections=['ideas','events','scenes','questions','hypotheses','lore','clues','answers','relations','sceneDocs','sceneLinks','plotEdges','plotLayouts','projectThemes','themeRelations','handouts','exportProfiles','recoveryRecords'] as const;
export type Backup={format:'plotweaver';version:1;exportedAt:string;project:Project;data:Record<string,unknown[]>;manuscript:Manuscript|null;assetManifest?:{id:string;name:string;mime:string;size:number}[]};

// Snapshot all project records in one transaction so a backup cannot mix different edit states.
async function collectBackup(id:string):Promise<Backup>{
 const project=await db.projects.get(id);
 if(!project)throw Error('프로젝트를 찾을 수 없습니다.');
 const data:Record<string,unknown[]>={};
 for(const name of collections)data[name]=await db.table(name).where('projectId').equals(id).toArray();
 const assets=await db.assets.where('projectId').equals(id).toArray();
 return {format:'plotweaver',version:1,exportedAt:new Date().toISOString(),project,data,manuscript:await db.manuscripts.get(id)||null,assetManifest:assets.map(({id,name,mime,size})=>({id,name,mime,size}))};
}
export async function makeBackup(id:string):Promise<Backup>{
 await flushProjectEdits(id);
 return db.transaction('r',db.tables,()=>collectBackup(id));
}
export function downloadBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadBackup(id:string){
 const b=await makeBackup(id);
 if(b.assetManifest?.length)throw Error('첨부파일이 있는 프로젝트는 ZIP 전체 백업을 이용해 주세요. JSON만 저장하면 파일 원본이 포함되지 않습니다.');
 downloadBlob(new Blob([JSON.stringify(b,null,2)],{type:'application/json'}),b.project.title.replace(/[\\/:*?"<>|]/g,'_')+'.plotweaver.json');
}
export function validateBackup(text:string):Backup{
 if(text.length>60_000_000)throw Error('백업 파일이 너무 큽니다.');
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw Error('JSON 백업 파일을 읽을 수 없습니다.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('백업 파일 형식이 올바르지 않습니다.');
 const b=raw as Partial<Backup>;
 if(b.format!=='plotweaver'||b.version!==1||!b.project||typeof b.project.id!=='string'||!b.project.id||typeof b.project.title!=='string'||!b.data||typeof b.data!=='object'||Array.isArray(b.data))throw Error('지원하지 않는 백업 형식 또는 버전입니다.');
 const ids=new Set<string>();
 let count=0;
 for(const name of collections){
  const rows=b.data[name]||(['sceneDocs','sceneLinks','plotEdges','plotLayouts','projectThemes','themeRelations','handouts','exportProfiles','recoveryRecords'].includes(name)?[]:undefined);
  if(!Array.isArray(rows))throw Error(name+' 자료 목록이 없습니다.');
  count+=rows.length;
  if(count>200000)throw Error('백업의 자료 수가 허용 범위를 초과합니다.');
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error(name+' 자료 형식이 올바르지 않습니다.');
   const obj=row as Record<string,unknown>;
   if(typeof obj.id!=='string'||!obj.id||ids.has(obj.id)||obj.projectId!==b.project.id)throw Error(name+' 자료 ID 또는 소속 프로젝트가 잘못되었습니다.');
   ids.add(obj.id);
  }
 }
 if(b.manuscript!==null&&b.manuscript!==undefined){
  const doc=b.manuscript.content;
  if(b.manuscript.projectId!==b.project.id||!doc||doc.type!=='doc'||!Array.isArray(doc.content))throw Error('원고 데이터가 손상되었습니다.');
 }
 return b as Backup;
}
export async function restoreBackup(text:string,duplicate=false,sourceAssets:Asset[]=[]):Promise<Project>{
 const b=validateBackup(text);
 const assetManifest=b.assetManifest||[];
 if(assetManifest.length!==sourceAssets.length)throw Error('첨부파일을 완전히 복원하려면 ZIP 백업이 필요합니다.');
 const checkedAssets=new Map(sourceAssets.map(a=>[a.id,a]));
 if(checkedAssets.size!==sourceAssets.length)throw Error('중복된 첨부파일 ID가 있습니다.');
 for(const item of assetManifest){
  const asset=checkedAssets.get(item.id);
  if(!asset||asset.projectId!==b.project.id||asset.name!==item.name||asset.mime!==item.mime||asset.size!==item.size||asset.blob.size!==item.size)throw Error('첨부파일이 누락되었거나 백업 정보와 일치하지 않습니다.');
 }
 const id=uid(),map=new Map<string,string>([[b.project.id,id]]);
 for(const item of assetManifest)map.set(item.id,uid());
 for(const name of collections)for(const row of b.data[name]||[]){
  const oldId=(row as {id:string}).id;
  map.set(oldId,uid());
 }
 const mapId=(value:unknown):string=>{
  if(value===null||value===undefined||value==='')return '';
  if(typeof value!=='string'||!map.has(value))throw Error('백업 내부의 자료 참조가 손상되었습니다.');
  return map.get(value)!;
 };
 const restored:Record<string,Record<string,unknown>[]>={};
 for(const name of collections){
  restored[name]=(b.data[name]||[]).map(row=>{
   const entry:Record<string,unknown>={...(row as Record<string,unknown>),id:mapId((row as {id:string}).id),projectId:id};
   for(const key of ['questionId','eventId','sourceId','targetId','sceneId','resourceId','fromSceneId','toSceneId','projectThemeId','assetId'])if(entry[key])entry[key]=mapId(entry[key]);
   if(entry.nextIds!==undefined){
    if(!Array.isArray(entry.nextIds))throw Error('장면 연결 목록이 손상되었습니다.');
    entry.nextIds=entry.nextIds.map(mapId);
   }
   // ProseMirror JSON may contain a branch block that refers to a PlotEdge.
   // Remap existing edges; retain dangling IDs so the editor can show a broken-link warning.
   if(name==='sceneDocs'&&entry.content&&typeof entry.content==='object'){
    const remapNode=(node:JSONContent):JSONContent=>({
     ...node,
     attrs:node.attrs?{
      ...node.attrs,
      ...(typeof node.attrs.edgeId==='string'&&map.has(node.attrs.edgeId)?{edgeId:map.get(node.attrs.edgeId)}:{})
     }:undefined,
     content:node.content?.map(remapNode)
    });
    entry.content=remapNode(entry.content as JSONContent);
   }
   if(name==='recoveryRecords'){
    if(typeof entry.docKey!=='string'||!entry.docKey)throw Error('원고 복구 기록의 문서 참조가 손상되었습니다.');
    if(entry.docKey!=='legacy')entry.docKey=mapId(entry.docKey);
   }
   if(name==='projectThemes'){
    // A project backup is portable even when its global library is absent.
    const pin=entry.pinned as Partial<ThemeSnapshot>|undefined;
    if(!pin||typeof pin.title!=='string'||typeof pin.claim!=='string'||!Array.isArray(pin.cards)||!pin.prose||pin.prose.type!=='doc')throw Error('프로젝트에 고정된 주제의식 개정본이 손상되었습니다.');
   }
   return entry;
  });
 }
 // v0.1/v1 legacy backup: materialize scene.nextIds as edges after mapping IDs.
 if(!Array.isArray(b.data.plotEdges)){
  const sceneIds=new Set(restored.scenes.map(s=>s.id));
  for(const scene of restored.scenes){
   for(const target of new Set(Array.isArray(scene.nextIds)?scene.nextIds:[])){
    if(typeof target!=='string'||!sceneIds.has(target)||target===scene.id)continue;
    restored.plotEdges.push({...fresh(id),fromSceneId:scene.id,toSceneId:target,type:'normal',label:'',condition:'',note:''});
   }
  }
 }
 const project:Project={...b.project,id,title:b.project.title+(duplicate?' (복제본)':' (복원)'),createdAt:now(),updatedAt:now()};
 await db.transaction('rw',db.tables,async()=>{
  await db.projects.add(project);
  for(const name of collections)if(restored[name].length)await db.table(name).bulkAdd(restored[name]);
  await db.manuscripts.put({projectId:id,content:b.manuscript?.content||emptyDocument,updatedAt:now()});
  if(sourceAssets.length)await db.assets.bulkAdd(sourceAssets.map(a=>({...a,id:mapId(a.id),projectId:id,createdAt:now(),updatedAt:now()})));
 });
 return project;
}
export async function duplicateProject(id:string){
 const backup=await makeBackup(id);
 const assets=await db.assets.where('projectId').equals(id).toArray();
 return restoreBackup(JSON.stringify(backup),true,assets);
}

// The trash entry and removal of live data are atomic; failed deletes never lose the snapshot.
export async function deleteProject(id:string){
 await flushProjectEdits(id);
 await db.transaction('rw',db.tables,async()=>{
  const backup=await collectBackup(id);
  const assets=await db.assets.where('projectId').equals(id).toArray();
  await db.trash.put({id,deletedAt:now(),backup,assets});
  await db.editLeases.delete(id);
  await db.assets.where('projectId').equals(id).delete();
  for(const name of collections)await db.table(name).where('projectId').equals(id).delete();
  await db.manuscripts.delete(id);
  await db.projects.delete(id);
 });
}
export async function restoreDeletedProject(id:string):Promise<Project>{
 const item=await db.trash.get(id);
 if(!item)throw Error('휴지통에서 프로젝트를 찾을 수 없습니다.');
 const project=await restoreBackup(JSON.stringify(item.backup),false,item.assets||[]);
 await db.trash.delete(id);
 return project;
}
export function recommend(p:Project){
 if(p.nextTask.trim())return p.nextTask;
 if(p.difficulty.includes('시작점'))return '서사 워크숍 · 소재와 창작 의도';
 if(p.difficulty.includes('갈등'))return '서사 워크숍 · 목표와 갈등';
 if(p.difficulty.includes('인과'))return '의문 해결실 · 개연성 검토';
 if(p.difficulty.includes('분기'))return '플롯 보드 · 장면과 선택 결과';
 if(p.stage.includes('원고'))return '원고 편집기 · 이어 쓰기';
 if(p.stage.includes('플롯'))return '플롯 보드 · 사건 연결';
 return p.model==='미스터리 역설계형'?'서사 워크숍 · 진상 역설계':'서사 워크숍 · 중심 사건 설계';
}
