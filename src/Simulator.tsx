import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './data';
import { Button } from './UI';
import { choices, move, startPlay, type PlayState, type ScenarioPlan } from './scenarioAnalysis';
import { applyEffects, evaluate } from './scenario';
import { ValueField } from './ScenarioFields';
import { archiveScenarioRecord, saveScenarioRecord, valueText } from './scenarioRecords';
import { previewRule } from './RuleDesigner';
import { levels, ruleKinds, ruleSources } from './coc7';

export default function Simulator({ projectId, plan }: { projectId: string; plan: ScenarioPlan }) {
  const [startId, setStartId] = useState('');
  const [state, setState] = useState<PlayState>();
  const [report, setReport] = useState('');
  const [keeper, setKeeper] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const logs = useLiveQuery(() => db.simulationLogs.where('projectId').equals(projectId).reverse().sortBy('createdAt'), [projectId], []);
  const active = plan.scenes.find(scene => scene.id === state?.sceneId);
  const available = state ? choices(plan, state) : [];
  const selectedStart = startId || plan.startSceneId || '';
  const finish = () => {
    if (!state || !active || evaluate(active.flow?.exit, state.values) !== true) return;
    setState({ ...state, values: applyEffects(state.values, active.flow?.onExit), finished: true, steps: [...state.steps, '결말 · ' + active.title] });
  };
  const endingAllowed = !!(state && active?.flow?.ending && evaluate(active.flow.exit, state.values) === true);
  const routeOptions = state ? plan.routes.filter(route => !route.deletedAt && route.sceneId === state.sceneId && evaluate(route.guard, state.values) === true) : [];
  const missing = plan.clues.filter(clue => clue.required && !state?.clues.includes(clue.id));
  const outcome = state?.finished ? '결말 도달' : available.some(choice => !choice.reason) || endingAllowed ? '중간 기록' : '진행 불가 또는 미작성 분기';
  const log = (text: string) => setState(current => current ? { ...current, steps: [...current.steps, text] } : current);
  const archive = async (id: string, deleted: boolean) => {
    setSaving(true);
    try { await archiveScenarioRecord(projectId, 'simulationLogs', id, deleted); setStatus(deleted ? '로그를 휴지통으로 이동했습니다.' : '로그를 복원했습니다.'); }
    catch (error) { setStatus(String(error)); }
    finally { setSaving(false); }
  };
  return <div className="scenario-grid">
    <section className="settings-panel scenario-form">
      <h2>테스트 플레이</h2>
      <label>시작 장면<select value={selectedStart} onChange={event => setStartId(event.target.value)}>
        <option value="">시작 장면 선택</option>{plan.scenes.map(scene => <option value={scene.id} key={scene.id}>{scene.title}</option>)}
      </select></label>
      <Button disabled={!selectedStart} onClick={() => {
        if (state && !confirm('현재 테스트를 종료하고 시작 장면부터 다시 진행하시겠습니까?')) return;
        const scene = plan.scenes.find(item => item.id === selectedStart);
        const next = scene && startPlay(scene, plan.variables);
        if (!next) { setStatus('시작 장면이 없거나 초기값으로 진입 조건을 만족하지 않습니다.'); return; }
        setState(next); setKeeper(false); setStatus(''); setReport('');
      }}>{state ? '다시 시작' : '시작'}</Button>
      {state && !active && <p role="alert">현재 장면을 사용할 수 없습니다. 장면을 복원하거나 다른 장면에서 시작해 주세요.</p>}
      {state && active && <>
        <h3>{active.title} · {outcome}</h3>
        {!state.finished && <>
          <p>{active.purpose || active.body}</p>
          {available.some(choice => choice.keeperRequired) && <label className="scenario-check"><input type="checkbox" checked={keeper} onChange={e => setKeeper(e.target.checked)}/>선택할 분기의 자유 서술 조건을 충족함</label>}
          {available.map(choice => <div className="scenario-choice" key={choice.edge.id}>
            <Button disabled={!!choice.reason || (choice.keeperRequired && !keeper) || state.steps.length >= 1000} variant="soft" onClick={() => {
              const next = move(plan, state, choice.edge.id, keeper);
              if (next) { setState(next); setKeeper(false); }
            }}>{choice.edge.label || choice.next?.title || '도착 미정'}</Button>
            <small>{[choice.reason, choice.edge.condition].filter(Boolean).join(' · ')}</small>
          </div>)}
          {endingAllowed && <Button onClick={finish}>이 결말로 종료</Button>}
          {state.steps.length >= 1000 && <p>이 테스트에서 1,000개 기록에 도달했습니다. 로그를 저장할 수 있습니다.</p>}
          <h3>이 장면의 단서</h3>
          {!routeOptions.length && <p className="muted small">현재 조건으로 획득할 수 있는 단서가 없습니다.</p>}
          {routeOptions.map(route => {
            const clue = plan.clues.find(item => item.id === route.clueId);
            return clue && <div className="scenario-choice" key={route.id}>
              <Button variant="soft" disabled={state.clues.includes(clue.id)} onClick={() => setState({
                ...state, clues: [...state.clues, clue.id], steps: [...state.steps, '단서 획득 · ' + clue.title]
              })}>{state.clues.includes(clue.id) ? '획득함 · ' : '획득 · '}{clue.title}</Button>
              {route.note && <small>{route.note}</small>}
            </div>;
          })}
          {plan.handouts.some(item => item.visibility === 'player' && (item.sceneId || item.clueId)) && <>
            <h3>공개할 수 있는 핸드아웃</h3>
            <ul>{plan.handouts.filter(item => item.visibility === 'player' && (item.sceneId || item.clueId) &&
              (!item.sceneId || item.sceneId === state.sceneId) && (!item.clueId || state.clues.includes(item.clueId))).map(item => <li key={item.id}>{item.title}</li>)}</ul>
          </>}
          <h3>장면의 판정</h3>
          {plan.rules.filter(rule => !rule.deletedAt && rule.sceneId === state.sceneId).map(rule => <article className="scenario-choice" key={rule.id}>
            <strong>{rule.title} · {ruleKinds[rule.kind]}</strong><small>{ruleSources[rule.source]}</small>
            <label>판정 결과 수동 기록<select value="" onChange={e => {
              const result = e.target.value;
              if (result) log(rule.title + ' · ' + result + (rule.outcomes[result as keyof typeof rule.outcomes] ? ' · ' + rule.outcomes[result as keyof typeof rule.outcomes] : ''));
            }}><option value="">성공 수준 선택</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
            {rule.kind !== 'chase' && rule.source === 'official' && <Button variant="soft" onClick={() => {
              try { log(rule.title + ' · ' + previewRule(rule)); } catch (error) { setStatus(String(error)); }
            }}>모의 판정 기록</Button>}
          </article>)}
        </>}
        <h3>현재 변수</h3>
        {plan.variables.filter(variable => !variable.deletedAt && state.values.has(variable.id)).map(variable => <label key={variable.id}>
          {variable.name}{state.finished ? <span>{valueText(state.values.get(variable.id)!)}</span> :
            <ValueField variable={variable} value={state.values.get(variable.id)!} change={value => {
              const values = new Map(state.values); values.set(variable.id, value);
              setState({ ...state, values, steps: [...state.steps, variable.name + ' → ' + valueText(value)] });
            }}/>}
        </label>)}
      </>}
    </section>
    <section className="settings-panel scenario-list">
      <h2>진행 로그</h2>
      {state && <>
        <ol>{state.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        {missing.length > 0 && <p>미획득 필수 단서 · {missing.map(item => item.title).join(', ')}</p>}
        <div className="scenario-form"><label>로그 이름<input value={report} onChange={e => setReport(e.target.value)} placeholder="예: 서재에서 단서를 놓친 경로"/></label></div>
        <Button disabled={saving} onClick={async () => {
          setSaving(true);
          try {
            await saveScenarioRecord(projectId, 'simulationLogs', {
              title: report.trim() || '테스트 플레이 ' + new Date().toLocaleString('ko-KR'),
              steps: [...state.steps, ...missing.map(clue => '필수 단서 미획득 · ' + clue.title)], outcome
            });
            setStatus('테스트 로그를 저장했습니다.');
          } catch (error) { setStatus(String(error)); } finally { setSaving(false); }
        }}>로그 저장</Button>
      </>}
      {status && <p role="status">{status}</p>}
      <h3>저장된 테스트</h3>
      {logs.filter(item => !item.deletedAt).map(item => <article key={item.id}>
        <details><summary>{item.title} · {item.outcome}</summary><ol>{item.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></details>
        <Button variant="ghost" disabled={saving} onClick={() => void archive(item.id, true)}>휴지통으로</Button>
      </article>)}
      {logs.some(item => item.deletedAt) && <details><summary>휴지통</summary>{logs.filter(item => item.deletedAt).map(item => <p key={item.id}>{item.title} <Button variant="soft" disabled={saving} onClick={() => void archive(item.id, false)}>복원</Button></p>)}</details>}
    </section>
  </div>;
}
