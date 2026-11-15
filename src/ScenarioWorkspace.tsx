import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, now, touch, type Clue, type ClueRoute, type Foreshadow, type Project, type Scene } from './data';
import { Button } from './UI';
import { guardedProjectWrite } from './projectLease';
import { archiveScenarioRecord, saveScenarioRecord, valueText } from './scenarioRecords';
import { conditionError, emptyFlow, validValue, type ScenarioValue, type VariableType } from './scenario';
import { ConditionField, EffectsField, firstValue, ValueField, variableTypes } from './ScenarioFields';
import { analyze, type ScenarioPlan } from './scenarioAnalysis';
import Simulator from './Simulator';
import RuleDesigner from './RuleDesigner';

type Tab = 'flow' | 'clues' | 'foreshadow' | 'rules' | 'play' | 'diagnostics';
const tabs: Record<Tab, string> = { flow: '변수·장면', clues: '단서 경로', foreshadow: '복선·회수', rules: 'CoC 7판', play: '테스트 플레이', diagnostics: '진단' };
const kinds = ['정보형', '상징형', '인물형', '사건형', '오도형'];
const states = ['미배치', '암시 중', '회수 예정', '회수 완료', '의도적 미회수'];
const emptyForeshadow = () => ({ title: '', kind: '정보형', status: '미배치', introductionId: '', hintIds: [] as string[], payoffId: '', payoff: '', clueId: '', handoutId: '', npcId: '' });
const newRoute = () => ({ clueId: '', sceneId: '', guard: undefined, note: '' } as Pick<ClueRoute, 'clueId' | 'sceneId' | 'guard' | 'note'>);

function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (task: () => Promise<void>, confirmation = '저장했습니다.') => {
    setBusy(true); setMessage('');
    try { await task(); setMessage(confirmation); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return { busy, message, run };
}
function SelectEntity({ label, items, value, change, empty = '미지정' }: {
  label: string; items: { id: string; title: string }[]; value: string; change: (value: string) => void; empty?: string;
}) {
  return <label>{label}<select value={value} onChange={event => change(event.target.value)}>
    <option value="">{empty}</option>
    {!!value && !items.some(item => item.id === value) && <option value={value} disabled>사용할 수 없는 연결</option>}
    {items.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
  </select></label>;
}
export default function ScenarioWorkspace({ project, plan, openScene, openPlot, openClues }: {
  project: Project; plan: Omit<ScenarioPlan, 'variables' | 'routes' | 'foreshadows' | 'handouts' | 'rules'>;
  openScene: (id: string) => void; openPlot: () => void; openClues: () => void;
}) {
  const [tab, setTab] = useState<Tab>('flow');
  const id = project.id;
  const extras = useLiveQuery(() => db.transaction('r', [db.scenarioVariables, db.clueRoutes, db.foreshadows, db.handouts, db.ruleEvents], async () => {
    const [variables, routes, foreshadows, handouts, rules] = await Promise.all([
      db.scenarioVariables.where('projectId').equals(id).toArray(),
      db.clueRoutes.where('projectId').equals(id).toArray(),
      db.foreshadows.where('projectId').equals(id).toArray(),
      db.handouts.where('projectId').equals(id).toArray(),
      db.ruleEvents.where('projectId').equals(id).toArray()
    ]);
    return { variables, routes, foreshadows, handouts, rules };
  }), [id]);
  if (!extras) return <p>시나리오 데이터를 불러오는 중입니다.</p>;
  const full: ScenarioPlan = { ...plan, ...extras };
  return <div className="scenario-workspace">
    <div className="tab-bar" aria-label="시나리오 설계 메뉴">
      {Object.entries(tabs).map(([key, text]) => <button key={key} type="button" className={tab === key ? 'selected' : ''} aria-pressed={tab === key} onClick={() => setTab(key as Tab)}>{text}</button>)}
    </div>
    {tab === 'flow' && <div className="scenario-grid"><Variables projectId={id} plan={full}/><SceneSettings project={project} plan={full} openPlot={openPlot}/></div>}
    {tab === 'clues' && <CluePaths projectId={id} plan={full} openClues={openClues}/>}
    {tab === 'foreshadow' && <Foreshadows projectId={id} plan={full}/>}
    {tab === 'rules' && <RuleDesigner projectId={id} scenes={full.scenes} rules={full.rules}/>}
    <div hidden={tab !== 'play'}><Simulator projectId={id} plan={full}/></div>
    {tab === 'diagnostics' && <Diagnostics plan={full} openScene={openScene}/>}
  </div>;
}

function Variables({ projectId, plan }: { projectId: string; plan: ScenarioPlan }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<VariableType>('boolean');
  const [rawOptions, setOptions] = useState('');
  const [initial, setInitial] = useState<ScenarioValue>(false);
  const { busy, message, run } = useAction();
  const options = Array.from(new Set(rawOptions.split('\n').map(item => item.trim()).filter(Boolean)));
  const reset = () => { setId(''); setName(''); setType('boolean'); setOptions(''); setInitial(false); };
  const save = () => run(async () => {
    const clean = name.trim();
    if (!clean) throw Error('변수 이름을 입력해 주세요.');
    if (plan.variables.some(item => item.id !== id && item.name === clean)) throw Error('같은 이름의 변수가 있습니다. 휴지통도 확인해 주세요.');
    const variable = { id, name: clean, type, initial, options: type === 'enum' ? options : [] };
    if (!validValue(variable, initial)) throw Error('변수의 초기값을 선택해 주세요.');
    await saveScenarioRecord(projectId, 'scenarioVariables', { name: variable.name, type, initial, options: variable.options }, id || undefined);
    reset();
  });
  return <section className="settings-panel scenario-form">
    <h2>시나리오 변수</h2>
    <label>변수 이름<input value={name} onChange={e => setName(e.target.value)} placeholder="예: 장미의 생존 여부"/></label>
    <label>유형<select value={type} disabled={!!id} onChange={e => {
      const next = e.target.value as VariableType;
      setType(next); setInitial(firstValue(next, options));
    }}>{Object.entries(variableTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {type === 'enum' && <label>선택지 (한 줄에 하나)<textarea value={rawOptions} disabled={!!id} onChange={e => setOptions(e.target.value)}/></label>}
    <label>초기값<ValueField variable={{ type, options }} value={initial} change={setInitial}/></label>
    <div className="research-actions"><Button disabled={busy} onClick={() => void save()}>변수 저장</Button>{id && <Button variant="soft" onClick={reset}>새 변수</Button>}</div>
    {message && <p role="status">{message}</p>}
    <div className="scenario-list">
      {plan.variables.filter(item => !item.deletedAt).map(item => <article key={item.id}>
        <strong>{item.name}</strong><small>{variableTypes[item.type]} · {valueText(item.initial)}</small>
        <div className="research-actions">
          <Button variant="soft" onClick={() => { setId(item.id); setName(item.name); setType(item.type); setInitial(item.initial); setOptions(item.options.join('\n')); }}>편집</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
            await archiveScenarioRecord(projectId, 'scenarioVariables', item.id, true);
            if (id === item.id) reset();
          }, '휴지통으로 이동했습니다. 이 변수를 쓰는 조건을 진단에서 확인할 수 있습니다.')}>휴지통으로</Button>
        </div>
      </article>)}
      <Archived projectId={projectId} table="scenarioVariables" items={plan.variables.map(item => ({ ...item, title: item.name }))} run={run} busy={busy}/>
    </div>
  </section>;
}

function SceneSettings({ project, plan, openPlot }: { project: Project; plan: ScenarioPlan; openPlot: () => void }) {
  const [id, setId] = useState('');
  const { busy, message, run } = useAction();
  const scene = plan.scenes.find(item => item.id === id);
  return <section className="settings-panel scenario-form">
    <h2>장면 진행</h2>
    <SelectEntity label="프로젝트 시작 장면" items={plan.scenes} value={project.startSceneId || ''} change={startSceneId =>
      void run(() => guardedProjectWrite(project.id, [], async () => {
        await db.projects.update(project.id, { startSceneId: startSceneId || undefined, updatedAt: now() });
      }))}/>
    <SelectEntity label="진행을 편집할 장면" items={plan.scenes} value={id} change={setId}/>
    {scene && <SceneFlowForm key={scene.id} scene={scene} variables={plan.variables.filter(item => !item.deletedAt)}/>}
    <Button variant="soft" disabled={busy} onClick={openPlot}>플롯 연결 편집</Button>
    {message && <p role="status">{message}</p>}
  </section>;
}
function SceneFlowForm({ scene, variables }: { scene: Scene; variables: ScenarioPlan['variables'] }) {
  const [flow, setFlow] = useState(() => scene.flow || emptyFlow());
  const { busy, message, run } = useAction();
  return <div className="scenario-form">
    <label className="scenario-check"><input type="checkbox" checked={flow.ending} onChange={e => setFlow({ ...flow, ending: e.target.checked })}/>결말로 종료할 수 있는 장면</label>
    <ConditionField title="장면 진입에 필요한 조건" value={flow.entry} variables={variables} change={entry => setFlow({ ...flow, entry })}/>
    <EffectsField title="진입 후 변수 변경" value={flow.onEntry} variables={variables} change={onEntry => setFlow({ ...flow, onEntry })}/>
    <ConditionField title="장면을 떠나거나 끝내는 데 필요한 조건" value={flow.exit} variables={variables} change={exit => setFlow({ ...flow, exit })}/>
    <EffectsField title="장면을 떠날 때 변수 변경" value={flow.onExit} variables={variables} change={onExit => setFlow({ ...flow, onExit })}/>
    <Button disabled={busy} onClick={() => void run(() => guardedProjectWrite(scene.projectId, [db.scenes, db.scenarioVariables], async () => {
      const current = await db.scenes.get(scene.id);
      if (!current || current.deletedAt || current.projectId !== scene.projectId) throw Error('장면을 찾을 수 없습니다.');
      const active = await db.scenarioVariables.where('projectId').equals(scene.projectId).filter(item => !item.deletedAt).toArray();
      for (const condition of [flow.entry, flow.exit]) {
        if (!condition) continue;
        const error = conditionError(condition, active);
        if (error) throw Error(error);
      }
      for (const effect of [...flow.onEntry, ...flow.onExit]) {
        const variable = active.find(item => item.id === effect.variableId);
        if (!variable || !validValue(variable, effect.value)) throw Error('변수 변경의 대상이나 값이 잘못되었습니다.');
      }
      await db.scenes.update(scene.id, { flow, updatedAt: now() });
      await touch(scene.projectId);
    }))}>장면 진행 저장</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}

type Action = ReturnType<typeof useAction>;
function Archived({ projectId, table, items, run, busy }: {
  projectId: string; table: 'scenarioVariables' | 'clueRoutes' | 'foreshadows';
  items: { id: string; title: string; deletedAt?: number }[]; run: Action['run']; busy: boolean;
}) {
  const archived = items.filter(item => item.deletedAt);
  return archived.length > 0 && <details><summary>휴지통 ({archived.length})</summary>{archived.map(item =>
    <article key={item.id}><span>{item.title}</span><Button variant="soft" disabled={busy} onClick={() => void run(() => archiveScenarioRecord(projectId, table, item.id, false), '복원했습니다.')}>복원</Button></article>)}</details>;
}
function CluePaths({ projectId, plan, openClues }: { projectId: string; plan: ScenarioPlan; openClues: () => void }) {
  const [route, setRoute] = useState(newRoute);
  const [id, setId] = useState('');
  const { busy, message, run } = useAction();
  const { scenes, clues, routes } = plan;
  const active = plan.variables.filter(item => !item.deletedAt);
  const clue = clues.find(item => item.id === route.clueId);
  const routeTitle = (item: ClueRoute) => (clues.find(c => c.id === item.clueId)?.title || '단서 없음') + ' · ' + (scenes.find(s => s.id === item.sceneId)?.title || '장면 없음');
  const reset = () => { setId(''); setRoute(newRoute()); };
  const setRequired = (item: Clue, required: boolean) => run(() => guardedProjectWrite(projectId, [db.clues], async () => {
    await db.clues.update(item.id, { required, updatedAt: now() });
    await touch(projectId);
  }));
  return <div className="scenario-grid">
    <section className="settings-panel scenario-form">
      <h2>{id ? '획득 경로 편집' : '단서 획득 경로'}</h2>
      <SelectEntity label="단서" items={clues} value={route.clueId} change={clueId => setRoute({ ...route, clueId })}/>
      {!clues.length && <Button variant="soft" onClick={openClues}>자료실에서 단서 추가</Button>}
      {clue && <label className="scenario-check"><input type="checkbox" checked={!!clue.required} disabled={busy} onChange={e => void setRequired(clue, e.target.checked)}/>결말에 필요한 필수 단서</label>}
      <SelectEntity label="발견 장면" items={scenes} value={route.sceneId} change={sceneId => setRoute({ ...route, sceneId })}/>
      <ConditionField title="획득 조건" value={route.guard} variables={active} change={guard => setRoute({ ...route, guard })}/>
      <label>획득 방법·판정 메모<textarea value={route.note} onChange={e => setRoute({ ...route, note: e.target.value })}/></label>
      <div className="research-actions">
        <Button disabled={busy} onClick={() => void run(async () => {
          if (!clue || !scenes.some(scene => scene.id === route.sceneId)) throw Error('단서와 발견 장면을 선택해 주세요.');
          if (route.guard) {
            const error = conditionError(route.guard, active);
            if (error) throw Error(error);
          }
          await saveScenarioRecord(projectId, 'clueRoutes', route, id || undefined);
          reset();
        })}>경로 저장</Button>
        {id && <Button variant="soft" onClick={reset}>새 경로</Button>}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
    <section className="settings-panel scenario-list"><h2>등록한 경로</h2>
      {routes.filter(item => !item.deletedAt).map(item => <article key={item.id}>
        <strong>{routeTitle(item)}</strong>{item.note && <p>{item.note}</p>}
        <div className="research-actions">
          <Button variant="soft" onClick={() => { setId(item.id); setRoute({ clueId: item.clueId, sceneId: item.sceneId, guard: item.guard, note: item.note }); }}>편집</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
            await archiveScenarioRecord(projectId, 'clueRoutes', item.id, true); if (id === item.id) reset();
          }, '휴지통으로 이동했습니다.')}>휴지통으로</Button>
        </div>
      </article>)}
      <Archived projectId={projectId} table="clueRoutes" items={routes.map(item => ({ ...item, title: routeTitle(item) }))} run={run} busy={busy}/>
    </section>
  </div>;
}

function Foreshadows({ projectId, plan }: { projectId: string; plan: ScenarioPlan }) {
  const [form, setForm] = useState(emptyForeshadow);
  const [id, setId] = useState('');
  const { busy, message, run } = useAction();
  const change = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value });
  const reset = () => { setForm(emptyForeshadow()); setId(''); };
  const edit = ({ title, kind, status, introductionId, hintIds, payoffId, payoff, clueId, handoutId, npcId, id }: Foreshadow) => {
    setId(id); setForm({ title, kind, status, introductionId, hintIds, payoffId, payoff, clueId, handoutId, npcId });
  };
  return <div className="scenario-grid">
    <section className="settings-panel scenario-form"><h2>복선과 회수</h2>
      <label>복선 제목<input value={form.title} onChange={e => change('title', e.target.value)}/></label>
      <div className="scenario-fields">
        <label>유형<input list="scenario-foreshadow-kinds" value={form.kind} onChange={e => change('kind', e.target.value)}/><datalist id="scenario-foreshadow-kinds">{kinds.map(kind => <option value={kind} key={kind}/>)}</datalist></label>
        <label>회수 상태<select value={form.status} onChange={e => change('status', e.target.value)}>{states.map(state => <option key={state}>{state}</option>)}</select></label>
      </div>
      <SelectEntity label="최초 제시 장면" items={plan.scenes} value={form.introductionId} change={id => change('introductionId', id)}/>
      <details><summary>추가 암시 장면 ({form.hintIds.length})</summary>
        {[...plan.scenes, ...form.hintIds.filter(id => !plan.scenes.some(item => item.id === id)).map(id => ({ id, title: '사용할 수 없는 장면' }))].map(item =>
          <label className="scenario-check" key={item.id}><input type="checkbox" checked={form.hintIds.includes(item.id)} onChange={e =>
            change('hintIds', e.target.checked ? [...form.hintIds, item.id] : form.hintIds.filter(id => id !== item.id))}/>{item.title}</label>)}
      </details>
      <SelectEntity label="회수 장면" items={plan.scenes} value={form.payoffId} change={id => change('payoffId', id)}/>
      <label>회수 방식<textarea value={form.payoff} onChange={e => change('payoff', e.target.value)}/></label>
      <SelectEntity label="관련 단서" items={plan.clues} value={form.clueId} change={id => change('clueId', id)}/>
      <SelectEntity label="관련 핸드아웃" items={plan.handouts} value={form.handoutId} change={id => change('handoutId', id)}/>
      <SelectEntity label="관련 NPC" items={plan.lore.filter(item => item.kind === 'NPC')} value={form.npcId} change={id => change('npcId', id)}/>
      <div className="research-actions"><Button disabled={busy} onClick={() => void run(async () => {
        if (!form.title.trim()) throw Error('복선 제목을 입력해 주세요.');
        await saveScenarioRecord(projectId, 'foreshadows', { ...form, title: form.title.trim(), kind: form.kind.trim() || '기타' }, id || undefined);
        reset();
      })}>복선 저장</Button>{id && <Button variant="soft" onClick={reset}>새 복선</Button>}</div>
      {message && <p role="status">{message}</p>}
    </section>
    <section className="settings-panel scenario-list"><h2>복선 목록</h2>
      {plan.foreshadows.filter(item => !item.deletedAt).map(item => <article key={item.id}>
        <strong>{item.title}</strong><small>{item.kind} · {item.status}</small>
        <p>{plan.scenes.find(scene => scene.id === item.introductionId)?.title || '제시 미지정'} → {plan.scenes.find(scene => scene.id === item.payoffId)?.title || '회수 미지정'}</p>
        <div className="research-actions"><Button variant="soft" onClick={() => edit(item)}>편집</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
            await archiveScenarioRecord(projectId, 'foreshadows', item.id, true); if (id === item.id) reset();
          }, '휴지통으로 이동했습니다.')}>휴지통으로</Button></div>
      </article>)}
      <Archived projectId={projectId} table="foreshadows" items={plan.foreshadows} run={run} busy={busy}/>
    </section>
  </div>;
}
function Diagnostics({ plan, openScene }: { plan: ScenarioPlan; openScene: (id: string) => void }) {
  const issues = analyze(plan);
  return <section className="settings-panel scenario-list"><h2>시나리오 진단</h2>
    <p className="muted">장면 도달 여부는 연결선을 기준으로 봅니다. 조건을 적용한 실제 진행은 테스트 플레이에서 확인하세요.</p>
    {!issues.length && <p>{plan.scenes.length ? '현재 검사 항목에서 문제가 발견되지 않았습니다.' : '장면을 추가하면 진단을 시작할 수 있습니다.'}</p>}
    {(['오류', '경고', '제안'] as const).map(severity => <div key={severity}>
      <h3>{severity} ({issues.filter(item => item.severity === severity).length})</h3>
      {issues.filter(item => item.severity === severity).map(item => <article key={item.key}>
        <span>{item.message}</span>{item.sceneId && plan.scenes.some(scene => scene.id === item.sceneId) &&
          <Button variant="soft" onClick={() => openScene(item.sceneId!)}>장면 열기</Button>}
      </article>)}
    </div>)}
  </section>;
}
