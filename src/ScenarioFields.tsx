import { Button } from './UI';
import { comparisons, MAX_CONDITION_DEPTH, type Comparison, type Condition, type Effect, type ScenarioValue, type VariableSpec, type VariableType } from './scenario';

export const variableTypes: Record<VariableType, string> = { boolean: '참/거짓', number: '숫자', string: '문자열', enum: '선택 목록' };
const operators: Record<Comparison, string> = { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' };
const kinds = { compare: '변수 비교', and: '모두 만족 (AND)', or: '하나 이상 만족 (OR)', not: '반대 (NOT)' } as const;
export const firstValue = (type: VariableType, options: string[] = []): ScenarioValue =>
  type === 'boolean' ? false : type === 'number' ? 0 : type === 'enum' ? options[0] || '' : '';

export function ValueField({ variable, value, change }: {
  variable: Pick<VariableSpec, 'type' | 'options'>; value: ScenarioValue; change: (value: ScenarioValue) => void;
}) {
  if (variable.type === 'boolean') return <select value={String(value)} onChange={e => change(e.target.value === 'true')}><option value="false">거짓</option><option value="true">참</option></select>;
  if (variable.type === 'enum') return <select value={String(value)} onChange={e => change(e.target.value)}>
    <option value="" disabled>값 선택</option>{variable.options.map(item => <option key={item}>{item}</option>)}
  </select>;
  return <input type={variable.type === 'number' ? 'number' : 'text'} step="any" value={String(value)} onChange={e => change(variable.type === 'number' ? Number(e.target.value) : e.target.value)} />;
}

function newComparison(variables: VariableSpec[]): Condition {
  const variable = variables[0];
  return { kind: 'compare', variableId: variable?.id || '', op: 'eq', value: variable?.initial ?? false };
}
function ConditionNode({ value, variables, change, depth }: {
  value: Condition; variables: VariableSpec[]; change: (value: Condition) => void; depth: number;
}) {
  const variable = value.kind === 'compare' ? variables.find(item => item.id === value.variableId) : undefined;
  const compare = () => newComparison(variables);
  return <div className="scenario-condition">
    <label>조건 방식<select value={value.kind} onChange={event => {
      const kind = event.target.value as Condition['kind'];
      change(kind === 'compare' ? compare() : kind === 'not' ? { kind, term: value } : { kind, terms: [value] });
    }}>
      {Object.entries(kinds).filter(([kind]) => kind === 'compare' || depth < MAX_CONDITION_DEPTH || value.kind === kind).map(([kind, label]) =>
        <option value={kind} key={kind}>{label}</option>)}
    </select></label>
    {value.kind === 'compare' ? <div className="scenario-fields">
      <label>변수<select value={value.variableId} onChange={e => {
        const variable = variables.find(item => item.id === e.target.value);
        if (variable) change({ kind: 'compare', variableId: variable.id, op: 'eq', value: variable.initial });
      }}>
        {!variable && <option value={value.variableId} disabled>변수를 선택해 주세요</option>}
        {variables.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label>비교<select value={value.op} onChange={e => change({ ...value, op: e.target.value as Comparison })}>
        {comparisons.filter(op => variable?.type === 'number' || op === 'eq' || op === 'ne').map(op => <option value={op} key={op}>{operators[op]}</option>)}
      </select></label>
      {variable && <label>값<ValueField variable={variable} value={value.value} change={next => change({ ...value, value: next })}/></label>}
    </div> : value.kind === 'not' ? <ConditionNode value={value.term} variables={variables} depth={depth + 1} change={term => change({ ...value, term })}/> :
      <>
        {value.terms.map((term, i) => <div key={i}>
          <ConditionNode value={term} variables={variables} depth={depth + 1} change={next => change({ ...value, terms: value.terms.map((item, n) => n === i ? next : item) })}/>
          {value.terms.length > 1 && <Button variant="ghost" onClick={() => change({ ...value, terms: value.terms.filter((_, n) => n !== i) })}>하위 조건 제거</Button>}
        </div>)}
        <Button variant="soft" disabled={value.terms.length >= 12} onClick={() => change({ ...value, terms: [...value.terms, compare()] })}>하위 조건 추가</Button>
      </>}
  </div>;
}
export function ConditionField({ title, value, variables, change }: {
  title: string; value?: Condition; variables: VariableSpec[]; change: (value?: Condition) => void;
}) {
  return <fieldset className="scenario-fieldset">
    <legend>{title}</legend>
    {value ? <>
      <ConditionNode value={value} variables={variables} depth={0} change={change}/>
      <Button variant="ghost" onClick={() => change(undefined)}>조건 제거</Button>
    </> : <Button variant="soft" disabled={!variables.length} onClick={() => change(newComparison(variables))}>조건 추가</Button>}
    {!variables.length && <p className="muted small">시나리오 설계에서 변수를 등록하면 조건에 사용할 수 있습니다.</p>}
  </fieldset>;
}
export function EffectsField({ title, value, variables, change }: {
  title: string; value: Effect[]; variables: VariableSpec[]; change: (value: Effect[]) => void;
}) {
  const update = (index: number, effect: Effect) => change(value.map((item, i) => i === index ? effect : item));
  return <fieldset className="scenario-fieldset">
    <legend>{title}</legend>
    {value.map((effect, index) => {
      const variable = variables.find(item => item.id === effect.variableId);
      return <div key={index} className="scenario-fields">
        <label>변수<select value={effect.variableId} onChange={event => {
          const next = variables.find(item => item.id === event.target.value);
          if (next) update(index, { variableId: next.id, value: next.initial });
        }}>
          {!variable && <option value={effect.variableId} disabled>사용할 수 없는 변수</option>}
          {variables.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {variable && <label>새 값<ValueField variable={variable} value={effect.value} change={next => update(index, { ...effect, value: next })}/></label>}
        <Button variant="ghost" onClick={() => change(value.filter((_, i) => i !== index))}>변경 제거</Button>
      </div>;
    })}
    <Button variant="soft" disabled={!variables.length} onClick={() => change([...value, { variableId: variables[0].id, value: variables[0].initial }])}>변경 추가</Button>
  </fieldset>;
}
