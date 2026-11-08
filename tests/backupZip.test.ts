import 'fake-indexeddb/auto';
import {beforeEach,afterAll,describe,expect,it} from 'vitest';
import JSZip from 'jszip';
import {db,createProject,emptyDocument,fresh,now,downloadBackup,type Asset} from '../src/data';
import {buildProjectPackage,buildWorkspacePackage,restorePackage} from '../src/backupZip';
import {addExportProfile,profilePreset,validateExportProfile} from '../src/exportProfiles';
import {addGlobalIdea,createTheme,saveThemeRevision,pinThemeRevision} from '../src/researchData';

beforeEach(async()=>{db.close();await db.delete();await db.open();});
afterAll(()=>db.close());

async function makeProjectWithAttachment(){
 const project=await createProject({title:'파일이 있는 시나리오',kind:'TRPG 시나리오',stage:'원고 작성 중',difficulty:'',mode:'혼합형'},'');
 const blob=new Blob([new Uint8Array([37,80,68,70,45,49,46,55,10,49,10])],{type:'application/pdf'});
 const asset:Asset={...fresh(project.id),name:'편지.pdf',mime:'application/pdf',size:blob.size,blob};
 const handout={...fresh(project.id),title:'비밀 편지',kind:'file' as const,visibility:'gm' as const,content:emptyDocument,assetId:asset.id};
 await db.transaction('rw',db.assets,db.handouts,async()=>{await db.assets.add(asset);await db.handouts.add(handout);});
 return {project,asset,handout};
}

describe('ZIP backup and handouts',()=>{
 it('restores the actual file bytes and re-maps handout/asset references',async()=>{
  const {project,asset}=await makeProjectWithAttachment();
  const archive=await buildProjectPackage(project.id);
  const restored=await restorePackage(archive);
  expect(restored).toHaveLength(1);
  const id=restored[0].id;
  const newAsset=(await db.assets.where('projectId').equals(id).toArray())[0];
  const newHandout=(await db.handouts.where('projectId').equals(id).toArray())[0];
  expect(newAsset.id).not.toBe(asset.id);
  expect(newHandout.assetId).toBe(newAsset.id);
  expect(newAsset.name).toBe('편지.pdf');
  expect(Array.from(new Uint8Array(await newAsset.blob.arrayBuffer()))).toEqual(Array.from(new Uint8Array(await asset.blob.arrayBuffer())));
 });
 it('rejects mismatched attached bytes without changing existing projects',async()=>{
  const {project}=await makeProjectWithAttachment();
  const archive=await buildProjectPackage(project.id);
  const zip=await JSZip.loadAsync(await archive.arrayBuffer());
  const manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));
  zip.file(manifest.assets[0].path,new Uint8Array([1,2,3]));
  const tampered=await zip.generateAsync({type:'blob'});
  await expect(restorePackage(tampered)).rejects.toThrow('손상');
  expect(await db.projects.count()).toBe(1);
  expect(await db.handouts.count()).toBe(1);
 });
 it('keeps attached files through project duplication and project trash recovery',async()=>{
  const {project}=await makeProjectWithAttachment();
  const {duplicateProject,deleteProject,restoreDeletedProject}=await import('../src/data');
  const duplicated=await duplicateProject(project.id);
  expect((await db.assets.where('projectId').equals(duplicated.id).count())).toBe(1);
  await deleteProject(project.id);
  expect(await db.assets.where('projectId').equals(project.id).count()).toBe(0);
  const recovered=await restoreDeletedProject(project.id);
  expect(await db.assets.where('projectId').equals(recovered.id).count()).toBe(1);
 });
 it('roundtrips a full workspace containing research notes, profiles and attached assets',async()=>{
  const {project}=await makeProjectWithAttachment();
  const idea=await addGlobalIdea(null,'전체 백업 검증');
  await addExportProfile(project.id,'player');
  const theme=await createTheme();
  await db.themes.update(theme.id,{title:'해결하지 못한 질문',claim:'선택에는 책임이 따른다'});
  const revision=await saveThemeRevision(theme.id,'결말 완성');
  await pinThemeRevision(project.id,revision.id);
  const archive=await buildWorkspacePackage();
  const results=await restorePackage(archive);
  expect(results).toHaveLength(1);
  expect(await db.projects.count()).toBe(2);
  const copy=results[0].id;
  expect(await db.exportProfiles.where('projectId').equals(copy).count()).toBe(1);
  expect(await db.assets.where('projectId').equals(copy).count()).toBe(1);
  const pin=(await db.projectThemes.where('projectId').equals(copy).toArray())[0];
  expect(pin.pinned.claim).toBe('선택에는 책임이 따른다');
  expect(pin.revisionId).not.toBe(revision.id);
  expect((await db.themeRevisions.get(pin.revisionId))?.id).toBe(pin.revisionId);
  expect(pin.themeId).not.toBe(theme.id);
  const ideas=await db.globalIdeas.toArray();
  expect(ideas.filter(i=>i.title===idea.title)).toHaveLength(2);
 });
 it('blocks invalid export-profile parameters before DOCX output',()=>{
  const preset=profilePreset('test','player');
  expect(()=>validateExportProfile(preset)).not.toThrow();
  expect(()=>validateExportProfile({...preset,fontSize:30})).toThrow('본문');
 });
});
