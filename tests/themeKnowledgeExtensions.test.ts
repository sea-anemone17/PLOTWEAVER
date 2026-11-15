import {describe,it,expect} from 'vitest';
import {diffThemeSnapshot} from '../src/themeRevisionTools';
import {linkedKnowledgeIds,indexKnowledgeWikiLinks} from '../src/knowledgeWikiIndex';
import type {ThemeSnapshot,KnowledgeNote} from '../src/data';

describe('theme revision comparison',()=>{
 it('tracks prose, claim and argument cards without mutating snapshots',()=>{
  const old:ThemeSnapshot={title:'A',claim:'original',prose:{type:'doc',content:[{type:'paragraph'}]},cards:[{id:'a',kind:'reason',text:'reason',order:0}]};
  const current:ThemeSnapshot={...old,claim:'new',cards:[{id:'a',kind:'reason',text:'changed',order:0},{id:'b',kind:'objection',text:'challenge',order:1}]};
  const result=diffThemeSnapshot(current,old);
  expect(result.claimChanged).toBe(true);
  expect(result.added.map(c=>c.id)).toEqual(['b']);
  expect(result.modified.map(c=>c.id)).toEqual(['a']);
  expect(old.cards.length).toBe(1);
 });
});
describe('automatic wiki backlinks',()=>{
 it('extracts unique targets from rich text and reverse-indexes references',()=>{
  const content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'link',marks:[{type:'link',attrs:{href:'pw://knowledge/target'}}]},{type:'text',text:'repeat',marks:[{type:'link',attrs:{href:'pw://knowledge/target'}}]}]}]};
  expect(linkedKnowledgeIds(content)).toEqual(['target']);
  const source={id:'source',content} as KnowledgeNote;
  const reverse=indexKnowledgeWikiLinks([source]);
  expect([...reverse.get('target')||[]]).toEqual(['source']);
 });
});
