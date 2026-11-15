import type { EventCard } from './data';

export type EventTiming = {
  absolute: string;
  afterId: string;
  delayMinutes: number;
  durationMinutes: number;
};
export const emptyTiming: EventTiming = { absolute: '', afterId: '', delayMinutes: 0, durationMinutes: 0 };

export function resolveTimeline(events: EventCard[]) {
  const byId = new Map(events.map(event => [event.id, event]));
  const starts = new Map<string, number>();
  const issues = new Map<string, string>();
  const done = new Set<string>();
  const calculate = (event: EventCard, path: Set<string>): number | undefined => {
    if (done.has(event.id)) return starts.get(event.id);
    if (path.has(event.id)) {
      issues.set(event.id, '선후 조건이 순환합니다.');
      return;
    }
    const timing = event.timing;
    const legacy = /^\d{4}-\d\d-\d\d$/.test(event.when || '') ? event.when + 'T00:00' : '';
    if (!timing?.afterId) {
      const text = timing?.absolute || legacy;
      if (text) {
        const date = new Date(text + 'Z');
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== text) issues.set(event.id, '절대 시점이 올바르지 않습니다.');
        else starts.set(event.id, date.getTime());
      }
    } else {
      const previous = byId.get(timing.afterId);
      if (!previous) issues.set(event.id, '기준 사건을 찾을 수 없습니다.');
      else {
        path.add(event.id);
        const start = calculate(previous, path);
        path.delete(event.id);
        if (start === undefined) {
          if (!issues.has(event.id)) issues.set(event.id, '기준 사건의 시점을 계산할 수 없습니다.');
        } else {
          const next = start + ((previous.timing?.durationMinutes || 0) + timing.delayMinutes) * 60_000;
          if (Number.isNaN(new Date(next).getTime())) issues.set(event.id, '계산된 시점이 날짜 범위를 벗어났습니다.');
          else starts.set(event.id, next);
        }
      }
    }
    done.add(event.id);
    return starts.get(event.id);
  };
  for (const event of events) calculate(event, new Set());
  return { starts, issues };
}
export function formatStoryDate(value: number) {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}
