import type { Clue, ClueRoute, EventCard, Foreshadow, Handout, Lore, PlotEdge, RuleEvent, Scene } from './data';
import { resolveTimeline } from './scenarioTimeline';
import { applyEffects, conditionError, conditionVariables, evaluate, initialState, validValue, type Condition, type ScenarioState, type VariableSpec } from './scenario';

export type ScenarioPlan = {
  scenes: Scene[]; events: EventCard[]; edges: PlotEdge[]; variables: VariableSpec[]; startSceneId?: string;
  clues: Clue[]; routes: ClueRoute[]; foreshadows: Foreshadow[];
  handouts: Handout[]; lore: Lore[]; rules: RuleEvent[];
};
export type Issue = { key: string; severity: '오류' | '경고' | '제안'; message: string; sceneId?: string };
const sceneTitle = (scene: Scene) => scene.title || '이름 없는 장면';

export function analyze(plan: ScenarioPlan): Issue[] {
  const { scenes, edges, variables, startSceneId, clues, routes, foreshadows } = plan;
  const issues: Issue[] = [];
  const add = (key: string, severity: Issue['severity'], message: string, sceneId?: string) => issues.push({ key, severity, message, sceneId });
  const active = new Map(scenes.map(scene => [scene.id, scene]));
  const activeVariables = new Map(variables.filter(item => !item.deletedAt).map(item => [item.id, item]));
  const used = new Set<string>();
  const checkCondition = (key: string, name: string, condition: Condition | undefined, sceneId?: string) => {
    if (!condition) return;
    conditionVariables(condition).forEach(id => used.add(id));
    const error = conditionError(condition, variables);
    if (error) add(key, '오류', name + ' · ' + error, sceneId);
  };
  const graph = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const edge of edges) {
    checkCondition(edge.id + ':guard', '분기 ' + (edge.label || active.get(edge.fromSceneId)?.title || ''), edge.guard, edge.fromSceneId);
    if (!active.has(edge.fromSceneId) || (edge.toSceneId && !active.has(edge.toSceneId))) {
      add(edge.id + ':link', '오류', '분기 연결에 사용할 수 없는 장면이 있습니다. 휴지통에서 장면을 복구하거나 연결을 편집해 주세요.', edge.fromSceneId);
    } else if (!edge.toSceneId) {
      add(edge.id + ':pending', '경고', (active.get(edge.fromSceneId)?.title || '') + '의 분기 도착 장면이 미정입니다.', edge.fromSceneId);
    } else {
      const list = graph.get(edge.fromSceneId) || [];
      list.push(edge.toSceneId);
      graph.set(edge.fromSceneId, list);
      const incoming = reverse.get(edge.toSceneId) || [];
      incoming.push(edge.fromSceneId);
      reverse.set(edge.toSceneId, incoming);
    }
  }
  const visit = (root: string[], links: Map<string, string[]>) => {
    const visited = new Set<string>();
    const pending = [...root];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of links.get(id) || []) if (!visited.has(next)) pending.push(next);
    }
    return visited;
  };
  const endings = scenes.filter(scene => scene.flow?.ending).map(scene => scene.id);
  const fromStart = startSceneId && active.has(startSceneId) ? visit([startSceneId], graph) : undefined;
  const canEnd = endings.length ? visit(endings, reverse) : undefined;
  if (!fromStart && scenes.length) add('start', startSceneId ? '오류' : '제안', '시나리오 설계에서 활성 장면을 시작 장면으로 지정해 주세요.');
  if (!endings.length && scenes.length) add('ending', '제안', '시나리오 설계에서 결말 장면을 지정하면 결말에 닿지 않는 경로를 찾을 수 있습니다.');
  for (const scene of scenes) {
    const id = scene.id, title = sceneTitle(scene);
    checkCondition(id + ':entry', title + ' 진입 조건', scene.flow?.entry, id);
    checkCondition(id + ':exit', title + ' 종료 조건', scene.flow?.exit, id);
    const effects = [...(scene.flow?.onEntry || []), ...(scene.flow?.onExit || [])];
    effects.forEach(({ variableId, value }, index) => {
      used.add(variableId);
      const variable = activeVariables.get(variableId);
      if (!variable || !validValue(variable, value)) add(id + ':effect:' + index, '오류', title + '의 변수 변경 대상이나 값이 잘못되었습니다.', id);
    });
    if (fromStart && !fromStart.has(id)) add(id + ':unreachable', '경고', title + ' · 시작 장면에서 이어지는 연결이 없습니다.', id);
    if (fromStart?.has(id) && canEnd && !canEnd.has(id)) add(id + ':noending', '경고', title + '에서 연결선을 따라갈 수 있는 결말이 없습니다.', id);
    if (!scene.body?.trim() && !scene.purpose?.trim()) add(id + ':draft', '제안', title + '의 목적이나 진행 내용을 적어 주세요.', id);
  }
  const routesByClue = new Map<string, Set<string>>();
  const clueIds = new Set(clues.map(item => item.id));
  for (const route of routes.filter(item => !item.deletedAt)) {
    checkCondition(route.id, '단서 획득 조건', route.guard, route.sceneId);
    if (!active.has(route.sceneId) || !clueIds.has(route.clueId)) add(route.id + ':ref', '오류', '단서 획득 경로의 장면 또는 단서가 없습니다.', route.sceneId);
    else if (!fromStart || fromStart.has(route.sceneId)) {
      const locations = routesByClue.get(route.clueId) || new Set<string>();
      locations.add(route.sceneId);
      routesByClue.set(route.clueId, locations);
    }
  }
  for (const clue of clues.filter(item => item.required)) {
    const count = routesByClue.get(clue.id)?.size || 0;
    if (count < 2) add(clue.id + ':routes', '경고', clue.title + ' · 필수 단서를 획득할 수 있는 장면이 ' + count + '개입니다.');
  }
  const handoutIds = new Set(plan.handouts.map(item => item.id));
  for (const handout of plan.handouts) {
    if ((handout.sceneId && !active.has(handout.sceneId)) || (handout.clueId && !clueIds.has(handout.clueId))) {
      add(handout.id + ':ref', '오류', handout.title + ' · 핸드아웃 공개 조건의 장면 또는 단서가 없습니다.', handout.sceneId);
    }
  }
  const npcIds = new Set(plan.lore.filter(item => item.kind === 'NPC').map(item => item.id));
  for (const item of foreshadows.filter(item => !item.deletedAt)) {
    const name = item.title || '이름 없는 복선';
    const ids = [item.introductionId, ...item.hintIds, item.payoffId].filter(Boolean);
    if (ids.some(id => !active.has(id)) || (item.clueId && !clueIds.has(item.clueId)) ||
        (item.handoutId && !handoutIds.has(item.handoutId)) || (item.npcId && !npcIds.has(item.npcId))) {
      add(item.id + ':ref', '오류', name + ' · 사용할 수 없는 참조가 있습니다.', item.introductionId);
    }
    if (item.status !== '의도적 미회수' && !item.payoffId) add(item.id + ':payoff', '경고', name + '의 회수 장면을 지정해 주세요.', item.introductionId);
    if (item.payoffId && active.has(item.payoffId) && (fromStart && !fromStart.has(item.payoffId) ||
        item.introductionId && active.has(item.introductionId) && !visit([item.introductionId], graph).has(item.payoffId))) {
      add(item.id + ':unreachable', '경고', name + '의 회수 장면으로 이어지는 연결을 확인해 주세요.', item.payoffId);
    }
  }
  for (const rule of plan.rules.filter(item => !item.deletedAt)) {
    if (!active.has(rule.sceneId)) add(rule.id, '오류', rule.title + ' · 연결한 판정 장면을 사용할 수 없습니다.', rule.sceneId);
  }
  const timeline = resolveTimeline(plan.events);
  for (const event of plan.events) {
    const error = timeline.issues.get(event.id);
    if (error) add(event.id + ':time', '오류', event.title + ' · ' + error);
  }
  for (const variable of activeVariables.values()) {
    if (!used.has(variable.id)) add(variable.id + ':unused', '제안', variable.name + ' 변수가 조건이나 장면에서 사용되지 않습니다.');
  }
  return issues;
}

export type PlayState = { sceneId: string; values: ScenarioState; clues: string[]; steps: string[]; finished: boolean };
function enter(scene: Scene, state: PlayState) {
  return { ...state, sceneId: scene.id, values: applyEffects(state.values, scene.flow?.onEntry), steps: [...state.steps, '장면 진입 · ' + sceneTitle(scene)] };
}
export function startPlay(scene: Scene, variables: VariableSpec[]): PlayState | undefined {
  const values = initialState(variables);
  if (evaluate(scene.flow?.entry, values) !== true) return;
  return enter(scene, { sceneId: scene.id, values, clues: [], steps: [], finished: false });
}
export function choices(plan: ScenarioPlan, state: PlayState) {
  const scene = plan.scenes.find(item => item.id === state.sceneId);
  if (!scene || state.finished) return [];
  const afterExit = applyEffects(state.values, scene.flow?.onExit);
  return plan.edges.filter(edge => edge.fromSceneId === scene.id).map(edge => {
    const next = plan.scenes.find(item => item.id === edge.toSceneId);
    const reason = !next ? '도착 장면 미정 또는 휴지통' : evaluate(scene.flow?.exit, state.values) !== true ? '현재 장면 종료 조건' :
      evaluate(edge.guard, afterExit) !== true ? '분기 조건' : evaluate(next.flow?.entry, afterExit) !== true ? '다음 장면 진입 조건' : '';
    return { edge, next, reason, afterExit, keeperRequired: !!edge.condition?.trim() };
  });
}
export function move(plan: ScenarioPlan, state: PlayState, edgeId: string, keeperApproved: boolean) {
  const choice = choices(plan, state).find(item => item.edge.id === edgeId);
  if (!choice?.next || choice.reason || (choice.keeperRequired && !keeperApproved)) return;
  return enter(choice.next, {
    ...state, values: choice.afterExit,
    steps: [...state.steps, '분기 · ' + (choice.edge.label || sceneTitle(choice.next))]
  });
}
