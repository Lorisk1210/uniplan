import {
  clone, courseLabel, DAYS, fromMin, HUES, normalizeCourse, parseTime, STAGE_LABEL, toMin, uid, validTime,
  type Course, type Stage,
} from '@uniplan/core';
import { $, $$, closest, esc, icon } from '../dom';
import { commit, findCourse, sem, semesters, setUi, state, undoAction } from '../store';
import { cardAction, newCourse } from './planner';
import { toast } from './toast';

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>('#dlg-editor');
let draft: Course | null = null;
let draftIsNew = false;
/** The semester the course is in (or goes into, if new). */
let homeId = '';
/** The semester picked in the form. Differs from `homeId` when the course is being moved. */
let targetId = '';

export function openEditor(id?: string | null, preset?: Partial<Course>): void {
  const found = id ? findCourse(id) : null;
  draftIsNew = !found;
  draft = found ? clone(found.course) : newCourse(preset);
  homeId = targetId = found ? found.semester.id : sem().id;
  if (draft.name === 'Untitled course' && draftIsNew) draft.name = '';
  const d = dlg();
  d.innerHTML = editorHTML(draft);
  renderSessions();
  renderTagInput();
  if (!d.open) d.showModal();
  const nameEl = $<HTMLInputElement>('input[name=name]', d);
  nameEl.focus();
  if (!draftIsNew) nameEl.select();
}

function areaOptions(c: Course): string {
  const { groups } = state.data.program;
  const known = groups.some((g) => g.areas.some((a) => a.key === c.area));
  return `<option value="">Not assigned</option>
    ${c.area && !known ? `<option value="${esc(c.area)}" selected>Area no longer in your requirements (${esc(c.area)})</option>` : ''}
    ${groups.map((g) => `<optgroup label="${esc(g.label)}">${g.areas.map((a) =>
      `<option value="${esc(a.key)}" ${c.area === a.key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</optgroup>`).join('')}`;
}

function editorHTML(c: Course): string {
  const stageOpts: Stage[] = c.stage === -1 ? [0, 1, 2, -1] : [0, 1, 2];
  const all = semesters();
  const hasAreas = state.data.program.groups.some((g) => g.areas.length);
  return `<form class="ed" novalidate>
    <header class="dlg-head">
      <span class="ed-swatch" style="--h:${c.hue}"></span>
      <h2>${draftIsNew ? 'New course' : 'Edit course'}</h2>
      <span class="grow"></span>
      <button type="button" class="star ${c.favorite ? 'on' : ''}" data-ed="fav" title="Favorite" style="opacity:1;margin:0">${icon('star')}</button>
      <button type="button" class="icon-btn" data-ed="close" title="Close (Esc)">${icon('x')}</button>
    </header>
    <div class="dlg-body">
      <label class="field"><span>Course name</span>
        <input name="name" value="${esc(c.name)}" placeholder="e.g. Machine Learning" autocomplete="off" required></label>
      <div class="field-row three">
        <label class="field"><span>Code</span><input name="code" value="${esc(c.code)}" placeholder="CS 4780" autocomplete="off"></label>
        <label class="field"><span>Credits</span><input name="credits" type="number" min="0" step="0.5" inputmode="decimal" value="${c.credits ?? ''}" placeholder="6"></label>
        <label class="field"><span>Instructor</span><input name="instructor" value="${esc(c.instructor)}" placeholder="Prof. …" autocomplete="off"></label>
      </div>
      <div class="field-row ${all.length > 1 ? 'two' : ''}">
        ${hasAreas ? `<label class="field"><span>Area</span><select name="area">${areaOptions(c)}</select></label>` : `<input type="hidden" name="area" value="${esc(c.area)}">`}
        ${all.length > 1 ? `<label class="field"><span>Semester</span><select name="semester">${all.map((s) =>
          `<option value="${s.id}" ${s.id === targetId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="field"><span class="lbl">Wave</span>
        <div class="seg">${stageOpts.map((st) => `<button type="button" data-stage="${st}" class="${c.stage === st ? 'on' : ''}">${STAGE_LABEL[st]}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="lbl">Tags</span>
        <div class="tag-input" id="ed-tags"></div>
        <div class="tag-suggestions" id="ed-tag-sugg"></div>
      </div>
      <div class="field"><span class="lbl">Color</span>
        <div class="hues">${HUES.map((h) => `<button type="button" class="hue ${h === c.hue ? 'on' : ''}" style="--h:${h}" data-hue="${h}" aria-label="Color ${h}"></button>`).join('')}</div>
      </div>
      <div class="field">
        <div class="lbl-row"><span class="lbl">Weekly sessions</span>
          <span class="hint">Several tutorial groups? Add each and tick <b>Option</b>, then pick one on the timetable.</span></div>
        <div class="sessions" id="ed-sessions"></div>
        <button type="button" class="btn btn-ghost btn-sm sess-add" data-ed="add-session">${icon('plus')}Add session</button>
      </div>
      <label class="field"><span>Notes</span>
        <textarea name="notes" rows="3" placeholder="Exam format, prerequisites, why it sounds interesting…">${esc(c.notes)}</textarea></label>
    </div>
    <footer class="dlg-foot">
      ${draftIsNew ? '' : `
        <button type="button" class="btn btn-ghost btn-danger btn-sm" data-ed="delete">${icon('trash')}<span class="label">Delete</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="duplicate">${icon('copy')}<span class="label">Duplicate</span></button>`}
      <span class="spacer"></span>
      ${draftIsNew ? `<button type="button" class="btn btn-ghost" data-ed="save-another" title="Shift+Enter">Save &amp; add another</button>` : ''}
      <button type="submit" class="btn btn-primary">${draftIsNew ? 'Add course' : 'Save'}</button>
    </footer>
  </form>`;
}

function renderSessions(): void {
  const el = $('#ed-sessions', dlg());
  if (!draft!.sessions.length) {
    el.innerHTML = `<div class="sess-empty">No times yet. That’s fine for now, it just won’t appear on the timetable.</div>`;
    return;
  }
  el.innerHTML = draft!.sessions.map((s) => `<div class="sess" data-sid="${s.id}">
    <select name="day" aria-label="Day">${DAYS.map((d, i) => `<option value="${i}" ${i === s.day ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <input name="start" value="${esc(s.start)}" class="time-in" inputmode="numeric" maxlength="5" placeholder="HH:MM" aria-label="Start" autocomplete="off" data-prev="${esc(s.start)}">
    <span class="dash">–</span>
    <input name="end" value="${esc(s.end)}" class="time-in" inputmode="numeric" maxlength="5" placeholder="HH:MM" aria-label="End" autocomplete="off">
    <input name="kind" value="${esc(s.kind)}" list="kind-suggest" placeholder="Type" aria-label="Type" autocomplete="off">
    <input name="location" value="${esc(s.location)}" placeholder="Room" aria-label="Room" autocomplete="off">
    <label class="opt-toggle" title="One of several alternative slots (e.g. tutorial groups). Pick one later on the timetable."><input type="checkbox" name="alt" ${s.alt ? 'checked' : ''}><span>Option</span></label>
    <button type="button" class="icon-btn sm" data-ed="rm-session" title="Remove">${icon('x')}</button>
  </div>`).join('');
}

/** Tags used anywhere, most used first. */
function allTags(): string[] {
  const m = new Map<string, number>();
  for (const s of state.data.semesters) for (const c of s.courses) for (const t of c.tags) m.set(t, (m.get(t) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

function renderTagInput(): void {
  const d = dlg();
  const el = $('#ed-tags', d);
  const prevVal = el.querySelector('input')?.value || '';
  el.innerHTML = draft!.tags.map((t, i) =>
    `<span class="tchip">${esc(t)}<button type="button" data-ed="rm-tag" data-i="${i}" aria-label="Remove ${esc(t)}">${icon('x')}</button></span>`).join('') +
    `<input placeholder="${draft!.tags.length ? '' : 'Add tags, press Enter…'}" list="tag-suggest" autocomplete="off" aria-label="Add tag">`;
  $<HTMLInputElement>('input', el).value = prevVal;
  const others = allTags().filter((t) => !draft!.tags.includes(t));
  $('#tag-suggest').innerHTML = others.map((t) => `<option value="${esc(t)}">`).join('');
  $('#ed-tag-sugg', d).innerHTML = others.slice(0, 10).map((t) => `<button type="button" data-ed="add-tag" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}

function addTag(raw: string): boolean {
  const parts = String(raw).split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
  let added = false;
  for (const t of parts) if (!draft!.tags.includes(t)) { draft!.tags.push(t); added = true; }
  return added;
}

function syncDraft(): void {
  const d = dlg();
  const f = d.querySelector('form');
  if (!f || !draft) return;
  const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
  draft.name = val('name').trim();
  draft.code = val('code').trim();
  draft.credits = val('credits') === '' ? null : Math.max(0, +val('credits'));
  draft.instructor = val('instructor').trim();
  draft.area = val('area');
  draft.notes = val('notes');
  if (f.elements.namedItem('semester')) targetId = val('semester');
  const pending = d.querySelector<HTMLInputElement>('#ed-tags input');
  if (pending && pending.value.trim()) { addTag(pending.value); pending.value = ''; }
  for (const row of $$('.sess', d)) {
    const s = draft.sessions.find((x) => x.id === row.dataset.sid);
    if (!s) continue;
    const input = (n: string) => $<HTMLInputElement>(`[name=${n}]`, row);
    s.day = +input('day').value;
    const start = input('start').value, end = input('end').value;
    s.start = parseTime(start) || start.trim();
    s.end = parseTime(end) || end.trim();
    s.kind = input('kind').value.trim();
    s.location = input('location').value.trim();
    const alt = input('alt').checked;
    if (!alt) s.chosen = false;
    s.alt = alt;
  }
}

function saveEditor(another = false): void {
  syncDraft();
  const d = dlg();
  const nameEl = $<HTMLInputElement>('input[name=name]', d);
  let ok = true;
  if (!draft!.name) { nameEl.classList.add('invalid'); nameEl.focus(); ok = false; }
  for (const row of $$('.sess', d)) {
    const s = draft!.sessions.find((x) => x.id === row.dataset.sid);
    let bad = false;
    for (const k of ['start', 'end'] as const) {
      const unparsable = !!(s && s[k] && !parseTime(s[k]));
      $(`[name=${k}]`, row).classList.toggle('invalid', unparsable);
      bad ||= unparsable;
    }
    const backwards = !bad && s && s.start && s.end && toMin(s.end) <= toMin(s.start);
    if (backwards) $('[name=end]', row).classList.add('invalid');
    if (bad || backwards) ok = false;
  }
  if (!ok) return;

  const c = normalizeCourse(clone(draft))!;
  c.sessions = c.sessions.filter((s) => s.start && s.end);
  const isNew = draftIsNew;
  const target = state.data.semesters.find((s) => s.id === targetId) ?? sem();
  const moved = target.id !== homeId;
  commit(() => {
    const home = state.data.semesters.find((s) => s.id === homeId);
    if (home && moved) home.courses = home.courses.filter((x) => x.id !== c.id);
    const i = target.courses.findIndex((x) => x.id === c.id);
    if (i >= 0) target.courses[i] = c; else target.courses.push(c);
  });
  if (moved) {
    toast(`${isNew ? 'Added' : 'Moved'} ${courseLabel(c)} to ${target.name}`, { action: 'Open', onAction: () => setUi({ mode: 'semester', semesterId: target.id }) });
  } else {
    toast(isNew ? `Added ${courseLabel(c)}` : `Saved ${courseLabel(c)}`, isNew ? undoAction : undefined);
  }

  if (another) openEditor(null, { stage: c.stage < 0 ? 0 : c.stage, tags: [...c.tags] });
  else d.close();
}

export function initEditor(): void {
  const d = dlg();
  d.addEventListener('submit', (e) => { e.preventDefault(); saveEditor(false); });

  d.addEventListener('click', (e) => {
    if (e.target === d) { d.close(); return; }
    if (!draft) return;
    const hueBtn = closest(e.target, '[data-hue]');
    if (hueBtn) {
      draft.hue = +hueBtn.dataset.hue!;
      $$('.hue', d).forEach((b) => b.classList.toggle('on', b === hueBtn));
      $('.ed-swatch', d).style.setProperty('--h', String(draft.hue));
      return;
    }
    const stageBtn = closest(e.target, '[data-stage]');
    if (stageBtn) {
      draft.stage = +stageBtn.dataset.stage! as Stage;
      $$('[data-stage]', d).forEach((b) => b.classList.toggle('on', b === stageBtn));
      return;
    }
    if ((e.target as HTMLElement).id === 'ed-tags') { $('#ed-tags input', d).focus(); return; }

    const btn = closest(e.target, '[data-ed]');
    if (!btn) return;
    switch (btn.dataset.ed) {
      case 'close': d.close(); break;
      case 'fav':
        draft.favorite = !draft.favorite;
        btn.classList.toggle('on', draft.favorite);
        break;
      case 'add-session': {
        syncDraft();
        const last = draft.sessions[draft.sessions.length - 1];
        const s = last
          ? { ...last, id: uid(), day: Math.min(4, last.day + (last.alt ? 1 : 2)), chosen: false }
          : { id: uid(), day: 0, start: '10:00', end: '12:00', kind: 'Lecture', location: '', alt: false, chosen: false };
        if (last && last.day >= 4) s.day = last.day;
        draft.sessions.push(s);
        renderSessions();
        $(`.sess[data-sid="${s.id}"] [name=day]`, d).focus();
        break;
      }
      case 'rm-session': {
        syncDraft();
        const sid = btn.closest<HTMLElement>('.sess')!.dataset.sid;
        draft.sessions = draft.sessions.filter((s) => s.id !== sid);
        renderSessions();
        break;
      }
      case 'rm-tag':
        draft.tags.splice(+btn.dataset.i!, 1);
        renderTagInput();
        $('#ed-tags input', d).focus();
        break;
      case 'add-tag':
        addTag(btn.dataset.t!);
        renderTagInput();
        break;
      case 'save-another': saveEditor(true); break;
      case 'duplicate': {
        syncDraft();
        const src = draft;
        const copy = normalizeCourse({ ...clone(src), id: uid(), name: `${src.name} (copy)`, createdAt: Date.now() })!;
        copy.sessions.forEach((s) => { s.id = uid(); });
        const home = homeId;
        d.close();
        commit(() => { (state.data.semesters.find((s) => s.id === home) ?? sem()).courses.push(copy); });
        toast(`Duplicated ${courseLabel(src)}`, undoAction);
        openEditor(copy.id);
        break;
      }
      case 'delete': {
        const found = findCourse(draft.id);
        d.close();
        if (found) cardAction('delete', found.course);
        break;
      }
    }
  });

  d.addEventListener('keydown', (e) => {
    const tagInput = closest<HTMLInputElement>(e.target, '#ed-tags input');
    if (tagInput && draft) {
      if ((e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && tagInput.value.trim())) && tagInput.value.trim()) {
        e.preventDefault();
        addTag(tagInput.value);
        tagInput.value = '';
        renderTagInput();
        $('#ed-tags input', d).focus();
        return;
      }
      if (e.key === 'Backspace' && !tagInput.value && draft.tags.length) {
        draft.tags.pop();
        renderTagInput();
        $('#ed-tags input', d).focus();
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); return; }
    }
    if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey) && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveEditor(draftIsNew && e.shiftKey);
    }
  });

  d.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('invalid')) t.classList.remove('invalid');
  });

  // Moving the start time shifts the end time by the same amount, keeping the duration.
  d.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains('time-in')) return;
    const parsed = parseTime(t.value);
    if (parsed) t.value = parsed;
    else if (t.value.trim()) t.classList.add('invalid');
    if (t.name !== 'start') return;
    const row = t.closest('.sess')!;
    const endEl = $<HTMLInputElement>('[name=end]', row);
    const prev = t.dataset.prev;
    const next = t.value;
    if (validTime(next)) {
      if (validTime(prev) && validTime(endEl.value) && toMin(endEl.value) > toMin(prev)) {
        endEl.value = fromMin(Math.min(23 * 60 + 55, toMin(next) + toMin(endEl.value) - toMin(prev)));
      } else if (!validTime(endEl.value) || toMin(endEl.value) <= toMin(next)) {
        endEl.value = fromMin(Math.min(23 * 60 + 55, toMin(next) + 90));
      }
      t.dataset.prev = next;
      endEl.classList.remove('invalid');
    }
  });

  // ↑/↓ nudge a time field by 5 min (Shift: 1 h), like the native time picker did.
  d.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList?.contains('time-in') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const cur = parseTime(t.value);
    const step = (e.shiftKey ? 60 : 5) * (e.key === 'ArrowUp' ? 1 : -1);
    const base = cur ? toMin(cur) : 10 * 60 - step;
    t.value = fromMin(Math.max(0, Math.min(23 * 60 + 55, base + step)));
    t.classList.remove('invalid');
    t.dispatchEvent(new Event('change', { bubbles: true }));
  });

  d.addEventListener('focusout', (e) => {
    const tagInput = closest<HTMLInputElement>(e.target, '#ed-tags input');
    const next = (e as FocusEvent).relatedTarget;
    if (tagInput && tagInput.value.trim() && !(next instanceof Element && d.contains(next.closest('[data-ed="rm-tag"]')))) {
      if (addTag(tagInput.value)) { tagInput.value = ''; renderTagInput(); }
    }
  });

  d.addEventListener('close', () => { draft = null; });
}
