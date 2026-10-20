import { isoDate, parseDate } from './time';
import type { Semester } from './types';
import { uid } from './util';

/** German-style academic terms: winter runs October–March (named by its starting year), summer April–September. */
export interface Term {
  kind: 'winter' | 'summer';
  year: number;
}

export const termAt = (d: Date): Term => {
  const m = d.getMonth();
  if (m >= 3 && m <= 8) return { kind: 'summer', year: d.getFullYear() };
  return { kind: 'winter', year: m >= 9 ? d.getFullYear() : d.getFullYear() - 1 };
};

export const termName = (t: Term): string =>
  t.kind === 'summer' ? `SoSe ${t.year}` : `WiSe ${t.year}/${String((t.year + 1) % 100).padStart(2, '0')}`;

export const nextTerm = (t: Term): Term =>
  t.kind === 'summer' ? { kind: 'winter', year: t.year } : { kind: 'summer', year: t.year + 1 };

/** Understands "WiSe 2025/26", "WS 25/26", "SoSe 2026", "SS26", "Winter 2025", "Summer 2026". */
export function parseTermName(name: string): Term | null {
  const m = /\b(wise|ws|winter(?:semester)?|sose|ss|summer|sommer(?:semester)?)\s*(\d{4}|\d{2})\b/i.exec(name);
  if (!m) return null;
  const y = +m[2];
  const year = m[2].length === 2 ? 2000 + y : y;
  return { kind: /^(wise|ws|winter)/i.test(m[1]) ? 'winter' : 'summer', year };
}

const termRange = (t: Term): [string, string] =>
  t.kind === 'summer' ? [`${t.year}-04-01`, `${t.year}-09-30`] : [`${t.year}-10-01`, `${t.year + 1}-03-31`];

/** The lecture period if set, else the term the name refers to, else nothing. */
export function semesterRange(s: Semester): [string, string] | null {
  const term = parseTermName(s.name);
  const guess = term ? termRange(term) : null;
  const start = s.start || guess?.[0] || '';
  const end = s.end || guess?.[1] || '';
  return start && end ? [start, end] : null;
}

export type SemesterStatus = 'past' | 'current' | 'upcoming';

export function semesterStatus(s: Semester, now = new Date()): SemesterStatus | null {
  const range = semesterRange(s);
  if (!range) return null;
  const today = isoDate(now);
  return today < range[0] ? 'upcoming' : today > range[1] ? 'past' : 'current';
}

const sortKey = (s: Semester): string => s.start || semesterRange(s)?.[0] || '';

/** Chronological; semesters without any date go last, in the order they were created. */
export const sortSemesters = (list: readonly Semester[]): Semester[] =>
  [...list].sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
    if (!!ka !== !!kb) return ka ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

/** The term that's on now, or the next one after it whose name isn't taken yet. */
export function suggestSemesterName(existing: readonly Semester[], now = new Date()): string {
  const taken = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  let t = termAt(now);
  for (let i = 0; i < 20 && taken.has(termName(t).toLowerCase()); i++) t = nextTerm(t);
  return termName(t);
}

/** Opens on the semester that's running now, else the next one (you're planning it), else the latest past one. */
export function pickDefaultSemester(list: readonly Semester[], now = new Date()): Semester | undefined {
  const sorted = sortSemesters(list);
  const status = (s: Semester) => semesterStatus(s, now);
  return sorted.find((s) => status(s) === 'current')
    ?? sorted.find((s) => status(s) === 'upcoming')
    ?? sorted.filter((s) => status(s) === 'past').at(-1)
    ?? sorted[0];
}

export const newSemester = (name: string, patch: Partial<Semester> = {}): Semester => ({
  id: uid(),
  name,
  start: '',
  end: '',
  createdAt: Date.now(),
  courses: [],
  ...patch,
});

export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string =>
  s ? parseDate(s).toLocaleDateString(undefined, opts) : '';

/** Compact label for chips: "WiSe 2026/27" → "WS 26/27", "SoSe 2026" → "SS 26". */
export function shortSemesterName(name: string): string {
  const t = parseTermName(name);
  if (t) return t.kind === 'summer' ? `SS ${String(t.year % 100).padStart(2, '0')}` : `WS ${String(t.year % 100).padStart(2, '0')}/${String((t.year + 1) % 100).padStart(2, '0')}`;
  return name.length > 10 ? `${name.slice(0, 9).trimEnd()}…` : name;
}
