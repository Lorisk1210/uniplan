import { normalizeData } from './normalize';
import type { PlanData } from './types';

/**
 * A plan the way the sync server stores it: one item per program, semester and course, keyed
 * "program", "semester:<id>" and "course:<id>", each holding its JSON. Two devices can then change
 * different courses without overwriting each other.
 */
export type SyncItems = Map<string, string>;

export function toItems(data: PlanData): SyncItems {
  const items: SyncItems = new Map([['program', JSON.stringify(data.program)]]);
  for (const { courses, ...semester } of data.semesters) {
    items.set(`semester:${semester.id}`, JSON.stringify(semester));
    for (const c of courses) items.set(`course:${c.id}`, JSON.stringify({ ...c, semesterId: semester.id }));
  }
  return items;
}

type Obj = Record<string, unknown>;
const parse = (json: string): Obj | null => {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
  } catch {
    return null;
  }
};

export function fromItems(items: SyncItems): PlanData {
  let program: Obj | null = null;
  const semesters = new Map<string, Obj & { courses: Obj[] }>();
  const courses: Obj[] = [];
  for (const [key, json] of items) {
    const v = parse(json);
    if (!v) continue;
    if (key === 'program') program = v;
    else if (key.startsWith('semester:')) semesters.set(key.slice(9), { ...v, id: key.slice(9), courses: [] });
    else if (key.startsWith('course:')) courses.push({ ...v, id: key.slice(7) });
  }
  courses.sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  for (const { semesterId, ...course } of courses) {
    const id = String(semesterId);
    // Another device deleted the semester while this one added the course. Keep the course.
    if (!semesters.has(id)) semesters.set(id, { id, name: 'Recovered courses', courses: [] });
    semesters.get(id)!.courses.push(course);
  }
  return normalizeData({ version: 2, ...(program ? { program } : {}), semesters: [...semesters.values()] });
}

/** Items in the form this version of the app writes them, so differences in form don't count as changes. */
export const canonicalItems = (items: SyncItems): SyncItems => toItems(fromItems(items));

export const sameItems = (a: SyncItems, b: SyncItems): boolean =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export interface SyncResult {
  /** What this device should now have. */
  merged: SyncItems;
  /** What to send so the server has `merged` too. */
  put: [key: string, value: string][];
  remove: string[];
}

/**
 * Three-way merge per item. `base` is the server state this device last took in, so comparing
 * against it tells which side changed an item. Without a base (first sync on this device), the
 * server's version wins and items only this device has are kept.
 *
 * If both sides changed an item, this device's edit wins, and an edit beats a delete.
 */
export function mergeItems(base: SyncItems | null, local: SyncItems, remote: SyncItems): SyncResult {
  const merged: SyncItems = new Map();
  const put: SyncResult['put'] = [];
  const remove: string[] = [];
  for (const key of new Set([...(base?.keys() ?? []), ...local.keys(), ...remote.keys()])) {
    const b = base?.get(key), l = local.get(key), r = remote.get(key);
    let v: string | undefined;
    if (!base) v = r ?? l;
    else if (l === b) v = r;
    else if (r === b) v = l;
    else v = l ?? r;
    if (v !== undefined) merged.set(key, v);
    if (v !== r) {
      if (v === undefined) remove.push(key);
      else put.push([key, v]);
    }
  }
  return { merged, put, remove };
}
