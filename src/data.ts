import Dexie, { type Table } from 'dexie';
import type { JSONContent } from '@tiptap/react';

export type Project = {id:string;title:string;kind:string;stage:string;difficulty:string;mode:string;model:string;nextTask:string;createdAt:number;updatedAt:number};
type Base = {id:string;projectId:string;createdAt:number;updatedAt:number};
export type Idea = Base & {title:string;body:string;category:string;status:string;tags:string};
export type EventCard = Base & {title:string;body:string;when:string;cause:string;result:string;order:number};
export type Scene = Base & {title:string;purpose:string;body:string;entry:string;information:string;actions:string;outcome:string;nextIds:string[];eventId:string;order:number;stage:string};
export type Question = Base & {title:string;context:string;importance:string;status:string};
export type Hypothesis = Base & {questionId:string;body:string;evidence:string;effect:string;conflict:string;status:string};
export type Lore = Base & {title:string;body:string;kind:string;private:boolean};
export type Clue = Base & {title:string;body:string;truth:string;where:string;condition:string;alternate:string;audience:string};
export type Answer = Base & {promptId:string;body:string;status:'답변'|'보류'|'해당 없음'};
export type Manuscript = {projectId:string;content:JSONContent;updatedAt:number};
export type Relation = Base & {sourceId:string;targetId:string;type:string};

export class PlotDB extends Dexie {
 projects!:Table<Project,string>;ideas!:Table<Idea,string>;events!:Table<EventCard,string>;
 scenes!:Table<Scene,string>;questions!:Table<Question,string>;hypotheses!:Table<Hypothesis,string>;
 lore!:Table<Lore,string>;clues!:Table<Clue,string>;answers!:Table<Answer,string>;
 manuscripts!:Table<Manuscript,string>;relations!:Table<Relation,string>;
 constructor(){super('plotweaver');this.version(1).stores({
 projects:'id,updatedAt',ideas:'id,projectId,status,category,updatedAt',
 events:'id,projectId,order',scenes:'id,projectId,order,stage',questions:'id,projectId,status',
 hypotheses:'id,projectId,questionId',lore:'id,projectId,kind',clues:'id,projectId',
 answers:'id,projectId,promptId',manuscripts:'projectId',relations:'id,projectId,sourceId,targetId'
 });}
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
export const collections=['ideas','events','scenes','questions','hypotheses','lore','clues','answers','relations'] as const;
export type Backup={format:'plotweaver';version:1;exportedAt:string;project:Project;data:Record<string,unknown[]>;manuscript:Manuscript|null};
export async function makeBackup(id:string):Promise<Backup>{
 const project=await db.projects.get(id);if(!project)throw Error('프로젝트를 찾을 수 없습니다.');
 const data:Record<string,unknown[]>={};
 for(const name of collections)data[name]=await db.table(name).where('projectId').equals(id).toArray();
 return{format:'plotweaver',version:1,exportedAt:new Date().toISOString(),project,data,manuscript:await db.manuscripts.get(id)||null};
}
export function downloadBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadBackup(id:string){
 const b=await makeBackup(id);
 downloadBlob(new Blob([JSON.stringify(b,null,2)],{type:'application/json'}),b.project.title.replace(/[\\/:*?"<>|]/g,'_')+'.plotweaver.json');
}
export async function restoreBackup(text:string,duplicate=false):Promise<Project>{
 const raw:unknown=JSON.parse(text);
 if(!raw||typeof raw!=='object')throw Error('파일 형식이 올바르지 않습니다.');
 const b=raw as Partial<Backup>;
 if(b.format!=='plotweaver'||b.version!==1||!b.project||typeof b.project.id!=='string'||typeof b.project.title!=='string'||!b.data||typeof b.data!=='object')throw Error('지원하지 않는 백업 형식 또는 버전입니다.');
 const id=uid(),map=new Map<string,string>([[b.project.id,id]]);
 for(const name of collections){
  const rows=b.data[name]||[];
  if(!Array.isArray(rows)||rows.length>200000)throw Error('손상된 카드 목록입니다.');
  for(const row of rows){
   if(!row||typeof row!=='object'||typeof (row as {id?:unknown}).id!=='string')throw Error('손상된 카드가 있습니다.');
   map.set((row as {id:string}).id,uid());
  }
 }
 const mapId=(v:unknown)=>typeof v==='string'?map.get(v)||v:'';
 const project:Project={...b.project,id,title:b.project.title+(duplicate?' (복제본)':' (복원)'),createdAt:now(),updatedAt:now()};
 await db.transaction('rw',...db.tables,async()=>{
  await db.projects.add(project);
  for(const name of collections){
   const rows=((b.data||{})[name]||[]) as Record<string,unknown>[];
   const restored=rows.map(row=>{
    const result:{[key:string]:unknown}={...row,id:mapId(row.id),projectId:id};
    for(const key of ['questionId','eventId','sourceId','targetId'])if(result[key])result[key]=mapId(result[key]);
    if(Array.isArray(result.nextIds))result.nextIds=result.nextIds.map(mapId);
    return result;
   });
   if(restored.length)await db.table(name).bulkAdd(restored);
  }
  await db.manuscripts.put({projectId:id,content:b.manuscript?.content||emptyDocument,updatedAt:now()});
 });
 return project;
}
export async function duplicateProject(id:string){return restoreBackup(JSON.stringify(await makeBackup(id)),true);}
export async function deleteProject(id:string){
 await db.transaction('rw',...db.tables,async()=>{
  for(const name of collections)await db.table(name).where('projectId').equals(id).delete();
  await db.manuscripts.delete(id);await db.projects.delete(id);
 });
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
