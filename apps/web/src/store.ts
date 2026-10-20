import {
  areaIndex, newSemester, normalizeData, pickDefaultSemester, sortSemesters, suggestSemesterName,
  type AreaInfo, type Course, type PlanData, type Program, type Semester, type Stage,
} from '@uniplan/core';
import type { Platform } from './platform';
import { toast } from './ui/toast';

/* ───────────────────────── Waves ───────────────────────── */

export type ViewKey = 'ideas' | 'shortlist' | 'final' | 'dropped';
export interface View {
  key: ViewKey;
  stage: Stage;
  label: string;
  title: string;
  sub: string;
}

// Waves are a funnel: each view shows everything that made it at least that far.
export const VIEWS: View[] = [
  { key: 'ideas', stage: 0, label: 'Ideas', title: 'Ideas', sub: 'Everything that sounds interesting. Add freely, you’ll narrow it down later.' },
  { key: 'shortlist', stage: 1, label: 'Shortlist', title: 'Shortlist', sub: 'Courses you’re seriously considering.' },
  { key: 'final', stage: 2, label: 'Final', title: 'Final timetable', sub: 'Your plan for the semester.' },
  { key: 'dropped', stage: -1, label: 'Dropped', title: 'Dropped', sub: 'Courses you’ve ruled out. Restore any of them at any time.' },
];
export const inView = (c: Course, v: View): boolean => (v.stage === -1 ? c.stage === -1 : c.stage >= v.stage);

/* ───────────────────────── State ───────────────────────── */

/** Which part of the semester is on screen on a phone. Wider screens show all of them at once. */
export type Tab = 'courses' | 'week' | 'credits';

export interface UiState {
  mode: 'semester' | 'overview';
  semesterId: string;
  view: ViewKey;
  tab: Tab;
  /** The day the phone timetable shows. */
  day: number;
  tags: string[];
  favOnly: boolean;
  conflictsOnly: boolean;
  theme: 'light' | 'dark' | 'system';
  weekend: boolean;
  search: string;
  reqsOpen: boolean;
}

// Same key as version 1, so the theme and filters carry over.
const UI_STORE = 'uniplan:ui:v1';

const defaultUi = (): UiState => ({
  mode: 'semester', semesterId: '', view: 'ideas', tab: 'week', day: Math.min(4, (new Date().getDay() + 6) % 7),
  tags: [], favOnly: false, conflictsOnly: false, theme: 'system', weekend: false, search: '', reqsOpen: true,
});

function loadUi(): UiState {
  let saved: Partial<UiState> = {};
  try { saved = JSON.parse(localStorage.getItem(UI_STORE) ?? '{}') ?? {}; } catch { /* ignore */ }
  const ui = { ...defaultUi(), ...saved };
  if (!VIEWS.some((v) => v.key === ui.view)) ui.view = 'ideas';
  if (!['courses', 'week', 'credits'].includes(ui.tab)) ui.tab = 'week';
  if (ui.mode !== 'overview') ui.mode = 'semester';
  return ui;
}

export const state = {
  data: normalizeData(null),
  ui: loadUi(),
  platform: null as unknown as Platform,
};

const listeners: (() => void)[] = [];
export const onChange = (fn: () => void): void => { listeners.push(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const saveUi = (): void => {
  try { localStorage.setItem(UI_STORE, JSON.stringify(state.ui)); } catch { /* ignore */ }
};

export function setUi(patch: Partial<UiState>): void {
  Object.assign(state.ui, patch);
  saveUi();
  emit();
}

/* ───────────────────────── Selectors ───────────────────────── */

export const semesters = (): Semester[] => sortSemesters(state.data.semesters);

/** The semester being planned. There's always one. */
export function sem(): Semester {
  return state.data.semesters.find((s) => s.id === state.ui.semesterId) ?? ensureSemester();
}

export const courses = (): Course[] => sem().courses;
export const courseById = (id: string): Course | undefined => courses().find((c) => c.id === id);

/** Looks in every semester. */
export function findCourse(id: string): { course: Course; semester: Semester } | null {
  for (const semester of state.data.semesters) {
    const course = semester.courses.find((c) => c.id === id);
    if (course) return { course, semester };
  }
  return null;
}

export const currentView = (): View => VIEWS.find((v) => v.key === state.ui.view) ?? VIEWS[0];

let areaCache: { program: Program; map: Map<string, AreaInfo> } | null = null;
/** Area key → area of the current degree requirements. */
export function areas(): Map<string, AreaInfo> {
  if (areaCache?.program !== state.data.program) areaCache = { program: state.data.program, map: areaIndex(state.data.program) };
  return areaCache.map;
}

/** Makes sure a semester exists and the UI points at a real one. */
function ensureSemester(): Semester {
  if (!state.data.semesters.length) state.data.semesters.push(newSemester(suggestSemesterName([])));
  let s = state.data.semesters.find((x) => x.id === state.ui.semesterId);
  if (!s) {
    s = pickDefaultSemester(state.data.semesters)!;
    state.ui.semesterId = s.id;
    saveUi();
  }
  return s;
}

/* ───────────────────────── Changes + undo ───────────────────────── */

let past: string[] = [];
let future: string[] = [];
const HISTORY = 100;

export function commit(fn: () => void): void {
  past.push(JSON.stringify(state.data));
  if (past.length > HISTORY) past.shift();
  future = [];
  fn();
  ensureSemester();
  persist();
  emit();
}

function travel(from: string[], to: string[], name: 'undo' | 'redo', silent: boolean): boolean {
  const snap = from.pop();
  if (snap == null) {
    if (!silent) toast(`Nothing to ${name}`);
    return false;
  }
  to.push(JSON.stringify(state.data));
  state.data = normalizeData(JSON.parse(snap));
  ensureSemester();
  persist();
  emit();
  if (!silent) toast(name === 'undo' ? 'Undone' : 'Redone');
  return true;
}

export const undo = (silent = false): boolean => travel(past, future, 'undo', silent);
export const redo = (silent = false): boolean => travel(future, past, 'redo', silent);
export const undoAction = { action: 'Undo', onAction: () => undo(true) };

/* ───────────────────────── Persistence ───────────────────────── */

let pending: string | null = null;
let saving = false;

/** Saves the latest data. Writes never overlap; while one runs, only the newest change waits. */
async function persist(): Promise<void> {
  pending = JSON.stringify(state.data);
  if (saving) return;
  saving = true;
  while (pending != null) {
    const json = pending;
    pending = null;
    try {
      await state.platform.save(json);
    } catch (err) {
      console.error(err);
      toast('Couldn’t save your changes. Export a backup to be safe.');
    }
  }
  saving = false;
}

export async function initStore(platform: Platform): Promise<string | undefined> {
  state.platform = platform;
  const { raw, notice } = await platform.load();
  state.data = normalizeData(raw);
  ensureSemester();
  const upToDate = raw != null && typeof raw === 'object' && (raw as { version?: unknown }).version === 2;
  if (!upToDate) persist();
  addEventListener('pagehide', () => {
    if ((saving || pending != null) && platform.flush) platform.flush(JSON.stringify(state.data));
  });
  return notice;
}

/** Replaces all data at once (import). Undoable. */
export function replaceData(data: PlanData): void {
  commit(() => { state.data = data; });
}
