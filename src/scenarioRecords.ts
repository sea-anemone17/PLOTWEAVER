import { db, fresh, now, touch, type ScenarioRecords } from './data';
import type { ScenarioValue } from './scenario';
import { guardedProjectWrite } from './projectLease';

type TableName = keyof ScenarioRecords;
type RecordInput<T extends TableName> = Omit<ScenarioRecords[T], 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export async function saveScenarioRecord<T extends TableName>(projectId: string, name: T, input: RecordInput<T>, id?: string) {
  const table = db.table<ScenarioRecords[T], string>(name);
  await guardedProjectWrite(projectId, [table], async () => {
    const existing = id ? await table.get(id) : undefined;
    if (id && (!existing || existing.projectId !== projectId || existing.deletedAt)) throw Error('편집할 자료를 찾을 수 없습니다.');
    const identity = existing || fresh(projectId);
    await table.put({ ...identity, ...input, id: identity.id, projectId, updatedAt: now() } as ScenarioRecords[T]);
    await touch(projectId);
  });
}

export async function archiveScenarioRecord(projectId: string, name: TableName, id: string, archived: boolean) {
  const table = db.table<ScenarioRecords[TableName], string>(name);
  await guardedProjectWrite(projectId, [table], async () => {
    const existing = await table.get(id);
    if (!existing || existing.projectId !== projectId) throw Error('자료를 찾을 수 없습니다.');
    await table.put({ ...existing, deletedAt: archived ? now() : 0, updatedAt: now() });
    await touch(projectId);
  });
}
export function valueText(value: ScenarioValue) {
  return typeof value === 'boolean' ? (value ? '참' : '거짓') : String(value);
}
