import { useMemo, useState } from 'react';
import { db, now, touch, type EventCard, type Scene } from './data';
import { guardedProjectWrite } from './projectLease';
import { Button } from './UI';
import { emptyTiming, formatStoryDate, resolveTimeline } from './scenarioTimeline';

export default function TimelineCompare({ events, scenes, openScene }: { events: EventCard[]; scenes: Scene[]; openScene: (id: string) => void }) {
  const [selected, setSelected] = useState('');
  const resolution = useMemo(() => resolveTimeline(events), [events]);
  const event = events.find(item => item.id === selected);
  const ordered = [...events].sort((a, b) => (resolution.starts.get(a.id) ?? Infinity) - (resolution.starts.get(b.id) ?? Infinity) || a.order - b.order);
  const eventsById = new Map(events.map(item => [item.id, item]));
  return <div className="scenario-grid">
    <section className="settings-panel scenario-list">
      <h2>세계에서 일어난 사건</h2>
      {!events.length && <p>실제 사건을 만들면 시점을 지정할 수 있습니다.</p>}
      {ordered.map(item => {
        const start = resolution.starts.get(item.id);
        return <article key={item.id}>
          <strong>{item.title}</strong>
          <span>{start === undefined ? item.when || '시점 미정' : formatStoryDate(start)}
            {item.timing?.durationMinutes ? ' · ' + item.timing.durationMinutes + '분' : ''}</span>
          {resolution.issues.has(item.id) && <small>{resolution.issues.get(item.id)}</small>}
          <Button variant="soft" onClick={() => setSelected(item.id)}>시간 편집</Button>
          {event?.id === item.id && <TimingForm key={event.id} event={event} events={events} done={() => setSelected('')}/>}
        </article>;
      })}
    </section>
    <section className="settings-panel scenario-list">
      <h2>플레이 장면 순서</h2>
      <p className="muted">정렬된 장면 목록입니다. 실제 진행은 플롯에서 선택한 분기에 따라 달라집니다.</p>
      {[...scenes].sort((a, b) => a.order - b.order).map(scene => {
        const linked = eventsById.get(scene.eventId);
        return <article key={scene.id}><strong>{scene.title}</strong><small>실제 사건 · {linked?.title || '미연결'}</small>
          <Button variant="soft" onClick={() => openScene(scene.id)}>장면 원고</Button>
        </article>;
      })}
    </section>
  </div>;
}

function TimingForm({ event, events, done }: { event: EventCard; events: EventCard[]; done: () => void }) {
  const [draft, setDraft] = useState(() => event.timing || { ...emptyTiming, absolute: /^\d{4}-\d\d-\d\d$/.test(event.when) ? event.when + 'T00:00' : '' });
  const [relative, setRelative] = useState(!!draft.afterId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const commit = async () => {
    setBusy(true); setError('');
    try {
      if (relative && !draft.afterId) throw Error('시점의 기준이 될 사건을 선택해 주세요.');
      const timing = relative ? { ...draft, absolute: '' } : { ...draft, afterId: '', delayMinutes: 0 };
      const resolution = resolveTimeline(events.map(item => item.id === event.id ? { ...item, timing } : item));
      if (resolution.issues.has(event.id)) throw Error(resolution.issues.get(event.id));
      await guardedProjectWrite(event.projectId, [db.events], async () => {
        const current = await db.events.get(event.id);
        if (!current || current.projectId !== event.projectId) throw Error('사건을 찾을 수 없습니다.');
        await db.events.update(event.id, { timing, updatedAt: now() });
        await touch(event.projectId);
      });
      done();
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="scenario-form">
    <label>시점 방식<select value={relative ? 'relative' : 'absolute'} onChange={e => setRelative(e.target.value === 'relative')}>
      <option value="absolute">절대 시점</option><option value="relative">다른 사건이 끝난 뒤</option>
    </select></label>
    {relative ? <>
      <label>기준 사건<select value={draft.afterId} onChange={e => setDraft({ ...draft, afterId: e.target.value })}>
        <option value="">사건 선택</option>{events.filter(item => item.id !== event.id).map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select></label>
      <label>기준 사건 종료 후 경과 (분)<input type="number" min="0" value={draft.delayMinutes} onChange={e => setDraft({ ...draft, delayMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}/></label>
    </> : <label>시나리오 내 날짜와 시각<input type="datetime-local" value={draft.absolute} onChange={e => setDraft({ ...draft, absolute: e.target.value })}/></label>}
    <label>지속 시간 (분)<input type="number" min="0" value={draft.durationMinutes} onChange={e => setDraft({ ...draft, durationMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}/></label>
    <div className="research-actions"><Button disabled={busy} onClick={() => void commit()}>시점 저장</Button><Button variant="ghost" onClick={done}>취소</Button></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
