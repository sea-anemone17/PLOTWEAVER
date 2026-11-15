import { useUnsavedChanges } from './unsavedChanges';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from './UI';
import { db, fresh, now, touch, type Clue, type Lore, type NpcRelationship, type Scene } from './data';
import { guardedProjectWrite } from './projectLease';
import { archiveScenarioRecord, saveScenarioRecord } from './scenarioRecords';
import { emptyNpc, findWikiLinks, statNames, type NpcProfile } from './worldWiki';
import { maxHp, maxMp } from './coc7';

const categories = ['인물', '장소', '조직', '역사', '사건', '개념', '기타'];
const statuses = ['초안', '가설', '확정', '폐기'];
const npcFields = { group: '소속', purpose: '목적', desire: '욕망', fear: '공포', secret: '비밀 (KP용)' } as const;
const relations = ['우호', '적대', '협력', '의존', '혈연', '기타'];
const blankRelation = (fromNpcId: string) => ({ fromNpcId, toNpcId: '', kind: '우호', pointOfView: '', private: true });

export default function WorldWiki({ projectId, lore, clues, scenes, openScene }: {
  projectId: string; lore: Lore[]; clues: Clue[]; scenes: Scene[]; openScene: (id: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const current = lore.find(note => note.id === selected);
  const sceneLinks = useLiveQuery(() => db.sceneLinks.where('projectId').equals(projectId).filter(link => link.resourceKind === 'lore').toArray(), [projectId], []);
  const npcLinks = useLiveQuery(() => db.npcRelationships.where('projectId').equals(projectId).toArray(), [projectId], []);
  const visible = lore.filter(note => [note.title, note.body, note.wiki?.category, note.wiki?.tags].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const grouped = [...new Set(visible.map(note => note.wiki?.category || (note.kind === 'NPC' ? '인물' : note.kind)))];
  return <div className="scenario-grid">
    <section className="settings-panel scenario-form">
      <h2>프로젝트 세계관</h2>
      <label>문서 검색<input value={search} onChange={e => setSearch(e.target.value)}/></label>
      <Button data-unsaved-navigation variant="soft" onClick={() => setSelected('')}>새 문서</Button>
      {grouped.map(group => <details key={group} open><summary>{group}</summary>
        <div className="scenario-list">{visible.filter(note => (note.wiki?.category || (note.kind === 'NPC' ? '인물' : note.kind)) === group).map(note =>
          <Button data-unsaved-navigation key={note.id} variant={note.id === selected ? 'primary' : 'ghost'} onClick={() => setSelected(note.id)}>{note.title} · {note.wiki?.status || '초안'}</Button>
        )}</div>
      </details>)}
    </section>
    <div className="stack">
      <WikiEditor key={current?.id || 'new'} projectId={projectId} current={current} lore={lore} clues={clues}
        select={setSelected} linkedScenes={scenes.filter(scene => sceneLinks.some(link => link.resourceId === current?.id && link.sceneId === scene.id))}
        openScene={openScene}/>
      {current?.kind === 'NPC' && <NpcRelations key={current.id} npc={current} npcs={lore.filter(note => note.kind === 'NPC')} rows={npcLinks}/>}
    </div>
  </div>;
}
function WikiEditor({ projectId, current, lore, clues, select, linkedScenes, openScene }: {
  projectId: string; current?: Lore; lore: Lore[]; clues: Clue[]; select: (id: string) => void;
  linkedScenes: Scene[]; openScene: (id: string) => void;
}) {
  const guard = useUnsavedChanges(projectId);
  const [title, setTitle] = useState(current?.title || '');
  const [body, setBody] = useState(current?.body || '');
  const [category, setCategory] = useState(current?.wiki?.category || (current?.kind === 'NPC' ? '인물' : current?.kind || '개념'));
  const [tags, setTags] = useState(current?.wiki?.tags || '');
  const [status, setStatus] = useState(current?.wiki?.status || '초안');
  const [isNpc, setNpcMode] = useState(current?.kind === 'NPC');
  const [privateNote, setPrivate] = useState(current?.private ?? true);
  const [npc, setNpc] = useState(current?.npc || emptyNpc());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const links = findWikiLinks(body, lore, current?.wiki?.links);
  const backlinks = current ? lore.filter(note => note.id !== current.id && note.wiki?.links.some(link => link.targetId === current.id)) : [];
  const profileValue = <K extends keyof NpcProfile>(key: K, value: NpcProfile[K]) => setNpc(previous => ({ ...previous, [key]: value }));
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      if (!title.trim()) throw Error('문서 이름을 입력해 주세요.');
      const identity = current || fresh(projectId);
      await guardedProjectWrite(projectId, [db.lore], async () => {
        const old = current ? await db.lore.get(current.id) : undefined;
        if (current && (!old || old.projectId !== projectId)) throw Error('편집할 문서를 찾을 수 없습니다.');
        await db.lore.put({ ...identity, title: title.trim(), body, kind: isNpc ? 'NPC' : current?.kind || '세계관',
          private: privateNote, updatedAt: now(),
          wiki: { category: category.trim() || '기타', tags, status, links },
          npc: isNpc ? npc : undefined });
        await touch(projectId);
      });
      guard.markClean(); select(identity.id); setMessage('문서를 저장했습니다.');
    } catch (cause) { setMessage(String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="settings-panel scenario-form" onChangeCapture={guard.markDirty}>
    <h2>{current ? '위키 문서 편집' : '새 위키 문서'}</h2>
    <label>문서 이름<input value={title} onChange={e => setTitle(e.target.value)}/></label>
    <label className="scenario-check"><input type="checkbox" disabled={!!current} checked={isNpc} onChange={e => {
      setNpcMode(e.target.checked); if (e.target.checked) setCategory('인물');
    }}/>NPC 문서</label>
    <div className="scenario-fields">
      <label>분류<input list="wiki-categories" value={category} onChange={e => setCategory(e.target.value)}/>
        <datalist id="wiki-categories">{categories.map(name => <option key={name} value={name}/>)}</datalist></label>
      <label>확정 여부<select value={status} onChange={e => setStatus(e.target.value)}>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>
    </div>
    <label>태그<input value={tags} onChange={e => setTags(e.target.value)}/></label>
    <label>본문<textarea rows={8} value={body} onChange={e => setBody(e.target.value)} placeholder="다른 문서를 연결하려면 [[문서명]]을 입력하세요."/></label>
    <label className="scenario-check"><input type="checkbox" checked={privateNote} onChange={e => setPrivate(e.target.checked)}/>KP 전용 설정</label>
    {isNpc && <details><summary>NPC 프로필과 CoC 특성치</summary>
      {Object.entries(npcFields).map(([key, label]) => <label key={key}>{label}<input value={npc[key as keyof typeof npcFields]} onChange={e => profileValue(key as keyof typeof npcFields, e.target.value)}/></label>)}
      <div className="scenario-fields">{statNames.map(stat => <label key={stat}>{stat}
        <input type="number" min="0" step="1" value={npc.stats[stat] ?? ''} onChange={e => {
          const stats = { ...npc.stats };
          if (e.target.value === '') delete stats[stat];
          else stats[stat] = Math.max(0, Math.floor(Number(e.target.value) || 0));
          profileValue('stats', stats);
        }}/></label>)}</div>
      <p>{npc.stats.CON !== undefined && npc.stats.SIZ !== undefined && 'HP ' + maxHp(npc.stats.CON, npc.stats.SIZ)}
        {npc.stats.POW !== undefined && ' · MP ' + maxMp(npc.stats.POW) + ' · 시작 SAN ' + npc.stats.POW}</p>
      <h3>알고 있는 단서</h3>
      {clues.map(clue => <label key={clue.id} className="scenario-check"><input type="checkbox" checked={npc.knownClueIds.includes(clue.id)} onChange={e =>
        profileValue('knownClueIds', e.target.checked ? [...npc.knownClueIds, clue.id] : npc.knownClueIds.filter(id => id !== clue.id))}/>{clue.title}</label>)}
    </details>}
    {guard.dirty && <p role="status">저장되지 않은 변경 사항이 있습니다.</p>}
    <Button disabled={busy} onClick={() => void save()}>문서 저장</Button>
    {message && <p role="status">{message}</p>}
    {(links.length > 0 || backlinks.length > 0 || linkedScenes.length > 0) && <div className="scenario-list">
      {links.length > 0 && <h3>연결한 문서</h3>}
      {links.map(link => {
        const target = lore.find(note => note.id === link.targetId);
        return target ? <Button data-unsaved-navigation key={link.label} variant="soft" onClick={() => select(target.id)}>{target.title}</Button> :
          <span key={link.label}>[[{link.label}]] · 연결할 문서가 없거나 이름이 겹칩니다.</span>;
      })}
      {backlinks.length > 0 && <h3>이 문서를 참조하는 문서</h3>}
      {backlinks.map(note => <Button data-unsaved-navigation key={note.id} variant="soft" onClick={() => select(note.id)}>{note.title}</Button>)}
      {linkedScenes.length > 0 && <h3>연결된 장면 원고</h3>}
      {linkedScenes.map(scene => <Button data-unsaved-navigation key={scene.id} variant="soft" onClick={() => openScene(scene.id)}>{scene.title}</Button>)}
    </div>}
  </section>;
}

function NpcRelations({ npc, npcs, rows }: { npc: Lore; npcs: Lore[]; rows: NpcRelationship[] }) {
  const guard = useUnsavedChanges(npc.projectId);
  const [form, setForm] = useState(() => blankRelation(npc.id));
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await task(); setMessage('저장했습니다.'); }
    catch (cause) { setMessage(String(cause)); }
    finally { setBusy(false); }
  };
  const matches = rows.filter(item => item.fromNpcId === npc.id || item.toNpcId === npc.id);
  const name = (id: string) => npcs.find(note => note.id === id)?.title || 'NPC 없음';
  return <section className="settings-panel scenario-form" onChangeCapture={guard.markDirty}>
    <h2>NPC 관계</h2>
    <label>{name(form.fromNpcId)}에서 향하는 관계<select value={form.toNpcId} onChange={e => setForm({ ...form, toNpcId: e.target.value })}>
      <option value="">대상 NPC 선택</option>{npcs.filter(note => note.id !== form.fromNpcId).map(note => <option key={note.id} value={note.id}>{note.title}</option>)}
    </select></label>
    <label>관계 유형<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{relations.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label>{name(form.fromNpcId)}의 주관적 인식<textarea value={form.pointOfView} onChange={e => setForm({ ...form, pointOfView: e.target.value })}/></label>
    <label className="scenario-check"><input type="checkbox" checked={form.private} onChange={e => setForm({ ...form, private: e.target.checked })}/>KP 전용 관계</label>
    <div className="research-actions"><Button disabled={busy || !form.toNpcId} onClick={() => void run(async () => {
      if (!npcs.some(note => note.id === form.toNpcId) || form.toNpcId === form.fromNpcId) throw Error('대상 NPC를 선택해 주세요.');
      await saveScenarioRecord(npc.projectId, 'npcRelationships', form, id || undefined);
      setId(''); setForm(blankRelation(npc.id)); guard.markClean();
    })}>관계 저장</Button>{id && <Button data-unsaved-navigation variant="soft" onClick={() => { setId(''); setForm(blankRelation(npc.id)); guard.markClean(); }}>새 관계</Button>}</div>
    {guard.dirty && <p role="status">저장되지 않은 변경 사항이 있습니다.</p>}
    {message && <p role="status">{message}</p>}
    <div className="scenario-list">
      {matches.map(row => <article key={row.id}>
        <strong>{name(row.fromNpcId)} → {name(row.toNpcId)} · {row.kind}</strong>
        <small>{row.private ? 'KP 전용' : '공개 가능'}{row.deletedAt ? ' · 휴지통' : ''}</small>{row.pointOfView && <p>{row.pointOfView}</p>}
        <div className="research-actions">
          {!row.deletedAt && <Button data-unsaved-navigation variant="soft" onClick={() => {
            guard.markClean(); setId(row.id); setForm({ fromNpcId: row.fromNpcId, toNpcId: row.toNpcId, kind: row.kind, pointOfView: row.pointOfView, private: row.private });
          }}>편집</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
            await archiveScenarioRecord(npc.projectId, 'npcRelationships', row.id, !row.deletedAt);
            if (id === row.id) { setId(''); setForm(blankRelation(npc.id)); }
          })}>{row.deletedAt ? '복원' : '휴지통으로'}</Button>
        </div>
      </article>)}
    </div>
  </section>;
}
