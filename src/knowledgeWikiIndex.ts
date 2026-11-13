import type {JSONContent} from '@tiptap/react';
import type {KnowledgeNote} from './data';
const PREFIX='pw://knowledge/';
export function linkedKnowledgeIds(doc:JSONContent):string[]{
 const found=new Set<string>();
 const walk=(node:JSONContent)=>{
  for(const mark of node.marks||[]){
   const href=mark.attrs?.href;
   if(mark.type==='link'&&typeof href==='string'&&href.startsWith(PREFIX)){
    const id=href.slice(PREFIX.length);
    if(id)found.add(id);
   }
  }
  for(const child of node.content||[])walk(child);
 };
 walk(doc);return [...found];
}
export function indexKnowledgeWikiLinks(notes:KnowledgeNote[]):Map<string,Set<string>>{
 const reverse=new Map<string,Set<string>>();
 for(const source of notes){
  if(source.deletedAt)continue;
  for(const target of linkedKnowledgeIds(source.content)){
   if(!reverse.has(target))reverse.set(target,new Set());
   reverse.get(target)!.add(source.id);
  }
 }
 return reverse;
}
