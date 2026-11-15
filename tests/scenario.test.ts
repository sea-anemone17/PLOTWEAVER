import { describe, expect, it } from 'vitest';
import { applyEffects, evaluate, initialState, remapCondition, type Condition } from '../src/scenario';
import { analyze, choices, move, startPlay, type ScenarioPlan } from '../src/scenarioAnalysis';
import { resolveTimeline, formatStoryDate } from '../src/scenarioTimeline';
import { findWikiLinks } from '../src/worldWiki';
import type { EventCard, PlotEdge, Scene } from '../src/data';

const base = { projectId: 'p', createdAt: 0, updatedAt: 0 };
const scene = (id: string, extra: Partial<Scene> = {}): Scene => ({
  ...base, id, title: id, body: '진행', purpose: '', entry: '', information: '', actions: '', outcome: '', nextIds: [],
  eventId: '', order: 0, stage: '전개', ...extra
});
const edge = (id: string, fromSceneId: string, toSceneId: string, extra: Partial<PlotEdge> = {}): PlotEdge => ({
  ...base, id, fromSceneId, toSceneId, type: 'conditional', label: '', condition: '', note: '', ...extra
});
const equals: Condition = { kind: 'compare', variableId: 'truth', op: 'eq', value: true };
const plan: ScenarioPlan = {
  startSceneId: 'start', variables: [{ id: 'truth', name: '진상 확인', type: 'boolean', initial: false, options: [] }],
  scenes: [
    scene('start', { flow: { onEntry: [], onExit: [{ variableId: 'truth', value: true }], ending: false } }),
    scene('end', { flow: { entry: equals, onEntry: [], onExit: [], ending: true } }),
    scene('loop'), scene('unused')
  ],
  edges: [edge('main', 'start', 'end', { guard: equals, condition: 'KP 확인' }), edge('to-loop', 'start', 'loop'), edge('repeat', 'loop', 'loop')],
  rules: [], events: [], clues: [], routes: [], foreshadows: [], handouts: [], lore: []
};

describe('structured scenario', () => {
  it('evaluates groups without assuming that an unknown variable is false', () => {
    const state = initialState(plan.variables);
    expect(evaluate({ kind: 'not', term: equals }, state)).toBe(true);
    const missing: Condition = { ...equals, variableId: 'archived' };
    expect(evaluate({ kind: 'or', terms: [equals, missing] }, state)).toBeUndefined();
    expect(evaluate({ kind: 'and', terms: [equals, missing] }, state)).toBe(false);
    expect(evaluate({ kind: 'not', term: missing }, state)).toBeUndefined();
    expect(evaluate(equals, applyEffects(state, [{ variableId: 'truth', value: true }]))).toBe(true);
  });
  it('remaps nested ID references and rejects invalid operations on import', () => {
    expect(remapCondition({ kind: 'not', term: equals }, id => id + '-copy')).toEqual({ kind: 'not', term: { ...equals, variableId: 'truth-copy' } });
    expect(() => remapCondition({ ...equals, op: 'execute' }, String)).toThrow();
  });
  it('applies exit effects before checking the branch and target entry, preserving the state on a rejected choice', () => {
    const start = startPlay(plan.scenes[0], plan.variables)!;
    expect(choices(plan, start)[0].reason).toBe('');
    expect(move(plan, start, 'main', false)).toBeUndefined();
    expect(start.values.get('truth')).toBe(false);
    expect(move(plan, start, 'main', true)).toMatchObject({ sceneId: 'end' });
    expect(move(plan, start, 'main', true)?.values.get('truth')).toBe(true);
  });
  it('finds a reachable cycle with no ending and reports disconnected scenes', () => {
    expect(analyze(plan).map(issue => issue.key)).toEqual(expect.arrayContaining(['loop:noending', 'unused:unreachable']));
    expect(analyze(plan).some(issue => issue.key === 'end:noending')).toBe(false);
  });
});

const event = (id: string, timing: EventCard['timing']): EventCard => ({ ...base, id, title: id, body: '', when: '', cause: '', result: '', order: 0, timing });
describe('story chronology', () => {
  it('resolves relative time from the end of an event and rejects cycles', () => {
    const a = event('a', { absolute: '2116-05-01T09:00', afterId: '', durationMinutes: 35, delayMinutes: 0 });
    const b = event('b', { absolute: '', afterId: 'a', durationMinutes: 0, delayMinutes: 10 });
    expect(formatStoryDate(resolveTimeline([b, a]).starts.get('b')!)).toBe('2116-05-01 09:45');
    const cyclic = event('a', { ...a.timing!, afterId: 'b' });
    expect(resolveTimeline([cyclic, b]).issues.size).toBe(2);
  });
});
describe('world wiki', () => {
  it('uses saved IDs after renames and distinguishes ambiguous new references', () => {
    const candidates = [{ id: 'a', title: '장미' }, { id: 'b', title: '장미' }];
    expect(findWikiLinks('[[장미]] · [[북탑]]', candidates, [{ label: '북탑', targetId: 'old' }])).toEqual([
      { label: '장미', targetId: '' }, { label: '북탑', targetId: 'old' }
    ]);
  });
});

describe('condition-aware diagnostics', () => {
  it('identifies an edge that cannot be reached from the initial values', async () => {
    const { exploreStates } = await import('../src/scenarioAnalysis');
    const noChange = { ...plan, scenes: [
      scene('start'),
      scene('end', { flow: { onEntry: [], onExit: [], ending: true } })
    ], edges: [edge('blocked', 'start', 'end', { guard: equals })] };
    expect(exploreStates(noChange).reached.has('end')).toBe(false);
    expect(analyze(noChange).map(issue => issue.key)).toEqual(expect.arrayContaining(['end:state-unreachable', 'states:no-ending']));
  });
  it('does not report unreachable destinations when the exploration limit is reached', async () => {
    const { exploreStates } = await import('../src/scenarioAnalysis');
    expect(exploreStates(plan, 1)).toMatchObject({ complete: false });
  });
  it('considers free-text conditions as potentially satisfiable', async () => {
    const { exploreStates } = await import('../src/scenarioAnalysis');
    expect(exploreStates(plan).reached.has('end')).toBe(true);
  });
});
