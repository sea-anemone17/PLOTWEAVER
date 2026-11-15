import 'fake-indexeddb/auto';
import {beforeEach,afterAll,describe,expect,it} from 'vitest';
import {db,createProject,emptyDocument,makeBackup,restoreBackup} from '../src/data';
import {
 addGlobalIdea,moveGlobalIdea,archiveIdeaTree,restoreIdeaTree,linkGlobalIdeas,
 createKnowledge,createTheme,addThemeCard,saveThemeRevision,
 pinThemeRevision,switchPinnedRevision,addThemeRelation,
 makeResearchBackup,importResearchBackup,validateResearchBackup
} from '../src/researchData';

beforeEach(async()=>{db.close();await db.delete();await db.open();});
afterAll(()=>db.close());

async function project(){
 return createProject({title:'시험 시나리오',kind:'TRPG 시나리오',stage:'임시 플롯이 있음',difficulty:'',mode:'혼합형'},'');
}

describe('global idea garden',()=>{
 it('moves nodes without changing IDs and rejects parent cycles',async()=>{
  const root=await addGlobalIdea(null,'핵심 소재');
  const child=await addGlobalIdea(root.id,'갈등');
  const leaf=await addGlobalIdea(child.id,'결말');
  await expect(moveGlobalIdea(root.id,leaf.id)).rejects.toThrow('하위');
  expect((await db.globalIdeas.get(root.id))?.parentId).toBeNull();
  await moveGlobalIdea(leaf.id,root.id);
  expect((await db.globalIdeas.get(leaf.id))?.parentId).toBe(root.id);
 });
 it('archives and restores descendants without deleting crosslinks',async()=>{
  const a=await addGlobalIdea(null,'시작');
  const b=await addGlobalIdea(a.id,'하위');
  await linkGlobalIdeas(a.id,b.id);
  await archiveIdeaTree(a.id);
  expect((await db.globalIdeas.get(a.id))?.deletedAt).toBeGreaterThan(0);
  expect((await db.globalIdeas.get(b.id))?.deletedAt).toBeGreaterThan(0);
  await restoreIdeaTree(a.id);
  expect((await db.globalIdeas.get(a.id))?.deletedAt).toBe(0);
  expect((await db.globalIdeas.get(b.id))?.deletedAt).toBe(0);
  expect(await db.globalIdeaLinks.count()).toBe(1);
 });
});

describe('knowledge and themes',()=>{
 it('saves immutable named revisions and keeps pinned project copies stable',async()=>{
  const p=await project();
  const note=await createKnowledge('thinker');
  await db.knowledgeNotes.update(note.id,{title:'카뮈',sources:'이방인'});
  const theme=await createTheme();
  await db.themes.update(theme.id,{title:'부조리',claim:'연대는 무의미를 넘어서는 실천이다.',prose:emptyDocument});
  const card=await addThemeCard(theme.id,'reason');
  await db.themeCards.update(card.id,{text:'타자에 대한 책임'});
  const revision=await saveThemeRevision(theme.id,'첫 번째 논증');
  const pin=await pinThemeRevision(p.id,revision.id);
  await db.themes.update(theme.id,{claim:'변경된 중심 명제'});
  await db.themeCards.update(card.id,{text:'변경된 근거'});
  expect((await db.themeRevisions.get(revision.id))?.snapshot.claim).toBe('연대는 무의미를 넘어서는 실천이다.');
  expect((await db.projectThemes.get(pin.id))?.pinned.cards[0].text).toBe('타자에 대한 책임');
  await expect(pinThemeRevision(p.id,revision.id)).rejects.toThrow('이미');
  const newer=await saveThemeRevision(theme.id,'두 번째 논증');
  await switchPinnedRevision(pin.id,newer.id);
  expect((await db.projectThemes.get(pin.id))?.pinned.claim).toBe('변경된 중심 명제');
  expect((await db.themeRevisions.get(revision.id))?.snapshot.claim).toBe('연대는 무의미를 넘어서는 실천이다.');
 });
 it('rejects cross-project theme relationships and portable project backup retains pinned content',async()=>{
  const a=await project(),b=await project();
  const theme=await createTheme();
  await db.themes.update(theme.id,{title:'인간의 선택',claim:'선택은 책임을 수반한다.'});
  const revision=await saveThemeRevision(theme.id,'완성');
  const application=await pinThemeRevision(a.id,revision.id);
  const scene={id:crypto.randomUUID(),projectId:b.id,createdAt:Date.now(),updatedAt:Date.now(),title:'타 프로젝트 장면',purpose:'',body:'',entry:'',information:'',actions:'',outcome:'',nextIds:[],eventId:'',order:0,stage:'도입'};
  await db.scenes.add(scene);
  await expect(addThemeRelation(application.id,'scene',scene.id)).rejects.toThrow('다른 프로젝트');
  const data=await makeBackup(a.id);
  const restored=await restoreBackup(JSON.stringify(data));
  const pins=await db.projectThemes.where('projectId').equals(restored.id).toArray();
  expect(pins).toHaveLength(1);
  expect(pins[0].pinned.claim).toBe('선택은 책임을 수반한다.');
  expect(pins[0].revisionId).toBe(revision.id);
 });
});

describe('research library backup',()=>{
 it('imports global linked records with new IDs and preserved immutable snapshots',async()=>{
  const first=await addGlobalIdea(null,'서사');
  const second=await addGlobalIdea(first.id,'장면');
  await linkGlobalIdeas(first.id,second.id);
  const note=await createKnowledge('literature');
  await db.knowledgeNotes.update(note.id,{title:'이방인'});
  const theme=await createTheme();
  await db.themes.update(theme.id,{title:'부조리',claim:'삶을 인식하는 태도'});
  await saveThemeRevision(theme.id,'초안');
  const payload=await makeResearchBackup();
  const count=await importResearchBackup(JSON.stringify(payload));
  expect(count.ideas).toBe(2);
  expect(count.knowledge).toBe(1);
  expect(count.themes).toBe(1);
  const ideas=await db.globalIdeas.toArray();
  const copiedRoot=ideas.find(x=>x.title==='서사'&&x.id!==first.id);
  const copiedChild=ideas.find(x=>x.title==='장면'&&x.id!==second.id);
  expect(copiedChild?.parentId).toBe(copiedRoot?.id);
  const links=await db.globalIdeaLinks.toArray();
  expect(links.some(l=>l.sourceId===copiedRoot?.id&&l.targetId===copiedChild?.id)).toBe(true);
  const saved=await db.themeRevisions.toArray();
  expect(saved).toHaveLength(2);
  expect(saved[0].snapshot.claim).toBe(saved[1].snapshot.claim);
 });
 it('remaps embedded wiki link marks when restoring research notes',async()=>{
  const target=await createKnowledge('literature');
  const source=await createKnowledge('concept');
  await db.knowledgeNotes.update(target.id,{title:'참조 대상'});
  await db.knowledgeNotes.update(source.id,{title:'메모',content:{
   type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'참조 대상',marks:[{type:'link',attrs:{href:'pw://knowledge/'+target.id}}]}]}]
  }});
  const backup=await makeResearchBackup();
  await importResearchBackup(JSON.stringify(backup));
  const notes=await db.knowledgeNotes.toArray();
  const importedTarget=notes.find(n=>n.title==='참조 대상'&&n.id!==target.id);
  const importedSource=notes.find(n=>n.title==='메모'&&n.id!==source.id);
  expect(importedSource?.content.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe('pw://knowledge/'+importedTarget?.id);
 });
 it('rejects missing global references before any database write',async()=>{
  const root=await addGlobalIdea(null,'첫 아이디어');
  const raw=await makeResearchBackup();
  (raw.data.globalIdeas as {id:string;parentId:string|null}[])[0].parentId='missing-id';
  expect(()=>validateResearchBackup(JSON.stringify(raw))).toThrow('상위');
  await expect(importResearchBackup(JSON.stringify(raw))).rejects.toThrow('상위');
  expect((await db.globalIdeas.get(root.id))?.parentId).toBeNull();
  expect(await db.globalIdeas.count()).toBe(1);
 });
});
