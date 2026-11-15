import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject, db, emptyDocument, fresh, makeBackup, restoreBackup, type Scene } from '../src/data';
import { buildProjectPackage, restorePackage } from '../src/backupZip';
import { captureProject } from '../src/ProjectSnapshots';
import { saveScenarioRecord } from '../src/scenarioRecords';
import type { Condition } from '../src/scenario';

beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
afterAll(() => db.close());

async function fixture() {
  const project = await createProject({ title: '꿈의 기록', kind: 'TRPG 시나리오', stage: '', difficulty: '', mode: '' }, '');
  const p = project.id;
  await saveScenarioRecord(p, 'scenarioVariables', { name: '기록 발견', type: 'boolean', initial: false, options: [] });
  const variable = await db.scenarioVariables.where('projectId').equals(p).first();
  const guard: Condition = { kind: 'compare', variableId: variable!.id, op: 'eq', value: true };
  const npc = { ...fresh(p), title: '안내자', kind: 'NPC', body: '', private: true };
  const lore = { ...fresh(p), title: '서재', kind: '세계관', body: '[[안내자]]', private: false, wiki: { category: '장소', tags: '', status: '확정', links: [{ label: '안내자', targetId: npc.id }] } };
  const scene: Scene = {
    ...fresh(p), title: '서재', stage: '발단', body: '', purpose: '', entry: '', information: '', actions: '', outcome: '', nextIds: [],
    order: 0, eventId: '', flow: { onEntry: [{ variableId: variable!.id, value: true }], onExit: [], ending: false }
  };
  const clue = { ...fresh(p), title: '기록', body: '', truth: '', where: '', condition: '', alternate: '', audience: '', required: true };
  const handout = { ...fresh(p), title: '공문', kind: 'text' as const, visibility: 'player' as const, content: emptyDocument, assetId: null, sceneId: scene.id, clueId: clue.id };
  await db.lore.bulkAdd([npc, lore]);
  await db.scenes.add(scene);
  await db.clues.add(clue);
  await db.handouts.add(handout);
  await db.projects.update(p, { startSceneId: scene.id });
  await db.clueRoutes.add({ ...fresh(p), sceneId: scene.id, clueId: clue.id, guard, note: '' });
  await db.plotEdges.add({ ...fresh(p), fromSceneId: scene.id, toSceneId: '', type: 'conditional', label: '', condition: '', note: '', guard: { kind: 'not', term: guard } });
  await db.foreshadows.add({ ...fresh(p), title: '예고', kind: '정보형', status: '회수 예정', introductionId: scene.id, hintIds: [scene.id], payoffId: scene.id, payoff: '', clueId: clue.id, handoutId: handout.id, npcId: npc.id });
  return project;
}
async function verifyCopy(id: string) {
  const [project, scene, variable, edge, route, clue, handout, foreshadow, wiki, npc] = await Promise.all([
    db.projects.get(id), db.scenes.where('projectId').equals(id).first(), db.scenarioVariables.where('projectId').equals(id).first(),
    db.plotEdges.where('projectId').equals(id).first(), db.clueRoutes.where('projectId').equals(id).first(),
    db.clues.where('projectId').equals(id).first(), db.handouts.where('projectId').equals(id).first(), db.foreshadows.where('projectId').equals(id).first(),
    db.lore.where('projectId').equals(id).filter(item => !!item.wiki).first(), db.lore.where('projectId').equals(id).filter(item => item.kind === 'NPC').first()
  ]);
  expect(project?.startSceneId).toBe(scene?.id);
  expect(scene?.flow?.onEntry[0].variableId).toBe(variable?.id);
  expect(edge?.guard).toMatchObject({ term: { variableId: variable?.id } });
  expect(route).toMatchObject({ clueId: clue?.id, sceneId: scene?.id, guard: { variableId: variable?.id } });
  expect(handout).toMatchObject({ clueId: clue?.id, sceneId: scene?.id });
  expect(foreshadow).toMatchObject({ npcId: npc?.id, handoutId: handout?.id, hintIds: [scene?.id] });
  expect(wiki?.wiki?.links[0].targetId).toBe(npc?.id);
}

describe('scenario backup and migration', () => {
  it('round-trips new references in JSON and ZIP', async () => {
    const project = await fixture();
    const fromJson = await restoreBackup(JSON.stringify(await makeBackup(project.id)));
    await verifyCopy(fromJson.id);
    const [fromZip] = await restorePackage(await buildProjectPackage(project.id));
    await verifyCopy(fromZip.id);
  });
  it('captures a portable snapshot and restores it as a copy with original content', async () => {
    const project = await fixture();
    await captureProject(project.id, '초고', '테스트');
    await db.projects.update(project.id, { title: '변경된 원고' });
    const snapshot = await db.projectSnapshots.where('projectId').equals(project.id).first();
    const [copy] = await restorePackage(snapshot!.blob);
    expect(copy.title).toBe('꿈의 기록 (복원)');
    expect(await db.projects.get(project.id)).toMatchObject({ title: '변경된 원고' });
    await verifyCopy(copy.id);
  });
  it('preserves an existing manuscript when opening a v7 IndexedDB with v8 code', async () => {
    const added = new Set(['scenarioVariables', 'clueRoutes', 'foreshadows', 'ruleEvents', 'simulationLogs', 'npcRelationships', 'projectSnapshots']);
    const previousSchema = Object.fromEntries(db.tables.filter(table => !added.has(table.name)).map(table => [
      table.name, [table.schema.primKey, ...table.schema.indexes].map(index => index.src).join(',')
    ]));
    db.close();
    await db.delete();
    const legacy = new Dexie('plotweaver');
    legacy.version(7).stores(previousSchema);
    await legacy.open();
    await legacy.table('projects').add({ id: 'old', title: '예전 저장소' });
    await legacy.table('manuscripts').add({ projectId: 'old', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '기존 원고' }] }] }, updatedAt: 1 });
    legacy.close();
    await db.open();
    expect(db.verno).toBe(8);
    expect((await db.manuscripts.get('old'))?.content.content?.[0].content?.[0].text).toBe('기존 원고');
    expect(await db.scenarioVariables.count()).toBe(0);
  });
  it('imports a version 1 backup without the new tables', async () => {
    const project = await createProject({ title: '기존 프로젝트', kind: '', stage: '', difficulty: '', mode: '' }, '기존 메모');
    const backup = await makeBackup(project.id);
    backup.version = 1;
    for (const key of ['scenarioVariables', 'clueRoutes', 'foreshadows', 'ruleEvents', 'simulationLogs', 'npcRelationships']) delete backup.data[key];
    const copy = await restoreBackup(JSON.stringify(backup));
    expect(await db.ideas.where('projectId').equals(copy.id).first()).toMatchObject({ body: '기존 메모' });
  });
});

describe('snapshot archive', () => {
  it('restores snapshots from workspace and project packages, including a second export of restored data', async () => {
    const { buildWorkspacePackage } = await import('../src/backupZip');
    const project = await fixture();
    await captureProject(project.id, '초고', '첫 버전');
    await db.projects.update(project.id, { title: '현재 원고' });
    const [restored] = await restorePackage(await buildWorkspacePackage());
    const snapshots = await db.projectSnapshots.where('projectId').equals(restored.id).toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ title: '초고', description: '첫 버전' });
    const [snapshotCopy] = await restorePackage(snapshots[0].blob);
    expect(snapshotCopy.title).toBe('꿈의 기록 (복원)');
    const [twice] = await restorePackage(await buildProjectPackage(restored.id));
    const twiceSnapshots = await db.projectSnapshots.where('projectId').equals(twice.id).toArray();
    expect(twiceSnapshots).toHaveLength(1);
    const [original] = await restorePackage(twiceSnapshots[0].blob);
    expect(original.title).toBe('꿈의 기록 (복원)');
  });
  it('rejects damaged snapshot data without partially importing a project', async () => {
    const JSZip = (await import('jszip')).default;
    const project = await fixture();
    await captureProject(project.id, '초고', '');
    const zip = await JSZip.loadAsync(await (await buildProjectPackage(project.id)).arrayBuffer());
    zip.file('snapshots/0/0.zip', 'damaged');
    const count = await db.projects.count();
    await expect(restorePackage(await zip.generateAsync({type:'blob'}))).rejects.toThrow('손상');
    expect(await db.projects.count()).toBe(count);
  });
});
