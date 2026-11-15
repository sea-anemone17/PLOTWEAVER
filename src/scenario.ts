export type ScenarioValue = boolean | number | string;
export type VariableType = 'boolean' | 'number' | 'string' | 'enum';
export type VariableSpec = {
  id: string;
  name: string;
  type: VariableType;
  initial: ScenarioValue;
  options: string[];
  deletedAt?: number;
};
export type Comparison = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
export type Condition =
  | { kind: 'compare'; variableId: string; op: Comparison; value: ScenarioValue }
  | { kind: 'and' | 'or'; terms: Condition[] }
  | { kind: 'not'; term: Condition };
export type Effect = { variableId: string; value: ScenarioValue };
export type SceneFlow = {
  entry?: Condition;
  exit?: Condition;
  onEntry: Effect[];
  onExit: Effect[];
  ending: boolean;
};
export type ScenarioState = Map<string, ScenarioValue>;
export const comparisons: Comparison[] = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'];
export const MAX_CONDITION_DEPTH = 5;
export const emptyFlow = (): SceneFlow => ({ onEntry: [], onExit: [], ending: false });

export function validValue(variable: VariableSpec, value: ScenarioValue) {
  if (variable.type === 'enum') return typeof value === 'string' && variable.options.includes(value);
  return typeof value === variable.type && (typeof value !== 'number' || Number.isFinite(value));
}

export function conditionError(condition: Condition, variables: VariableSpec[], depth = 0): string | undefined {
  if (depth > MAX_CONDITION_DEPTH) return '조건을 더 깊게 중첩할 수 없습니다.';
  if (condition.kind === 'not') return conditionError(condition.term, variables, depth + 1);
  if (condition.kind !== 'compare') {
    if (!condition.terms.length) return '그룹에 조건을 한 개 이상 넣어 주세요.';
    for (const term of condition.terms) {
      const error = conditionError(term, variables, depth + 1);
      if (error) return error;
    }
    return;
  }
  const variable = variables.find(item => item.id === condition.variableId && !item.deletedAt);
  if (!variable) return '활성 변수를 선택해 주세요.';
  if (!comparisons.includes(condition.op) || (variable.type !== 'number' && !['eq', 'ne'].includes(condition.op))) {
    return '이 변수 유형에 맞는 비교 연산을 선택해 주세요.';
  }
  if (!validValue(variable, condition.value)) return '비교 값이 변수 유형에 맞지 않습니다.';
}

// Missing values propagate as unknown, including inside NOT.
export function evaluate(condition: Condition | undefined, state: ScenarioState): boolean | undefined {
  if (!condition) return true;
  if (condition.kind === 'not') {
    const result = evaluate(condition.term, state);
    return result === undefined ? undefined : !result;
  }
  if (condition.kind !== 'compare') {
    const results = condition.terms.map(term => evaluate(term, state));
    const decisive = condition.kind === 'or';
    return results.includes(decisive) ? decisive : results.includes(undefined) ? undefined : !decisive;
  }
  const current = state.get(condition.variableId);
  const target = condition.value;
  if (current === undefined || typeof current !== typeof target) return undefined;
  if (condition.op === 'eq') return current === target;
  if (condition.op === 'ne') return current !== target;
  if (typeof current !== 'number' || typeof target !== 'number') return undefined;
  switch (condition.op) {
    case 'lt': return current < target;
    case 'lte': return current <= target;
    case 'gt': return current > target;
    case 'gte': return current >= target;
  }
}

export function initialState(variables: VariableSpec[]): ScenarioState {
  return new Map(variables.filter(variable => !variable.deletedAt).map(variable => [variable.id, variable.initial]));
}
export function applyEffects(state: ScenarioState, effects: Effect[] = []): ScenarioState {
  const next = new Map(state);
  for (const { variableId, value } of effects) if (next.has(variableId)) next.set(variableId, value);
  return next;
}
export function conditionVariables(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if (condition.kind === 'compare') return [condition.variableId];
  if (condition.kind === 'not') return conditionVariables(condition.term);
  return condition.terms.flatMap(conditionVariables);
}

function importedValue(value: unknown): ScenarioValue {
  if (typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw Error('시나리오 변수의 값이 손상되었습니다.');
}
export function remapCondition(value: unknown, id: (value: unknown) => string, depth = 0): Condition {
  if (!value || typeof value !== 'object' || depth > MAX_CONDITION_DEPTH) throw Error('분기 조건이 손상되었습니다.');
  const node = value as Record<string, unknown>;
  if ((node.kind === 'and' || node.kind === 'or') && Array.isArray(node.terms) && node.terms.length > 0 && node.terms.length <= 12) {
    return { kind: node.kind, terms: node.terms.map(term => remapCondition(term, id, depth + 1)) };
  }
  if (node.kind === 'not') return { kind: 'not', term: remapCondition(node.term, id, depth + 1) };
  if (node.kind === 'compare' && comparisons.includes(node.op as Comparison) && typeof node.variableId === 'string' && node.variableId) {
    return { kind: 'compare', op: node.op as Comparison, variableId: id(node.variableId), value: importedValue(node.value) };
  }
  throw Error('분기 조건의 연산이나 참조가 손상되었습니다.');
}
export function remapFlow(value: unknown, id: (value: unknown) => string): SceneFlow {
  const flow = value as Partial<SceneFlow>;
  if (!flow || typeof flow.ending !== 'boolean') throw Error('장면 진행 설정이 손상되었습니다.');
  const effects = (items: unknown): Effect[] => {
    if (!Array.isArray(items) || items.length > 2000) throw Error('변수 변경 목록이 손상되었습니다.');
    return items.map(item => {
      if (!item || typeof item.variableId !== 'string' || !item.variableId) throw Error('변수 변경 대상이 없습니다.');
      return { variableId: id(item.variableId), value: importedValue(item.value) };
    });
  };
  return {
    ending: flow.ending, onEntry: effects(flow.onEntry), onExit: effects(flow.onExit),
    entry: flow.entry === undefined ? undefined : remapCondition(flow.entry, id),
    exit: flow.exit === undefined ? undefined : remapCondition(flow.exit, id)
  };
}
