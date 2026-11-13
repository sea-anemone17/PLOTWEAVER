import type {JSONContent} from '@tiptap/react';
import {db,now,uid,type ThemeSnapshot} from './data';
import {flushProjectEdits} from './saveBarrier';

export function plainText(node:JSONContent):string{
 return (node.text||'')+(node.content?.map(plainText).join(' ')||'');
}
export function diffThemeSnapshot(current:ThemeSnapshot,previous:ThemeSnapshot){
 const previousCards=new Map(previous.cards.map(c=>[c.id,c]));
 const currentCards=new Map(current.cards.map(c=>[c.id,c]));
 return {
  titleChanged:current.title!==previous.title,
  claimChanged:current.claim!==previous.claim,
  proseChanged:JSON.stringify(current.prose)!==JSON.stringify(previous.prose),
  added:current.cards.filter(c=>!previousCards.has(c.id)),
  removed:previous.cards.filter(c=>!currentCards.has(c.id)),
  modified:current.cards.filter(c=>{const p=previousCards.get(c.id);return p&&(p.text!==c.text||p.kind!==c.kind||p.order!==c.order);})
 };
}
export async function restoreThemeRevisionSafely(themeId:string,revisionId:string){
 await flushProjectEdits('__global__');
 return db.transaction('rw',db.themes,db.themeCards,db.themeRevisions,async()=>{
  const theme=await db.themes.get(themeId);
  const revision=await db.themeRevisions.get(revisionId);
  if(!theme||theme.deletedAt||!revision||revision.themeId!==themeId)throw Error('대상 주제의식 또는 개정본을 찾을 수 없습니다.');
  const originals=await db.themeCards.where('themeId').equals(themeId).toArray();
  const saved:ThemeSnapshot=structuredClone({
   title:theme.title,claim:theme.claim,prose:theme.prose,
   cards:originals.map(({id,kind,text,order})=>({id,kind,text,order}))
  });
  const stamp=now();
  const safety={id:uid(),themeId,label:'복원 직전 자동 보존 · '+new Date(stamp).toLocaleString('ko-KR'),snapshot:saved,createdAt:stamp};
  await db.themeRevisions.add(safety);
  // Existing IDs may be linked elsewhere; preserve IDs for matching cards, generate new IDs for missing ones.
  const existing=new Map(originals.map(c=>[c.id,c]));
  const source=revision.snapshot;
  const keep=new Set(source.cards.map(c=>c.id));
  for(const card of originals)if(!keep.has(card.id))await db.themeCards.delete(card.id);
  for(const card of source.cards){
   const base=existing.get(card.id);
   if(base)await db.themeCards.update(card.id,{kind:card.kind,text:card.text,order:card.order,updatedAt:stamp});
   else await db.themeCards.add({id:card.id,themeId,kind:card.kind,text:card.text,order:card.order,createdAt:stamp,updatedAt:stamp});
  }
  await db.themes.update(themeId,{title:source.title,claim:source.claim,prose:structuredClone(source.prose),updatedAt:stamp});
  return safety;
 });
}
