import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, downloadBlob, fresh } from './data';
import { buildProjectPackage, restorePackage } from './backupZip';
import { guardedProjectWrite } from './projectLease';
import { Button } from './UI';

const LIMIT = 12;
export async function captureProject(projectId: string, title: string, description: string) {
  const blob = await buildProjectPackage(projectId);
  return guardedProjectWrite(projectId, [db.projectSnapshots], async () => {
    const count = await db.projectSnapshots.where('projectId').equals(projectId).count();
    if (count >= LIMIT) throw Error('스냅샷은 프로젝트당 ' + LIMIT + '개까지 보관할 수 있습니다. ZIP으로 내려받은 뒤 오래된 항목을 삭제해 주세요.');
    await db.projectSnapshots.add({ ...fresh(projectId), title: title.trim(), description: description.trim(), blob });
  });
}

export default function ProjectSnapshots({ projectId, openProject }: { projectId: string; openProject: (id: string) => void }) {
  const snapshots = useLiveQuery(() => db.projectSnapshots.where('projectId').equals(projectId).sortBy('createdAt'), [projectId], []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true); setStatus('');
    try { await action(); setStatus(message); }
    catch (cause) { setStatus(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="settings-panel scenario-form">
    <h2>프로젝트 스냅샷</h2>
    <p className="muted">원고, 설계 자료와 첨부파일을 한 시점에 저장합니다. 이 기기에 보관되며 다른 기기에는 ZIP을 내려받아 옮길 수 있습니다.</p>
    <label>이름<input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 테스트 플레이 직전"/></label>
    <label>설명<textarea value={description} onChange={e => setDescription(e.target.value)}/></label>
    <Button disabled={busy || !title.trim()} onClick={() => void run(async () => {
      await captureProject(projectId, title, description);
      setTitle(''); setDescription('');
    }, '스냅샷을 저장했습니다.')}>스냅샷 만들기</Button>
    {status && <p role="status">{status}</p>}
    <div className="scenario-list">{[...snapshots].reverse().map(item => <article key={item.id}>
      <strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString('ko-KR')}</small>
      {item.description && <p>{item.description}</p>}
      <div className="research-actions">
        <Button variant="soft" disabled={busy} onClick={() => void run(async () => {
          const [copy] = await restorePackage(item.blob);
          if (copy) openProject(copy.id);
        }, '별도 프로젝트로 복원했습니다.')}>별도 프로젝트로 복원</Button>
        <Button variant="soft" onClick={() => downloadBlob(item.blob, item.title.replace(/[\\/:*?"<>|]/g, '_') + '.plotweaver.zip')}>ZIP 다운로드</Button>
        <Button variant="ghost" disabled={busy} onClick={() => {
          if (confirm('이 스냅샷을 삭제하시겠습니까?')) void run(() => guardedProjectWrite(projectId, [db.projectSnapshots], async () => { await db.projectSnapshots.delete(item.id); }), '스냅샷을 삭제했습니다.');
        }}>삭제</Button>
      </div>
    </article>)}</div>
  </section>;
}
