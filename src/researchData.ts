import {db,emptyDocument,fresh,now,uid,type GlobalIdea,type GlobalIdeaLink,type KnowledgeKind,type ThemeCardKind,type ThemeSnapshot,type ProjectTheme,type ThemeRelation} from './data';
import type {JSONContent} from '@tiptap/react';
import {flushProjectEdits} from './saveBarrier';

export async function addGlobalIdea(parentId:string|null=null,title='새 아이디어'){
 const existing=parentId?await db.globalIdeas.get(parentId):null;
 if(parentId&&(!existing||existing.deletedAt))throw Error('상위 아이디어를 찾을 수 없습니다.');
 const siblings=await db.globalIdeas.filter(i=>i.parentId===parentId&&!i.deletedAt).toArray();
 const entry:GlobalIdea={id:uid(),parentId,title,body:'',order:siblings.length,collapsed:false,createdAt:now(),updatedAt:now()};
 await db.globalIdeas.add(entry);return entry;
}
export async function moveGlobalIdea(id:string,parentId:string|null){
 const items=await db.globalIdeas.toArray();
 const source=items.find(x=>x.id===id&&!x.deletedAt);
 if(!source)throw Error('아이디어를 찾을 수 없습니다.');
 if(parentId){
  const target=items.find(x=>x.id===parentId&&!x.deletedAt);
  if(!target)throw Error('대상 아이디어를 찾을 수 없습니다.');
  const map=new Map(items.map(i=>[i.id,i]));
  const visited=new Set<string>();
  let current:string|null=parentId;
  while(current){
   if(current===id)throw Error('하위 아이디어를 상위로 지정할 수 없습니다.');
   if(visited.has(current))throw Error('아이디어의 계층에 순환이 있습니다.');
   visited.add(current);current=map.get(current)?.parentId||null;
  }
 }
 const siblings=items.filter(i=>i.parentId===parentId&&!i.deletedAt&&i.id!==id);
 await db.globalIdeas.update(id,{parentId,order:siblings.length,updatedAt:now()});
}
export async function archiveIdeaTree(id:string){
 await db.transaction('rw',db.globalIdeas,async()=>{
  const nodes=await db.globalIdeas.toArray();
  const descendants=new Set([id]);let changed=true;
  while(changed){changed=false;for(const node of nodes)if(node.parentId&&descendants.has(node.parentId)&&!descendants.has(node.id)){descendants.add(node.id);changed=true;}}
  if(!nodes.some(n=>n.id===id))throw Error('아이디어가 없습니다.');
  const deletedAt=now();
  for(const target of descendants)await db.globalIdeas.update(target,{deletedAt,updatedAt:deletedAt});
 });
}
export async function restoreIdeaTree(id:string){
 const nodes=await db.globalIdeas.toArray();
 const root=nodes.find(n=>n.id===id);
 if(!root)throw Error('아이디어가 없습니다.');
 // Only restore nodes archived in the same deletion operation; protect older deletions.
 const timestamp=root.deletedAt;
 if(!timestamp)return;
 const descendants=new Set([id]);let changed=true;
 while(changed){changed=false;for(const node of nodes)if(node.parentId&&descendants.has(node.parentId)&&node.deletedAt===timestamp&&!descendants.has(node.id)){descendants.add(node.id);changed=true;}}
 await db.transaction('rw',db.globalIdeas,async()=>{for(const target of descendants)await db.globalIdeas.update(target,{deletedAt:0,updatedAt:now()});});
}
export async function linkGlobalIdeas(sourceId:string,targetId:string){
 if(sourceId===targetId)throw Error('자기 자신에게 교차 연결할 수 없습니다.');
 const [a,b]=await Promise.all([db.globalIdeas.get(sourceId),db.globalIdeas.get(targetId)]);
 if(!a||!b||a.deletedAt||b.deletedAt)throw Error('연결할 아이디어가 없습니다.');
 const existing=await db.globalIdeaLinks.where('sourceId').equals(sourceId).filter(l=>l.targetId===targetId).first();
 if(existing)return existing;
 const link={id:uid(),sourceId,targetId,createdAt:now()};
 await db.globalIdeaLinks.add(link);return link;
}
export async function createKnowledge(kind:KnowledgeKind='concept'){
 const item={id:uid(),title:'새 지식 문서',kind,content:emptyDocument,sources:'',createdAt:now(),updatedAt:now()};
 await db.knowledgeNotes.add(item);return item;
}
export async function createTheme(){
 const item={id:uid(),title:'새 주제의식',claim:'',prose:emptyDocument,createdAt:now(),updatedAt:now()};
 await db.themes.add(item);return item;
}
export async function addThemeCard(themeId:string,kind:ThemeCardKind='reason'){
 const t=await db.themes.get(themeId);
 if(!t||t.deletedAt)throw Error('주제의식을 찾을 수 없습니다.');
 const siblings=await db.themeCards.where('themeId').equals(themeId).toArray();
 const item={id:uid(),themeId,kind,text:'',order:siblings.length,createdAt:now(),updatedAt:now()};
 await db.themeCards.add(item);return item;
}
export async function saveThemeRevision(themeId:string,label:string){
 if(!label.trim())throw Error('개정본 이름을 입력해 주세요.');
 await flushProjectEdits('__global__');
 return db.transaction('rw',db.themes,db.themeCards,db.themeRevisions,async()=>{
  const theme=await db.themes.get(themeId);
  if(!theme||theme.deletedAt)throw Error('주제의식을 찾을 수 없습니다.');
  const cards=(await db.themeCards.where('themeId').equals(themeId).toArray())
   .sort((a,b)=>a.order-b.order).map(({id,kind,text,order})=>({id,kind,text,order}));
  const snapshot:ThemeSnapshot=structuredClone({title:theme.title,claim:theme.claim,prose:theme.prose,cards});
  const revision={id:uid(),themeId,label:label.trim(),snapshot,createdAt:now()};
  await db.themeRevisions.add(revision);return revision;
 });
}
export async function pinThemeRevision(projectId:string,revisionId:string):Promise<ProjectTheme>{
 return db.transaction('rw',db.projects,db.themeRevisions,db.projectThemes,async()=>{
  if(!await db.projects.get(projectId))throw Error('프로젝트가 없습니다.');
  const revision=await db.themeRevisions.get(revisionId);
  if(!revision)throw Error('보존된 주제의식 개정본을 찾을 수 없습니다.');
  const existing=await db.projectThemes.where('projectId').equals(projectId).filter(p=>p.themeId===revision.themeId).first();
  if(existing)throw Error('이 주제의식이 이미 프로젝트에 고정되어 있습니다. 기존 항목을 확인해 주세요.');
  const pinned:ProjectTheme={...fresh(projectId),themeId:revision.themeId,revisionId,pinned:structuredClone(revision.snapshot),notes:''};
  await db.projectThemes.add(pinned);return pinned;
 });
}
export async function switchPinnedRevision(projectThemeId:string,revisionId:string){
 await db.transaction('rw',db.projectThemes,db.themeRevisions,async()=>{
  const current=await db.projectThemes.get(projectThemeId);
  if(!current)throw Error('프로젝트 주제의식이 없습니다.');
  const revision=await db.themeRevisions.get(revisionId);
  if(!revision||revision.themeId!==current.themeId)throw Error('다른 주제의식의 개정본을 사용할 수 없습니다.');
  await db.projectThemes.update(projectThemeId,{revisionId,pinned:structuredClone(revision.snapshot),updatedAt:now()});
 });
}
export async function addThemeRelation(projectThemeId:string,targetKind:ThemeRelation['targetKind'],targetId:string,note=''){
 const ref=await db.projectThemes.get(projectThemeId);
 if(!ref)throw Error('프로젝트의 주제 적용을 찾을 수 없습니다.');
 let target:{projectId:string;deletedAt?:number}|undefined;
 if(targetKind==='scene')target=await db.scenes.get(targetId);
 else if(targetKind==='npc')target=await db.lore.get(targetId);
 else if(targetKind==='clue')target=await db.clues.get(targetId);
 else if(targetKind==='plotEdge')target=await db.plotEdges.get(targetId);
 if(!target||target.projectId!==ref.projectId||target.deletedAt)throw Error('다른 프로젝트의 자료이거나 삭제된 대상입니다.');
 const existing=await db.themeRelations.where('projectThemeId').equals(projectThemeId).filter(x=>x.targetId===targetId&&x.targetKind===targetKind).first();
 if(existing)return existing;
 const relation={...fresh(ref.projectId),projectThemeId,targetKind,targetId,note};
 await db.themeRelations.add(relation);return relation;
}

export const RESEARCH_TABLES=['globalIdeas','globalIdeaLinks','knowledgeNotes','knowledgeLinks','themes','themeCards','themeRevisions'] as const;
export type ResearchBackup={format:'plotweaver-research';version:1;exportedAt:string;data:Record<string,unknown[]>};
export async function makeResearchBackup():Promise<ResearchBackup>{
 await flushProjectEdits('__global__');
 return db.transaction('r',db.tables,async()=>{
  const data:Record<string,unknown[]>={};
  for(const table of RESEARCH_TABLES)data[table]=await db.table(table).toArray();
  return {format:'plotweaver-research',version:1,exportedAt:new Date().toISOString(),data};
 });
}
export function validateResearchBackup(text:string):ResearchBackup{
 if(text.length>60000000)throw Error('백업 파일이 너무 큽니다.');
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw Error('유효한 JSON 파일이 아닙니다.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('백업 형식이 올바르지 않습니다.');
 const backup=raw as Partial<ResearchBackup>;
 if(backup.format!=='plotweaver-research'||backup.version!==1||!backup.data||typeof backup.data!=='object')throw Error('지원하지 않는 연구 보관함 백업입니다.');
 const ids=new Set<string>();
 let total=0;
 for(const table of RESEARCH_TABLES){
  const rows=backup.data[table];
  if(!Array.isArray(rows))throw Error('백업의 '+table+' 목록이 누락되었습니다.');
  total+=rows.length;
  if(total>100000)throw Error('허용된 자료 수를 초과했습니다.');
  for(const item of rows){
   if(!item||typeof item!=='object'||Array.isArray(item)||typeof (item as {id?:unknown}).id!=='string'||!(item as {id:string}).id)throw Error('자료의 식별자가 잘못되었습니다.');
   if(ids.has((item as {id:string}).id))throw Error('중복된 자료 ID가 있습니다.');
   ids.add((item as {id:string}).id);
  }
 }
 const d=backup.data;
 for(const idea of d.globalIdeas as GlobalIdea[])if(idea.parentId&&!ids.has(idea.parentId))throw Error('아이디어의 상위 항목이 누락되었습니다.');
 for(const link of d.globalIdeaLinks as GlobalIdeaLink[])if(!ids.has(link.sourceId)||!ids.has(link.targetId))throw Error('교차 참조 대상이 누락되었습니다.');
 for(const card of d.themeCards as {themeId:string}[])if(!ids.has(card.themeId))throw Error('논증 카드의 주제의식이 누락되었습니다.');
 for(const revision of d.themeRevisions as {themeId:string;snapshot?:ThemeSnapshot}[])if(!ids.has(revision.themeId)||!revision.snapshot||!Array.isArray(revision.snapshot.cards))throw Error('개정본이 손상되었습니다.');
 for(const link of d.knowledgeLinks as {fromId:string;toId:string}[])if(!ids.has(link.fromId)||!ids.has(link.toId))throw Error('지식 문서의 참조 대상이 누락되었습니다.');
 return backup as ResearchBackup;
}
export async function importResearchBackup(text:string){
 const b=validateResearchBackup(text);
 const ids=new Map<string,string>();
 for(const table of RESEARCH_TABLES)for(const item of b.data[table] as {id:string}[])ids.set(item.id,uid());
 const remap=(id:string|null|undefined)=>id?(ids.get(id)||(()=>{throw Error('참조가 손상되었습니다.');})()):null;
 // Internal wiki links are stored in rich text marks, not only in knowledgeLinks.
 const remapWiki=(node:JSONContent):JSONContent=>({
  ...node,
  marks:node.marks?.map(mark=>{
   const href=mark.attrs?.href;
   if(mark.type!=='link'||typeof href!=='string'||!href.startsWith('pw://knowledge/'))return mark;
   const originalId=href.slice('pw://knowledge/'.length);
   return {...mark,attrs:{...mark.attrs,href:'pw://knowledge/'+(ids.get(originalId)||originalId)}};
  }),
  content:node.content?.map(remapWiki)
 });
 const output:Record<string,Record<string,unknown>[]>={};
 for(const table of RESEARCH_TABLES){
  output[table]=(b.data[table] as Record<string,unknown>[]).map(original=>{
   const item:Record<string,unknown>={...structuredClone(original),id:remap(original.id as string)};
   for(const name of ['parentId','sourceId','targetId','fromId','toId','themeId'])if(typeof item[name]==='string'&&item[name])item[name]=remap(item[name] as string);
   if((table==='knowledgeNotes'||table==='themes')&&item.content&&typeof item.content==='object')item.content=remapWiki(item.content as JSONContent);
   if(table==='themes'&&item.prose&&typeof item.prose==='object')item.prose=remapWiki(item.prose as JSONContent);
   if(table==='themeRevisions'&&item.snapshot&&typeof item.snapshot==='object'){
    const snapshot=item.snapshot as ThemeSnapshot;
    item.snapshot={...snapshot,prose:remapWiki(snapshot.prose)};
   }
   return item;
  });
 }
 await db.transaction('rw',db.tables,async()=>{
  for(const table of RESEARCH_TABLES)if(output[table].length)await db.table(table).bulkAdd(output[table]);
 });
 return {ideas:output.globalIdeas.length,knowledge:output.knowledgeNotes.length,themes:output.themes.length,idMap:Object.fromEntries(ids)};
}
