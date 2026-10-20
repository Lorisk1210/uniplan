import { defaultProgram, normalizeProgram } from './program';
import { newSemester, termAt, termName } from './semesters';
import { padTime, validDate } from './time';
import type { Course, PlanData, Semester, Session, Stage } from './types';
import { isObject, optNumber, str, uid } from './util';

export const HUES = [255, 225, 195, 165, 140, 105, 75, 50, 25, 0, 330, 295];

const STAGES: readonly Stage[] = [-1, 0, 1, 2];
const LIVE_STAGES = [0, 1, 2] as const;

/** Ids end up in HTML attributes and file names, so anything but plain characters gets a fresh one. */
const id = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : uid());

export function normalizeSession(s: unknown): Session | null {
  if (!isObject(s)) return null;
  const alt = !!s.alt;
  return {
    id: id(s.id),
    day: Math.min(6, Math.max(0, parseInt(str(s.day), 10) || 0)),
    start: padTime(s.start),
    end: padTime(s.end),
    kind: str(s.kind, 'Lecture').trim(),
    location: str(s.location).trim(),
    alt,
    chosen: alt && !!s.chosen,
  };
}

export function normalizeCourse(r: unknown): Course | null {
  if (!isObject(r)) return null;
  const hue = Number(r.hue);
  return {
    id: id(r.id),
    name: str(r.name).trim() || 'Untitled course',
    code: str(r.code).trim(),
    credits: optNumber(r.credits),
    instructor: str(r.instructor).trim(),
    notes: str(r.notes),
    tags: Array.isArray(r.tags) ? [...new Set(r.tags.map((t) => String(t).trim()).filter(Boolean))] : [],
    area: typeof r.area === 'string' ? r.area : '',
    hue: Number.isFinite(hue) ? hue : HUES[0],
    favorite: !!r.favorite,
    hidden: !!r.hidden,
    stage: STAGES.includes(r.stage as Stage) ? (r.stage as Stage) : 0,
    prevStage: LIVE_STAGES.includes(r.prevStage as 0) ? (r.prevStage as 0 | 1 | 2) : 0,
    createdAt: Number(r.createdAt) || Date.now(),
    sessions: Array.isArray(r.sessions) ? r.sessions.map(normalizeSession).filter((s): s is Session => !!s) : [],
  };
}

/** Valid courses from a list, each course and session with its own id. */
export function normalizeCourses(list: unknown): Course[] {
  const courses = Array.isArray(list) ? list.map(normalizeCourse).filter((c): c is Course => !!c) : [];
  const seen = new Set<string>();
  for (const c of courses) [c, ...c.sessions].forEach((x) => unique(x, seen));
  return courses;
}

export function normalizeSemester(r: unknown): Semester | null {
  if (!isObject(r)) return null;
  const start = validDate(r.start) ? r.start : '';
  const end = validDate(r.end) && (!start || r.end >= start) ? r.end : '';
  return {
    id: id(r.id),
    name: str(r.name).trim() || 'Untitled semester',
    start,
    end,
    createdAt: Number(r.createdAt) || Date.now(),
    courses: normalizeCourses(r.courses),
  };
}

export const emptyData = (): PlanData => ({ version: 2, program: defaultProgram(), semesters: [] });

/** v1 stored one flat list of courses: an array, or a backup file `{ app: 'uniplan', version: 1, courses }`. */
export const legacyCourses = (raw: unknown): unknown[] | null =>
  Array.isArray(raw) ? raw : isObject(raw) && !Array.isArray(raw.semesters) && Array.isArray(raw.courses) ? raw.courses : null;

/**
 * Accepts anything Uniplan ever stored or exported and returns valid version 2 data.
 * Version 1 courses move into a semester named after the current term.
 * Course and session ids are kept, so re-importing a backup updates instead of duplicating.
 */
export function normalizeData(raw: unknown, now = new Date()): PlanData {
  const legacy = legacyCourses(raw);
  if (legacy) {
    const data = emptyData();
    const courses = normalizeCourses(legacy);
    if (courses.length) data.semesters.push(newSemester(termName(termAt(now)), { courses }));
    return dedupeIds(data);
  }
  if (!isObject(raw)) return emptyData();
  const semesters = (Array.isArray(raw.semesters) ? raw.semesters : []).map(normalizeSemester).filter((s): s is Semester => !!s);
  return dedupeIds({ version: 2, program: 'program' in raw ? normalizeProgram(raw.program) : defaultProgram(), semesters });
}

/**
 * Gives every semester, course and session a unique id, in place. The first one keeps it.
 * Ids can collide after importing a backup into a second semester.
 */
export function dedupeIds(data: PlanData): PlanData {
  const seen = new Set<string>();
  for (const s of data.semesters) {
    unique(s, seen);
    for (const c of s.courses) [c, ...c.sessions].forEach((x) => unique(x, seen));
  }
  return data;
}

function unique(x: { id: string }, seen: Set<string>): void {
  if (seen.has(x.id)) x.id = uid();
  seen.add(x.id);
}
