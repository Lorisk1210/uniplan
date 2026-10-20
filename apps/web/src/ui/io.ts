import {
  buildICS, exampleCourses, isoDate, mergeById, mergeData, newSemester, parseBackup, plural, serializeBackup,
} from '@uniplan/core';
import { esc } from '../dom';
import { commit, sem, setUi, state, undoAction } from '../store';
import { choose } from './choice';
import { derive } from './planner';
import { toast } from './toast';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'semester';

export async function exportBackup(): Promise<void> {
  const n = state.data.semesters.reduce((s, x) => s + x.courses.length, 0);
  const ok = await state.platform.exportFile({ name: `uniplan-backup-${isoDate(new Date())}.json`, content: serializeBackup(state.data), mime: 'application/json' });
  if (ok) toast(`Exported ${plural(state.data.semesters.length, 'semester')}, ${plural(n, 'course')}`);
}

/** Final courses of the open semester as weekly events, over its lecture period if set. */
export async function exportCalendar(): Promise<void> {
  const s = sem();
  const final = s.courses.filter((c) => c.stage === 2 && !c.hidden);
  const list = final.length ? final : derive().table;
  if (!list.length) { toast('No courses to export'); return; }
  const ics = buildICS(list, { name: `${s.name} · Uniplan`, start: s.start, end: s.end });
  const ok = await state.platform.exportFile({ name: `uniplan-${slug(s.name)}.ics`, content: ics, mime: 'text/calendar' });
  if (!ok) return;
  const span = s.start && s.end ? 'over the lecture period' : '15 weekly repeats';
  toast(final.length ? `Exported ${plural(final.length, 'final course')} (${span})` : 'No final courses yet, exported what’s on screen');
}

export async function importFile(file: File): Promise<void> {
  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch {
    toast('That file doesn’t look like a Uniplan backup');
    return;
  }
  const have = state.data.semesters.reduce((s, x) => s + x.courses.length, 0);

  if (parsed.kind === 'full') {
    const incoming = parsed.data;
    const n = incoming.semesters.reduce((s, x) => s + x.courses.length, 0);
    if (!incoming.semesters.length) { toast('No semesters found in that file'); return; }
    let mode = 'replace';
    if (have) {
      mode = await choose({
        title: `Import ${plural(incoming.semesters.length, 'semester')}?`,
        body: `The backup has ${plural(n, 'course')}. <b>Merge</b> adds its semesters to yours (ones you already have get updated) and keeps your degree requirements. <b>Replace</b> swaps everything out.`,
        options: [{ value: 'cancel', label: 'Cancel' }, { value: 'replace', label: 'Replace' }, { value: 'merge', label: 'Merge', primary: true }],
      }) ?? 'cancel';
    }
    if (mode !== 'replace' && mode !== 'merge') return;
    commit(() => { state.data = mode === 'replace' ? incoming : mergeData(state.data, incoming); });
    toast(`Imported ${plural(incoming.semesters.length, 'semester')}`, undoAction);
    return;
  }

  // A version 1 backup: a single list of courses.
  const incoming = parsed.courses;
  if (!incoming.length) { toast('No courses found in that file'); return; }
  const s = sem();
  let mode = 'merge';
  if (s.courses.length) {
    mode = await choose({
      title: `Import ${plural(incoming.length, 'course')}?`,
      body: `${esc(s.name)} already has ${plural(s.courses.length, 'course')}. Merge keeps both (matching courses get updated), replace swaps them out, or put the imported courses in a semester of their own.`,
      options: [{ value: 'cancel', label: 'Cancel' }, { value: 'new', label: 'New semester' }, { value: 'replace', label: 'Replace' }, { value: 'merge', label: 'Merge', primary: true }],
    }) ?? 'cancel';
  }
  if (mode === 'new') {
    const fresh = newSemester(`Imported ${isoDate(new Date())}`, { courses: incoming });
    commit(() => { state.data.semesters.push(fresh); });
    setUi({ mode: 'semester', semesterId: fresh.id });
    toast(`Imported ${plural(incoming.length, 'course')} into ${fresh.name}. Rename it from the semester menu.`, undoAction);
    return;
  }
  if (mode !== 'replace' && mode !== 'merge') return;
  commit(() => { s.courses = mode === 'replace' ? incoming : mergeById(s.courses, incoming); });
  toast(`Imported ${plural(incoming.length, 'course')} into ${s.name}`, undoAction);
}

export function loadExamples(): void {
  const ex = exampleCourses();
  commit(() => { sem().courses.push(...ex); });
  toast(`Added ${ex.length} example courses`, undoAction);
}
