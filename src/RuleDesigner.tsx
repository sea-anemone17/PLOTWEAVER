import { useMemo, useState } from 'react';
import { Button } from './UI';
import { db, type RuleEvent, type Scene } from './data';
import { archiveScenarioRecord, saveScenarioRecord } from './scenarioRecords';
import { chanceOfSuccess, classify, diceExpression, difficulties, emptyRule, levels, majorWound, melee, meets, opposed,
  rollPercentile, ruleKinds, ruleSources, sanityLoss, thresholds, type RuleDraft } from './coc7';

export function previewRule(rule: RuleDraft) {
  const result = rollPercentile(rule.kind === 'san' ? 0 : rule.bonus);
  if (rule.kind === 'san') {
    const san = sanityLoss(result, rule.rating, rule.successLoss, rule.failureLoss);
    return 'D100 ' + result + ' · ' + (san.success ? '성공' : '실패') + ' · 이성 ' + san.loss + ' 감소';
  }
  const first = classify(result, rule.rating, rule.kind === 'skill' ? rule.difficulty : 'regular');
  if (rule.kind === 'opposed' || rule.kind === 'combat') {
    const secondRoll = rollPercentile(rule.opponentBonus);
    const second = classify(secondRoll, rule.opponentRating);
    const outcome = rule.kind === 'opposed' ? opposed(first, second, rule.rating, rule.opponentRating) : melee(first, second, rule.defense);
    return result + ' (' + first + ') / ' + secondRoll + ' (' + second + ') · ' + outcome;
  }
  return 'D100 ' + result + ' · ' + first + ' · ' + (rule.outcomes[first] || (meets(first, rule.difficulty) ? rule.success : rule.failure));
}

type Form = RuleDraft & { title: string; sceneId: string };
export default function RuleDesigner({ projectId, scenes, rules }: { projectId: string; scenes: Scene[]; rules: RuleEvent[] }) {
  const blank = (): Form => ({ ...emptyRule, title: '', sceneId: scenes[0]?.id || '' });
  const [form, setForm] = useState(blank);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');
  const patch = <K extends keyof Form>(key: K, value: Form[K]) => { setForm(current => ({ ...current, [key]: value })); setPreview(''); };
  const attempt = async (task: () => Promise<void>) => {
    setBusy(true); setStatus('');
    try { await task(); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const reset = () => { setId(''); setForm(blank()); setPreview(''); };
  const save = () => attempt(async () => {
    if (!form.title.trim()) throw Error('이벤트 이름을 입력해 주세요.');
    const scene = await db.scenes.get(form.sceneId);
    if (!scene || scene.deletedAt || scene.projectId !== projectId) throw Error('판정이 일어날 장면을 선택해 주세요.');
    thresholds(form.rating); thresholds(form.opponentRating);
    if (form.kind === 'san' && form.source === 'official') {
      if (form.rating > 99) throw Error('현재 이성은 99 이하여야 합니다.');
      diceExpression(form.successLoss); diceExpression(form.failureLoss);
    }
    await saveScenarioRecord(projectId, 'ruleEvents', { ...form, title: form.title.trim() }, id || undefined);
    reset(); setStatus('이벤트를 저장했습니다.');
  });
  const probability = useMemo(() => form.kind === 'skill' && form.source === 'official'
    ? chanceOfSuccess(form.rating, form.difficulty, form.bonus) : undefined, [form.kind, form.source, form.rating, form.difficulty, form.bonus]);
  const rating = form.rating >= 0 ? thresholds(form.rating) : thresholds(0);
  return <div className="scenario-grid">
    <section className="settings-panel scenario-form">
      <h2>{id ? '이벤트 편집' : '새 이벤트'}</h2>
      <label>이름<input value={form.title} onChange={event => patch('title', event.target.value)}/></label>
      <label>장면<select value={form.sceneId} onChange={event => patch('sceneId', event.target.value)}>
        <option value="">장면 선택</option>{scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title}</option>)}
      </select></label>
      <div className="scenario-fields">
        <label>유형<select value={form.kind} onChange={e => patch('kind', e.target.value as RuleDraft['kind'])}>
          {Object.entries(ruleKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>규칙 출처<select value={form.source} onChange={e => patch('source', e.target.value as RuleDraft['source'])}>
          {Object.entries(ruleSources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <label>{form.kind === 'chase' ? '장애물·이탈 목표' : '기능명·판정 목적'}<input value={form.skill} onChange={event => patch('skill', event.target.value)}/></label>
      {form.kind !== 'chase' && <div className="scenario-fields">
        <label>{form.kind === 'san' ? '현재 이성' : form.kind === 'combat' ? '공격자 기능치' : '기준값'}<input type="number" min="0" value={form.rating} onChange={e => patch('rating', Math.max(0, Math.floor(Number(e.target.value) || 0)))}/></label>
        {form.kind === 'skill' && <label>난이도<select value={form.difficulty} onChange={e => patch('difficulty', e.target.value as RuleDraft['difficulty'])}>
          {Object.entries(difficulties).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
        {form.kind !== 'san' && <label>보너스·패널티<select value={form.bonus} onChange={e => patch('bonus', Number(e.target.value))}>
          {[-2,-1,0,1,2].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>}
      </div>}
      {form.kind === 'skill' && <p className="muted small">성공 기준 {rating.regular} / {rating.hard} / {rating.extreme}{probability !== undefined && ' · 성공 확률 ' + new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 2 }).format(probability)}</p>}
      {(form.kind === 'opposed' || form.kind === 'combat') && <div className="scenario-fields">
        <label>상대 기능치<input type="number" min="0" value={form.opponentRating} onChange={e => patch('opponentRating', Math.max(0, Math.floor(Number(e.target.value) || 0)))}/></label>
        <label>상대 보너스·패널티<select value={form.opponentBonus} onChange={e => patch('opponentBonus', Number(e.target.value))}>
          {[-2,-1,0,1,2].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        {form.kind === 'combat' && <label>근접 방어<select value={form.defense} onChange={e => patch('defense', e.target.value as RuleDraft['defense'])}><option value="dodge">회피</option><option value="fightBack">반격</option></select></label>}
      </div>}
      {form.kind === 'san' && <div className="scenario-fields">
        <label>성공 시 손실<input value={form.successLoss} onChange={e => patch('successLoss', e.target.value)}/></label>
        <label>실패 시 손실<input value={form.failureLoss} onChange={e => patch('failureLoss', e.target.value)}/></label>
      </div>}
      <label>성공 시 진행<textarea value={form.success} onChange={e => patch('success', e.target.value)}/></label>
      <label>실패 시 대체 진행<textarea value={form.failure} onChange={e => patch('failure', e.target.value)}/></label>
      {form.kind === 'skill' && <>
        <label>강행 조건과 실패의 대가<textarea value={form.push} onChange={e => patch('push', e.target.value)}/></label>
        <details><summary>성공 수준별 결과</summary>
          {levels.map(level => <label key={level}>{level}<textarea value={form.outcomes[level] || ''} onChange={e => patch('outcomes', { ...form.outcomes, [level]: e.target.value })}/></label>)}
        </details>
      </>}
      <label>{form.kind === 'chase' ? 'KP 메모 · 참가자 MOV, 위치, 장애물과 종료 조건' : form.kind === 'combat' ? 'KP 메모 · DEX 순서, 피해·장갑, 적 행동과 종료 조건' : form.kind === 'san' ? 'KP 메모 · 광기 연출과 후속 처리' : 'KP 메모'}<textarea value={form.notes} onChange={e => patch('notes', e.target.value)}/></label>
      <div className="research-actions">
        <Button disabled={busy} onClick={() => void save()}>저장</Button>
        {id && <Button variant="soft" onClick={reset}>새 이벤트</Button>}
        {form.kind !== 'chase' && form.source === 'official' && <Button variant="soft" onClick={() => {
          try { setPreview(previewRule(form)); } catch (error) { setPreview(error instanceof Error ? error.message : String(error)); }
        }}>모의 판정</Button>}
      </div>
      {status && <p role="status">{status}</p>}{preview && <p role="status">{preview}</p>}
    </section>
    <section className="settings-panel scenario-list">
      <h2>등록한 이벤트</h2>
      {rules.filter(rule => !rule.deletedAt).map(rule => <article key={rule.id}>
        <strong>{rule.title}</strong><small>{ruleKinds[rule.kind]} · {ruleSources[rule.source]} · {scenes.find(scene => scene.id === rule.sceneId)?.title || '장면 없음'}</small>
        <div className="research-actions">
          <Button variant="soft" disabled={busy} onClick={() => {
            const { title, sceneId, kind, source, skill, rating, difficulty, bonus, opponentRating, opponentBonus, defense,
              successLoss, failureLoss, success, failure, outcomes, push, notes } = rule;
            setForm({ title, sceneId, kind, source, skill, rating, difficulty, bonus, opponentRating, opponentBonus, defense,
              successLoss, failureLoss, success, failure, outcomes, push, notes });
            setId(rule.id); setPreview('');
          }}>편집</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void attempt(async () => {
            await archiveScenarioRecord(projectId, 'ruleEvents', rule.id, true);
            if (id === rule.id) reset();
          })}>휴지통으로</Button>
        </div>
      </article>)}
      {rules.some(rule => rule.deletedAt) && <details><summary>휴지통</summary>
        {rules.filter(rule => rule.deletedAt).map(rule => <p key={rule.id}>{rule.title} <Button variant="soft" disabled={busy} onClick={() => void attempt(() => archiveScenarioRecord(projectId, 'ruleEvents', rule.id, false))}>복원</Button></p>)}
      </details>}
      <WoundReference/>
    </section>
  </div>;
}

function WoundReference() {
  const [hp, setHp] = useState(10);
  const [damage, setDamage] = useState(0);
  const [armor, setArmor] = useState(0);
  return <details className="scenario-form"><summary>주요 부상 계산</summary>
    <div className="scenario-fields">
      <label>최대 HP<input type="number" min="1" value={hp} onChange={e => setHp(Number(e.target.value))}/></label>
      <label>한 번에 받은 피해<input type="number" min="0" value={damage} onChange={e => setDamage(Number(e.target.value))}/></label>
      <label>장갑<input type="number" min="0" value={armor} onChange={e => setArmor(Number(e.target.value))}/></label>
    </div>
    {hp > 0 && <p>{damage - armor >= hp ? '최대 HP 이상의 단일 피해' : majorWound(damage - armor, hp) ? '주요 부상 · CON 판정 확인' : '주요 부상 기준 미만'}</p>}
  </details>;
}
