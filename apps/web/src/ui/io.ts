import {
  buildICS, dedupeIds, fmtDate, isoDate, mergeById, mergeData, newSemester, parseBackup, plural, semesterRange,
  serializeBackup, slugKey,
} from '@uniplan/core';
import { $, esc } from '../dom';
import type { Platform } from '../platform';
import { commit, sem, setUi, state, undoAction } from '../store';
import { choose } from './choice';
import { derive } from './planner';
import { toast } from './toast';

const courseCount = () => state.data.semesters.reduce((n, s) => n + s.courses.length, 0);

/** Hands a file to the platform (download, save dialog or share sheet). Resolves false if cancelled or failed. */
async function exportFile(file: Parameters<Platform['exportFile']>[0]): Promise<boolean> {
  try {
    return await state.platform.exportFile(file);
  } catch (err) {
    console.error(err);
    toast(`Couldn’t export ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function exportBackup(): Promise<void> {
  const ok = await exportFile({ name: `uniplan-backup-${isoDate(new Date())}.json`, content: serializeBackup(state.data), mime: 'application/json' });
  if (ok) toast(`Exported ${plural(state.data.semesters.length, 'semester')}, ${plural(courseCount(), 'course')}`);
}

/**
 * Final courses of the open semester as weekly events over its lecture period. Without one,
 * 15 weeks from now, or from the start of the term if the semester's name says it's still ahead.
 */
export async function exportCalendar(): Promise<void> {
  const s = sem();
  const final = s.courses.filter((c) => c.stage === 2 && !c.hidden);
  const list = final.length ? final : derive().table;
  if (!list.length) { toast('No courses to export'); return; }
  const term = semesterRange(s)?.[0];
  const from = term && term > isoDate(new Date()) ? term : undefined;
  const ics = buildICS(list, { name: `${s.name} · Uniplan`, start: s.start, end: s.end, from });
  if (!await exportFile({ name: `uniplan-${slugKey(s.name, [])}.ics`, content: ics, mime: 'text/calendar' })) return;
  const span = s.start && s.end ? 'over the lecture period' : `15 weekly repeats from ${from ? fmtDate(from) : 'this week'}`;
  toast(final.length ? `Exported ${plural(final.length, 'final course')} (${span})` : 'No final courses yet, exported what’s on screen');
}

/** Picks a backup with the platform's own picker if it has one, else with the hidden file input. */
export async function openImport(): Promise<void> {
  if (!state.platform.openFile) { $('#import-file').click(); return; }
  try {
    const text = await state.platform.openFile();
    if (text != null) await importText(text);
  } catch (err) {
    console.error(err);
    toast('Couldn’t read that file');
  }
}

export async function importText(text: string): Promise<void> {
  let parsed;
  try {
    parsed = parseBackup(text);
  } catch {
    toast('That file doesn’t look like a Uniplan backup');
    return;
  }

  if (parsed.kind === 'full') {
    const incoming = parsed.data;
    const n = incoming.semesters.reduce((s, x) => s + x.courses.length, 0);
    if (!incoming.semesters.length) { toast('No semesters found in that file'); return; }
    let mode = 'replace';
    if (courseCount()) {
      mode = await choose({
        title: `Import ${plural(incoming.semesters.length, 'semester')}?`,
        body: `The backup has ${plural(n, 'course')}. <b>Merge</b> adds its semesters to yours (ones you already have get updated) and keeps your degree requirements. <b>Replace</b> swaps everything out.`,
        options: [{ value: 'cancel', label: 'Cancel' }, { value: 'replace', label: 'Replace' }, { value: 'merge', label: 'Merge', primary: true }],
      }) ?? 'cancel';
    }
    if (mode !== 'replace' && mode !== 'merge') return;
    commit(() => { state.data = mode === 'replace' ? incoming : mergeData(state.data, incoming); });
    toast(`Imported ${plural(incoming.semesters.length, 'semester')}`, undoAction());
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
  // Courses keep their ids so a re-import updates them, but ids already used in another semester get new ones.
  if (mode === 'new') {
    const fresh = newSemester(`Imported ${isoDate(new Date())}`, { courses: incoming });
    commit(() => { state.data.semesters.push(fresh); dedupeIds(state.data); });
    setUi({ mode: 'semester', semesterId: fresh.id });
    toast(`Imported ${plural(incoming.length, 'course')} into ${fresh.name}. Rename it from the semester menu.`, undoAction());
    return;
  }
  if (mode !== 'replace' && mode !== 'merge') return;
  commit(() => {
    s.courses = mode === 'replace' ? incoming : mergeById(s.courses, incoming);
    // The semester being imported into goes first, so its courses keep their ids.
    dedupeIds({ ...state.data, semesters: [s, ...state.data.semesters.filter((x) => x !== s)] });
  });
  toast(`Imported ${plural(incoming.length, 'course')} into ${s.name}`, undoAction());
}
