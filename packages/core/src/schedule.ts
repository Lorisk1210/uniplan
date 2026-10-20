import { toMin, validTime } from './time';
import type { Course, Session, Stage } from './types';

export const STAGE_LABEL: Record<Stage, string> = { [-1]: 'Dropped', 0: 'Idea', 1: 'Shortlist', 2: 'Final' };

export const validSession = (s: Session): boolean => validTime(s.start) && validTime(s.end) && toMin(s.end) > toMin(s.start);

// Alternative slots (e.g. tutorial groups): once one of a kind is chosen, the rest hide.
export const isActive = (s: Session): boolean => !s.alt || s.chosen;
export const hasChosen = (c: Course, kind: string): boolean => c.sessions.some((s) => s.alt && s.chosen && s.kind === kind);
export const isGhost = (c: Course, s: Session): boolean => s.alt && !s.chosen && !hasChosen(c, s.kind);

export const byDayTime = (a: Session, b: Session): number => a.day - b.day || toMin(a.start) - toMin(b.start);

export const courseLabel = (c: Course): string => c.code || c.name;

export const weeklyMinutes = (c: Course): number =>
  c.sessions.filter((s) => isActive(s) && validSession(s)).reduce((m, s) => m + toMin(s.end) - toMin(s.start), 0);

export interface TimedItem {
  c: Course;
  s: Session;
  day: number;
  a: number;
  b: number;
}

export interface Conflicts {
  items: TimedItem[];
  /** session id → ids of the courses it overlaps */
  bySession: Map<string, Set<string>>;
  /** course id → ids of the courses it overlaps */
  byCourse: Map<string, Set<string>>;
  pairs: number;
}

export function computeConflicts(list: readonly Course[]): Conflicts {
  const items: TimedItem[] = [];
  for (const c of list) for (const s of c.sessions) {
    if (isActive(s) && validSession(s)) items.push({ c, s, day: s.day, a: toMin(s.start), b: toMin(s.end) });
  }
  const bySession = new Map<string, Set<string>>();
  const byCourse = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(v);
  };
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i], y = items[j];
      if (x.c.id === y.c.id || x.day !== y.day || !(x.a < y.b && y.a < x.b)) continue;
      pairs++;
      add(bySession, x.s.id, y.c.id); add(bySession, y.s.id, x.c.id);
      add(byCourse, x.c.id, y.c.id); add(byCourse, y.c.id, x.c.id);
    }
  }
  return { items, bySession, byCourse, pairs };
}

/** Other courses that `s` would overlap with. */
export function overlapsWith(c: Course, s: Session, items: readonly TimedItem[]): Course[] {
  if (!validSession(s)) return [];
  const a = toMin(s.start), b = toMin(s.end);
  return [...new Set(items.filter((i) => i.c.id !== c.id && i.day === s.day && i.a < b && a < i.b).map((i) => i.c))];
}

export interface Laid {
  a: number;
  b: number;
  lane: number;
  lanes: number;
}

/** Side-by-side layout for one day: overlapping events share the width of their cluster. */
export function layoutDay<T extends { a: number; b: number }>(evts: T[]): (T & Laid)[] {
  const out = evts.map((e) => ({ ...e, lane: 0, lanes: 1 }));
  out.sort((x, y) => x.a - y.a || y.b - x.b);
  let cluster: (T & Laid)[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes: number[] = [];
    for (const e of cluster) {
      let i = lanes.findIndex((end) => end <= e.a);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = e.b;
      e.lane = i;
    }
    for (const e of cluster) e.lanes = lanes.length;
    cluster = [];
  };
  for (const e of out) {
    if (cluster.length && e.a >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.b);
  }
  flush();
  return out;
}
