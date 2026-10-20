import {
  clone, fmtNum, newSemester, normalizeCourse, plural, summarizeSemester, suggestSemesterName, uid, validDate, type Semester,
} from '@uniplan/core';
import { $, closest, esc, icon } from '../dom';
import { commit, sem, setUi, state, undoAction } from '../store';
import { choose } from './choice';
import { toast } from './toast';

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>('#dlg-semester');
let editingId: string | null = null;

/** Opens the form for a new semester, or for editing `id`. */
export function openSemesterDialog(id?: string): void {
  const s = id ? state.data.semesters.find((x) => x.id === id) : undefined;
  editingId = s?.id ?? null;
  const from = sem();
  const carry = from.courses.filter((c) => c.stage === 0 || c.stage === 1).length;
  const d = dlg();
  d.innerHTML = `<form class="ed" novalidate>
    <header class="dlg-head">
      <h2>${s ? 'Edit semester' : 'New semester'}</h2>
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-sd="close" title="Close (Esc)">${icon('x')}</button>
    </header>
    <div class="dlg-body">
      <label class="field"><span>Name</span>
        <input name="name" value="${esc(s?.name ?? suggestSemesterName(state.data.semesters))}" placeholder="e.g. WiSe 2026/27" autocomplete="off" required></label>
      <div class="field">
        <div class="lbl-row"><span class="lbl">Lecture period</span><span class="hint">Optional. Used to sort semesters and for calendar export.</span></div>
        <div class="date-row">
          <input type="date" name="start" value="${esc(s?.start ?? '')}" aria-label="First day of lectures">
          <span class="dash">–</span>
          <input type="date" name="end" value="${esc(s?.end ?? '')}" aria-label="Last day of lectures">
        </div>
      </div>
      ${!s && carry ? `<label class="check-row"><input type="checkbox" name="carry">
        <span>Bring along ${plural(carry, 'idea or shortlisted course', 'ideas and shortlisted courses')} from ${esc(from.name)}<small>They’re copied, ${esc(from.name)} keeps its own.</small></span></label>` : ''}
    </div>
    <footer class="dlg-foot">
      ${s ? `<button type="button" class="btn btn-ghost btn-danger btn-sm" data-sd="delete">${icon('trash')}Delete semester</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-sd="close">Cancel</button>
      <button type="submit" class="btn btn-primary">${s ? 'Save' : 'Create semester'}</button>
    </footer>
  </form>`;
  d.showModal();
  const name = $<HTMLInputElement>('input[name=name]', d);
  name.focus();
  name.select();
}

function save(): void {
  const d = dlg();
  const f = $<HTMLFormElement>('form', d);
  const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null);
  const name = val('name')!.value.trim();
  const start = val('start')!.value, end = val('end')!.value;
  let ok = true;
  val('name')!.classList.toggle('invalid', !name);
  if (!name) ok = false;
  const badStart = !!start && !validDate(start);
  const badEnd = !!end && (!validDate(end) || (!!start && end < start));
  val('start')!.classList.toggle('invalid', badStart);
  val('end')!.classList.toggle('invalid', badEnd);
  if (badStart || badEnd) ok = false;
  if (!ok) return;

  if (editingId) {
    const id = editingId;
    commit(() => {
      const s = state.data.semesters.find((x) => x.id === id);
      if (s) Object.assign(s, { name, start, end });
    });
    toast(`Saved ${name}`);
  } else {
    const from = sem();
    const carry = !!val('carry')?.checked;
    const s = newSemester(name, { start, end });
    if (carry) {
      s.courses = from.courses.filter((c) => c.stage === 0 || c.stage === 1).map((c) =>
        normalizeCourse({ ...clone(c), id: uid(), createdAt: Date.now(), sessions: c.sessions.map((x) => ({ ...x, id: uid() })) })!);
    }
    commit(() => { state.data.semesters.push(s); });
    setUi({ mode: 'semester', semesterId: s.id, view: 'ideas' });
    toast(carry ? `Created ${name} with ${plural(s.courses.length, 'course')}` : `Created ${name}`, undoAction);
  }
  d.close();
}

export async function deleteSemester(s: Semester): Promise<void> {
  const sum = summarizeSemester(s);
  const v = await choose({
    title: `Delete ${s.name}?`,
    body: s.courses.length
      ? `This removes its ${plural(s.courses.length, 'course')}${sum.credits ? `, including ${fmtNum(sum.credits)} credits in Final` : ''}. You can undo right after.`
      : 'It has no courses yet.',
    options: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: 'Delete semester', primary: true }],
  });
  if (v !== 'ok') return;
  commit(() => { state.data.semesters = state.data.semesters.filter((x) => x.id !== s.id); });
  toast(`Deleted ${s.name}`, undoAction);
}

export function initSemesterDialog(): void {
  const d = dlg();
  d.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  d.addEventListener('click', async (e) => {
    if (e.target === d) { d.close(); return; }
    const b = closest(e.target, '[data-sd]');
    if (!b) return;
    if (b.dataset.sd === 'close') d.close();
    if (b.dataset.sd === 'delete' && editingId) {
      const s = state.data.semesters.find((x) => x.id === editingId);
      d.close();
      if (s) await deleteSemester(s);
    }
  });
  d.addEventListener('input', (e) => (e.target as HTMLElement).classList.remove('invalid'));
}
