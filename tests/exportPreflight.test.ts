import {describe,it,expect} from 'vitest';
import {collectExportWarnings} from '../src/exportPreflight';
import type {Asset,ExportProfile,Handout,PlotEdge,Scene} from '../src/data';

const profile={name:'배포용',includeScenes:true,includeHandouts:true,includePrivate:false,sceneIds:undefined} as ExportProfile;
const scene={id:'s1',deletedAt:undefined} as Scene;
const handout={id:'h1',title:'비밀 문서',kind:'file',visibility:'player',assetId:'missing'} as Handout;

describe('DOCX export preflight',()=>{
 it('warns about missing files, draft handouts, and broken plot targets',()=>{
  const draft={id:'h2',title:'미정',kind:'text',visibility:'draft',assetId:null} as Handout;
  const edge={id:'edge',fromSceneId:'s1',toSceneId:'gone'} as PlotEdge;
  const warnings=collectExportWarnings(profile,[handout,draft],[] as Asset[],[scene],[edge]);
  expect(warnings.map(w=>w.code)).toEqual(['edge:edge','asset:h1','draft-handouts']);
 });
 it('excludes non-exported GM material from missing-file warnings',()=>{
  const privateFile={...handout,visibility:'gm'} as Handout;
  expect(collectExportWarnings(profile,[privateFile],[],[scene],[])).toEqual([]);
 });
 it('warns when a player profile includes GM information',()=>{
  const p={...profile,includePrivate:true};
  expect(collectExportWarnings(p,[],[],[scene],[]).some(w=>w.code==='private')).toBe(true);
 });
});
