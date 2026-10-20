import { clone, normalizeProgram, plural, PROGRAM_PRESETS, type Program } from '@uniplan/core';
import { $, $$, closest, esc, icon } from '../dom';
import { commit, state, undoAction } from '../store';
import { toast } from './toast';

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>('#dlg-program');
let draft: Program | null = null;

const num = (v: number | null) => (v == null ? '' : String(v));

/** How many courses (in any semester) use each area. */
function areaUse(): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of state.data.semesters) for (const c of s.courses) if (c.area) m.set(c.area, (m.get(c.area) || 0) + 1);
  return m;
}

export function openProgramDialog(): void {
  draft = clone(state.data.program);
  const d = dlg();
  d.innerHTML = `<form class="ed pd" novalidate>
    <header class="dlg-head">
      <h2>Degree requirements</h2>
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-pd="close" title="Close (Esc)">${icon('x')}</button>
    </header>
    <div class="dlg-body">
      <div class="field-row pd-top">
        <label class="field"><span>Degree</span><input name="p-name" autocomplete="off" placeholder="e.g. M.Sc. Informatik"></label>
        <label class="field"><span>Total credits</span><input name="p-total" type="number" min="0" step="1" inputmode="numeric" placeholder="120"></label>
      </div>
      <div class="field">
        <div class="lbl-row"><span class="lbl">Groups and areas</span>
          <span class="hint">Each course gets an area. Groups add up their areas. Leave max empty for “no upper limit”.</span></div>
        <div class="pg-list" id="pd-groups"></div>
        <button type="button" class="btn btn-ghost btn-sm sess-add" data-pd="add-group">${icon('plus')}Add group</button>
      </div>
      <div class="field">
        <span class="lbl">Start over from a preset</span>
        <div class="preset-row">
          <select name="preset" aria-label="Preset">${PROGRAM_PRESETS.map((p) => `<option value="${p.key}">${esc(p.label)}</option>`).join('')}</select>
          <button type="button" class="btn btn-sm" data-pd="preset">Use preset</button>
        </div>
      </div>
    </div>
    <footer class="dlg-foot">
      <span class="hint">Removing an area keeps its courses. They show up as not assigned.</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-pd="close">Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </footer>
  </form>`;
  renderDraft();
  d.showModal();
}

function renderDraft(): void {
  const d = dlg();
  const p = draft!;
  $<HTMLInputElement>('[name=p-name]', d).value = p.name;
  $<HTMLInputElement>('[name=p-total]', d).value = num(p.total);
  const use = areaUse();
  $('#pd-groups', d).innerHTML = p.groups.length ? p.groups.map((g, gi) => `<div class="pg" data-g="${gi}">
    <div class="pg-row pg-head">
      <input name="label" value="${esc(g.label)}" placeholder="Group name" aria-label="Group name" autocomplete="off">
      <input name="min" type="number" min="0" value="${num(g.min)}" placeholder="min" aria-label="Minimum credits" inputmode="numeric">
      <input name="max" type="number" min="0" value="${num(g.max)}" placeholder="max" aria-label="Maximum credits" inputmode="numeric">
      <button type="button" class="icon-btn sm" data-pd="rm-group" title="Remove group">${icon('x')}</button>
    </div>
    ${g.areas.map((a, ai) => `<div class="pg-row pa" data-a="${ai}">
      <input name="label" value="${esc(a.label)}" placeholder="Area name" aria-label="Area name" autocomplete="off">
      <input name="short" value="${esc(a.short === a.label ? '' : a.short)}" placeholder="Short name" aria-label="Short name" autocomplete="off">
      <input name="min" type="number" min="0" value="${num(a.min)}" placeholder="min" aria-label="Minimum credits" inputmode="numeric">
      <input name="max" type="number" min="0" value="${num(a.max)}" placeholder="max" aria-label="Maximum credits" inputmode="numeric">
      <button type="button" class="icon-btn sm" data-pd="rm-area" title="Remove area${use.get(a.key) ? ` (used by ${plural(use.get(a.key)!, 'course')})` : ''}">${icon('x')}</button>
    </div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm pa-add" data-pd="add-area">${icon('plus')}Add area</button>
  </div>`).join('') : `<div class="sess-empty">No groups: only the total counts. Add groups to track areas like seminars or electives.</div>`;
}

/** Reads the form back into the draft before re-rendering or saving. */
function syncDraft(): void {
  const d = dlg();
  const p = draft!;
  const n = (v: string) => (v.trim() === '' ? null : Math.max(0, +v));
  p.name = $<HTMLInputElement>('[name=p-name]', d).value;
  p.total = n($<HTMLInputElement>('[name=p-total]', d).value) ?? 0;
  for (const gEl of $$('.pg', d)) {
    const g = p.groups[+gEl.dataset.g!];
    const head = $('.pg-head', gEl);
    const v = (el: Element, name: string) => $<HTMLInputElement>(`[name=${name}]`, el).value;
    g.label = v(head, 'label');
    g.min = n(v(head, 'min')) ?? 0;
    g.max = n(v(head, 'max'));
    for (const aEl of $$('.pa', gEl)) {
      const a = g.areas[+aEl.dataset.a!];
      a.label = v(aEl, 'label');
      a.short = v(aEl, 'short').trim() || a.label;
      a.min = n(v(aEl, 'min')) ?? 0;
      a.max = n(v(aEl, 'max'));
    }
  }
}

export function initProgramDialog(): void {
  const d = dlg();
  d.addEventListener('submit', (e) => {
    e.preventDefault();
    syncDraft();
    const program = normalizeProgram(draft);
    commit(() => { state.data.program = program; });
    toast('Saved degree requirements', undoAction());
    d.close();
  });
  d.addEventListener('click', (e) => {
    if (e.target === d) { d.close(); return; }
    const b = closest(e.target, '[data-pd]');
    if (!b || !draft) return;
    const act = b.dataset.pd;
    if (act === 'close') { d.close(); return; }
    syncDraft();
    const gi = +(b.closest<HTMLElement>('.pg')?.dataset.g ?? -1);
    if (act === 'add-group') {
      draft.groups.push({ key: '', label: '', min: 0, max: null, areas: [{ key: '', label: '', short: '', min: 0, max: null }] });
    } else if (act === 'rm-group') {
      draft.groups.splice(gi, 1);
    } else if (act === 'add-area') {
      draft.groups[gi].areas.push({ key: '', label: '', short: '', min: 0, max: null });
    } else if (act === 'rm-area') {
      draft.groups[gi].areas.splice(+b.closest<HTMLElement>('.pa')!.dataset.a!, 1);
    } else if (act === 'preset') {
      const key = $<HTMLSelectElement>('[name=preset]', d).value;
      draft = PROGRAM_PRESETS.find((p) => p.key === key)!.make();
    }
    renderDraft();
    if (act === 'add-group') $$<HTMLInputElement>('.pg-head [name=label]', d).at(-1)?.focus();
    if (act === 'add-area') $$<HTMLInputElement>(`.pg[data-g="${gi}"] .pa [name=label]`, d).at(-1)?.focus();
  });
  d.addEventListener('close', () => { draft = null; });
}
