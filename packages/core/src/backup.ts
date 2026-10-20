import { legacyCourses, normalizeCourses, normalizeData } from './normalize';
import type { Course, PlanData } from './types';
import { isObject } from './util';

export const serializeBackup = (data: PlanData, now = new Date()): string =>
  JSON.stringify({ app: 'uniplan', version: 2, exportedAt: now.toISOString(), program: data.program, semesters: data.semesters }, null, 2);

export type ParsedBackup =
  | { kind: 'full'; data: PlanData }
  /** A version 1 backup: one semester's worth of courses. */
  | { kind: 'courses'; courses: Course[] };

/** Throws if `text` isn't a Uniplan backup. */
export function parseBackup(text: string): ParsedBackup {
  const raw: unknown = JSON.parse(text);
  const legacy = legacyCourses(raw);
  if (legacy) return { kind: 'courses', courses: normalizeCourses(legacy) };
  if (isObject(raw) && Array.isArray(raw.semesters)) return { kind: 'full', data: normalizeData(raw) };
  throw new Error('Not a Uniplan backup');
}

/** Items with a matching id are replaced, the rest are appended. */
export function mergeById<T extends { id: string }>(into: T[], incoming: readonly T[]): T[] {
  const out = [...into];
  for (const x of incoming) {
    const i = out.findIndex((y) => y.id === x.id);
    if (i >= 0) out[i] = x; else out.push(x);
  }
  return out;
}

/** Keeps your degree requirements; semesters from the backup replace those with the same id. */
export const mergeData = (current: PlanData, incoming: PlanData): PlanData => ({
  ...current,
  semesters: mergeById(current.semesters, incoming.semesters),
});
