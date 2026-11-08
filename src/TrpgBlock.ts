import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';

export const TRPG_BLOCK_TYPES = {
 gm: 'GM 전용 정보',
 read: '낭독문',
 check: '판정·규칙',
 branch: '선택·분기',
 ref: '자료 참조'
} as const;

export type TrpgBlockKind = keyof typeof TRPG_BLOCK_TYPES;

const aliases:Record<string,TrpgBlockKind> = {
 gm:'gm', read:'read', check:'check', branch:'branch', ref:'ref',
 '정보':'gm', '낭독':'read', '판정':'check', '분기':'branch', '참조':'ref'
};

/** A real document node: content is editable, exportable and survives JSON backups. */
export const TrpgBlock = Node.create({
 name:'trpgBlock',
 group:'block',
 content:'block+',
 defining:true,
 draggable:true,
 addAttributes(){
  return {kind:{default:'gm',parseHTML:element=>element.getAttribute('data-trpg-kind')||'gm'}};
 },
 parseHTML(){return [{tag:'section[data-trpg-kind]'}];},
 renderHTML({HTMLAttributes}){
  return ['section',mergeAttributes(HTMLAttributes,{class:'trpg-block','data-trpg-kind':HTMLAttributes.kind}),0];
 },
 addInputRules(){
  return [wrappingInputRule({
   find:/^\/(gm|read|check|branch|ref|정보|낭독|판정|분기|참조)\s$/,
   type:this.type,
   getAttributes:match=>({kind:aliases[match[1]]||'gm'})
  })];
 }
});
