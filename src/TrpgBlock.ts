import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';

export const TRPG_BLOCK_TYPES = {
 gm: 'GM 전용 정보',
 read: '낭독문',
 check: '판정·규칙',
 branch: '선택·분기',
 ref: '자료 참조'
} as const;

export type TrpgBlockKind = keyof typeof TRPG_BLOCK_TYPES;

export const TRPG_FIELD_SUGGESTIONS:Record<TrpgBlockKind,string[]>={
 gm:['공개 조건','GM 주의 사항','관련 진상'],
 read:['낭독 조건','변형 문구'],
 check:['판정명','난이도','발생 조건','성공 결과','실패 결과','특수 결과'],
 branch:['선택 조건','선택 결과','다음 장면 메모'],
 ref:['사용 목적','참조 설명']
};

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
  return {
   kind:{default:'gm',parseHTML:element=>element.getAttribute('data-trpg-kind')||'gm'},
   edgeId:{default:null,parseHTML:element=>element.getAttribute('data-plot-edge')||null},
   fields:{
    default:{},
    parseHTML:element=>{
     const raw=element.getAttribute('data-trpg-fields');
     if(!raw)return {};
     try{
      const decoded:unknown=JSON.parse(raw);
      return decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded:{};
     }catch{return {};}
    },
    renderHTML:attrs=>({'data-trpg-fields':JSON.stringify(attrs.fields||{})})
   }
  };
 },
 parseHTML(){return [{tag:'section[data-trpg-kind]'}];},
 renderHTML({HTMLAttributes}){
  return ['section',mergeAttributes(HTMLAttributes,{class:'trpg-block','data-trpg-kind':HTMLAttributes.kind,'data-plot-edge':HTMLAttributes.edgeId||null}),0];
 },
 addInputRules(){
  return [wrappingInputRule({
   find:/^\/(gm|read|check|branch|ref|정보|낭독|판정|분기|참조)\s$/,
   type:this.type,
   getAttributes:match=>({kind:aliases[match[1]]||'gm'})
  })];
 }
});
