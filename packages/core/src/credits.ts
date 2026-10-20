import { areaIndex } from './program';
import type { Course, PlanData, Program, ProgramGroup, Semester } from './types';
import { sum } from './util';

export interface CreditEntry {
  course: Course;
  semester: Semester;
  /** Settled: the course is in Final. Everything else is still tentative. */
  firm: boolean;
  /** Comes from another semester than the one being planned. */
  other: boolean;
}

export interface Bucket {
  /** Credits of every entry, firm or not. */
  all: number;
  /** Credits of firm entries only. */
  firm: number;
  entries: CreditEntry[];
}

export interface CreditTally {
  /** Area key → bucket; '' collects courses without a (known) area. */
  area(key: string): Bucket;
  group(g: ProgramGroup): Bucket;
  total: Bucket;
}

const credits = (e: CreditEntry): number => e.course.credits || 0;

const bucket = (entries: CreditEntry[]): Bucket => ({
  all: sum(entries, credits),
  firm: sum(entries.filter((e) => e.firm), credits),
  entries,
});

export function tallyCredits(program: Program, entries: readonly CreditEntry[]): CreditTally {
  const areas = areaIndex(program);
  const byArea = new Map<string, CreditEntry[]>();
  for (const e of entries) {
    const k = areas.has(e.course.area) ? e.course.area : '';
    if (!byArea.has(k)) byArea.set(k, []);
    byArea.get(k)!.push(e);
  }
  const area = (k: string) => bucket(byArea.get(k) ?? []);
  return {
    area,
    group: (g) => bucket(g.areas.flatMap((a) => byArea.get(a.key) ?? [])),
    total: bucket([...entries]),
  };
}

/** Every Final course of every semester: the credits of the whole degree. */
export const finalEntries = (data: PlanData): CreditEntry[] =>
  data.semesters.flatMap((semester) =>
    semester.courses.filter((c) => c.stage === 2).map((course) => ({ course, semester, firm: true, other: false })));

/**
 * What planning one semester adds up to: its courses that reached `minStage` (hidden ones left out,
 * like on the timetable) on top of the Final courses of all other semesters.
 */
export function planEntries(data: PlanData, semester: Semester, minStage: 0 | 1 | 2): CreditEntry[] {
  const own = semester.courses
    .filter((c) => c.stage >= minStage && !c.hidden)
    .map((course) => ({ course, semester, firm: course.stage === 2, other: false }));
  const others = finalEntries(data)
    .filter((e) => e.semester.id !== semester.id)
    .map((e) => ({ ...e, other: true }));
  return [...own, ...others];
}

export interface SemesterSummary {
  /** Credits of Final courses. */
  credits: number;
  /** Number of Final courses. */
  final: number;
  /** Final courses without a credit value. */
  missingCredits: number;
  /** Courses still being considered (Idea or Shortlist). */
  open: number;
}

export const summarizeSemester = (s: Semester): SemesterSummary => {
  const final = s.courses.filter((c) => c.stage === 2);
  return {
    credits: sum(final, (c) => c.credits || 0),
    final: final.length,
    missingCredits: final.filter((c) => c.credits == null).length,
    open: s.courses.filter((c) => c.stage === 0 || c.stage === 1).length,
  };
};
