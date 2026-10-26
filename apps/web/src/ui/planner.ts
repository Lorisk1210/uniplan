import {
  computeConflicts, courseLabel, creditsOf, DAYS, DAYS_LONG, fmtNum, HUES, isActive, isGhost, layoutDay, normalizeCourse,
  overlapsWith, plural, STAGE_LABEL, toMin, uid, validSession, weekday, weeklyMinutes,
  type Conflicts, type Course, type Session,
} from '@uniplan/core';
import { $, $$, closest, esc, icon, isNarrow } from '../dom';
import { areas, commit, courseById, courses, currentView, inView, setUi, state, undoAction, type View } from '../store';
import { openEditor } from './editor';
import { toast } from './toast';

/* ───────────────────────── Derivations ───────────────────────── */

export interface Derived {
  view: View;
  /** Everything in the current wave. */
  pool: Course[];
  /** …that matches search and filters. */
  filtered: Course[];
  /** …shown in the sidebar. */
  list: Course[];
  /** …shown on the timetable. */
  table: Course[];
  conf: Conflicts;
}

function matchesFilters(c: Course): boolean {
  const { ui } = state;
  const q = ui.search.trim().toLowerCase();
  if (q) {
    const hay = [c.name, c.code, c.instructor, c.notes, areas().get(c.area)?.label, ...c.tags, ...c.sessions.flatMap((s) => [s.location, s.kind])]
      .join(' ').toLowerCase();
    if (!q.split(/\s+/).every((t) => hay.includes(t.replace(/^#/, '')))) return false;
  }
  if (ui.favOnly && !c.favorite) return false;
  if (ui.tags.length && !ui.tags.some((t) => c.tags.includes(t))) return false;
  return true;
}

export function derive(): Derived {
  const view = currentView();
  const pool = courses().filter((c) => inView(c, view));
  const filtered = pool.filter(matchesFilters);
  const visible = filtered.filter((c) => !c.hidden);
  const conf = computeConflicts(visible);
  const list = state.ui.conflictsOnly ? filtered.filter((c) => conf.byCourse.has(c.id)) : filtered;
  const table = state.ui.conflictsOnly ? visible.filter((c) => conf.byCourse.has(c.id)) : visible;
  return { view, pool, filtered, list, table, conf };
}

/* ───────────────────────── Rendering ───────────────────────── */

export function renderPlanner(d: Derived): void {
  renderFilters(d);
  renderList(d);
  renderHead(d);
  renderTimetable(d);
  renderUnscheduled(d);
}

function renderFilters(d: Derived): void {
  const { ui } = state;
  const tagCounts = new Map<string, number>();
  for (const c of d.pool) for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  for (const t of ui.tags) if (!tagCounts.has(t)) tagCounts.set(t, 0);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const favN = d.pool.filter((c) => c.favorite).length;
  const confN = d.conf.byCourse.size;
  const any = ui.favOnly || ui.conflictsOnly || ui.tags.length || ui.search.trim();

  let html = `<button class="chip fav ${ui.favOnly ? 'on' : ''}" data-filter="fav">${icon('star', ui.favOnly || favN ? 'filled' : '')}Favorites<span class="n">${favN}</span></button>`;
  if (confN || ui.conflictsOnly) {
    html += `<button class="chip conf ${ui.conflictsOnly ? 'on' : ''}" data-filter="conf">${icon('alert')}Overlaps<span class="n">${confN}</span></button>`;
  }
  html += tags.map(([t, n]) =>
    `<button class="chip ${ui.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}<span class="n">${n}</span></button>`).join('');
  if (any) html += `<button class="chip-clear" data-filter="clear">Clear</button>`;
  $('#filters').innerHTML = html;
}

export const sortCourses = (list: Course[]): Course[] =>
  [...list].sort((a, b) => (+b.favorite - +a.favorite) || (b.stage - a.stage) || a.name.localeCompare(b.name));

function renderList(d: Derived): void {
  const el = $('#course-list');
  const head = $('#list-head');
  const credits = creditsOf(d.list);
  head.innerHTML = d.list.length
    ? `<span><b>${plural(d.list.length, 'course')}</b>${d.list.length !== d.pool.length ? ` of ${d.pool.length}` : ''}</span><span>${credits ? `${fmtNum(credits)} credits` : ''}</span>`
    : '';

  if (!courses().length) {
    el.innerHTML = `<div class="list-empty">
      <h3>Start with a brain dump</h3>
      <p>Add every course that sounds remotely interesting. You’ll filter it down in waves later.</p>
      <div class="actions">
        <button class="btn btn-primary" data-act="new">${icon('plus')}Add your first course</button>
      </div></div>`;
    return;
  }
  if (!d.pool.length) {
    const msg = {
      shortlist: 'Move courses here from <b>Ideas</b> with the › arrow, or use <b>Review wave</b>.',
      final: 'Move courses here from your <b>Shortlist</b>.',
      dropped: 'Nothing dropped yet.',
      ideas: 'Everything you add lands here first.',
    }[d.view.key];
    el.innerHTML = `<div class="list-empty"><h3>Empty wave</h3><p>${msg}</p></div>`;
    return;
  }
  if (!d.list.length) {
    el.innerHTML = `<div class="list-empty"><h3>No matches</h3><p>Nothing in this wave matches your filters.</p>
      <div class="actions"><button class="btn btn-sm" data-filter="clear">Clear filters</button></div></div>`;
    return;
  }
  el.innerHTML = sortCourses(d.list).map((c) => cardHTML(c, d)).join('');
}

function cardHTML(c: Course, d: Derived): string {
  const valid = c.sessions.filter(validSession);
  const active = valid.filter(isActive);
  const days = [...new Set(active.map((s) => s.day))].sort().map((x) => DAYS[x]);
  const hrs = weeklyMinutes(c) / 60;
  const toPick = new Set(valid.filter((s) => isGhost(c, s)).map((s) => s.kind)).size;
  const meta: string[] = [];
  if (days.length) meta.push(days.join(', '));
  if (hrs) meta.push(`${fmtNum(hrs)} h/wk`);
  if (toPick) meta.push(`${toPick === 1 ? 'pick a slot' : `pick ${toPick} slots`}`);
  if (c.credits != null) meta.push(`${fmtNum(c.credits)} cr`);
  const area = areas().get(c.area);
  if (area) meta.push(area.short);
  if (!valid.length) meta.push('No times yet');

  const clashes = [...(d.conf.byCourse.get(c.id) || [])].map(courseById).filter((x): x is Course => !!x).map(courseLabel);
  const dropped = c.stage === -1;

  const stageCtl = dropped
    ? `<button class="btn btn-sm" data-act="restore">${icon('restore')}Restore to ${STAGE_LABEL[c.prevStage]}</button>`
    : `<div class="stage-pill s${c.stage}">
        <button class="sp-btn" data-act="demote" ${c.stage <= 0 ? 'disabled' : ''} title="${c.stage > 0 ? `Back to ${STAGE_LABEL[(c.stage - 1) as 0 | 1]}` : ''}">${icon('chevL')}</button>
        <span>${STAGE_LABEL[c.stage]}</span>
        <button class="sp-btn" data-act="advance" ${c.stage >= 2 ? 'disabled' : ''} title="${c.stage < 2 ? `Move to ${STAGE_LABEL[(c.stage + 1) as 1 | 2]}` : ''}">${icon('chevR')}</button>
      </div>`;

  const tools = dropped
    ? `<button class="icon-btn sm" data-act="delete" title="Delete permanently">${icon('trash')}</button>`
    : `<button class="icon-btn sm" data-act="hide" title="${c.hidden ? 'Show on timetable' : 'Hide from timetable'}">${icon(c.hidden ? 'eyeOff' : 'eye')}</button>
       <button class="icon-btn sm" data-act="drop" title="Drop course">${icon('x')}</button>`;

  return `<article class="card ${c.hidden ? 'is-hidden' : ''}" data-id="${c.id}" style="--h:${c.hue}" tabindex="0">
    <span class="card-dot"></span>
    <div class="card-main">
      ${c.code ? `<div class="card-code">${esc(c.code)}</div>` : ''}
      <h3 class="card-title">${esc(c.name)}</h3>
      <p class="card-meta">${esc(meta.join(' · '))}</p>
      ${c.tags.length ? `<div class="card-tags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${clashes.length ? `<p class="card-clash">${icon('alert')}<span>Overlaps ${esc(clashes.join(', '))}</span></p>` : ''}
      <div class="card-foot">${stageCtl}<div class="card-tools">${tools}</div></div>
    </div>
    <button class="star ${c.favorite ? 'on' : ''}" data-act="fav" title="${c.favorite ? 'Unfavorite' : 'Favorite'}">${icon('star')}</button>
  </article>`;
}

function renderHead(d: Derived): void {
  $('#view-title').textContent = d.view.title;
  $('#view-sub').textContent = d.view.sub;
  const credits = creditsOf(d.table);
  const mins = d.table.reduce((s, c) => s + weeklyMinutes(c), 0);
  const stats: [string | number, string, boolean?][] = [
    [d.table.length, d.table.length === 1 ? 'course' : 'courses'],
    [fmtNum(credits), 'credits'],
    [fmtNum(mins / 60), 'hours / week'],
    [d.conf.pairs, d.conf.pairs === 1 ? 'overlap' : 'overlaps', d.conf.pairs > 0],
  ];
  $('#stats').innerHTML = courses().length
    ? stats.map(([v, l, bad]) => `<div class="stat ${bad ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('')
    : '';
}

interface Ev {
  c: Course;
  s: Session;
  ghost: boolean;
  day: number;
  a: number;
  b: number;
}

function timetableEvents(d: Derived): Ev[] {
  const events: Ev[] = [];
  for (const c of d.table) for (const s of c.sessions) {
    if (!validSession(s)) continue;
    const ghost = isGhost(c, s);
    if (!ghost && !isActive(s)) continue;
    events.push({ c, s, ghost, day: s.day, a: toMin(s.start), b: toMin(s.end) });
  }
  return events;
}

function weekDays(events: Ev[]): number[] {
  const days = [0, 1, 2, 3, 4];
  if (state.ui.weekend || events.some((e) => e.day === 5)) days.push(5);
  if (state.ui.weekend || events.some((e) => e.day === 6)) days.push(6);
  if (days.includes(6) && !days.includes(5)) days.splice(5, 0, 5);
  return days;
}

/** On a phone the timetable shows one day at a time; this strip picks it. */
function renderDayStrip(d: Derived, events: Ev[], days: number[], day: number): void {
  const el = $('#day-strip');
  if (!isNarrow()) { el.innerHTML = ''; return; }
  const today = weekday(new Date());
  el.innerHTML = days.map((x) => {
    const n = events.filter((e) => e.day === x && !e.ghost).length;
    const clash = events.some((e) => e.day === x && d.conf.bySession.has(e.s.id));
    return `<button class="ds-day ${x === day ? 'on' : ''} ${x === today ? 'today' : ''}" data-day="${x}" aria-pressed="${x === day}">
      <span>${DAYS[x]}</span><i class="${clash ? 'clash' : ''}">${n || ''}</i></button>`;
  }).join('');
}

export function renderTimetable(d: Derived): void {
  const el = $('#timetable');
  const events = timetableEvents(d);
  const week = weekDays(events);
  const day = week.includes(state.ui.day) ? state.ui.day : Math.min(state.ui.day, week.at(-1)!);
  renderDayStrip(d, events, week, day);
  const days = isNarrow() ? [day] : week;

  let startH = 8, endH = 18;
  if (events.length) {
    startH = Math.min(startH, Math.floor(Math.min(...events.map((e) => e.a)) / 60));
    endH = Math.max(endH, Math.ceil(Math.max(...events.map((e) => e.b)) / 60));
  }
  const hours = endH - startH;
  const now = new Date();
  const todayIdx = weekday(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const hourLabels = Array.from({ length: hours - 1 }, (_, i) =>
    `<span class="tt-hour" style="top:calc(var(--hour) * ${i + 1})">${String(startH + i + 1).padStart(2, '0')}:00</span>`).join('');

  const cols = days.map((x) => {
    const evs = layoutDay(events.filter((e) => e.day === x));
    const isToday = x === todayIdx;
    const nowLine = isToday && nowMin > startH * 60 && nowMin < endH * 60
      ? `<div class="tt-now" style="top:calc(var(--hour) * ${(nowMin - startH * 60) / 60})"></div>` : '';
    return `<div class="tt-col ${isToday ? 'today' : ''}" data-day="${x}">${evs.map((e) => eventHTML(e, d, startH)).join('')}${nowLine}</div>`;
  }).join('');

  let empty = '';
  if (!courses().length) {
    empty = `<div class="tt-empty"><div>
      <h2>Your week, at a glance</h2>
      <p>Add the courses you’re curious about with their times. Overlaps show up right here.</p>
      <div class="actions">
        <button class="btn btn-primary" data-act="new">${icon('plus')}Add course</button>
      </div></div></div>`;
  } else if (!events.length) {
    const why = d.pool.length ? (d.table.length ? 'None of these courses have times yet.' : 'Nothing matches your current filters.') : `No courses in ${d.view.label} yet.`;
    empty = `<div class="tt-empty"><div><h2>Nothing scheduled</h2><p style="margin:0">${why}</p></div></div>`;
  }

  el.innerHTML = `<div class="tt" style="--cols:${days.length};--hours:${hours}">
    <div class="tt-head"><div></div>${days.map((x) => `<div class="tt-day ${x === todayIdx ? 'today' : ''}">${DAYS_LONG[x]}</div>`).join('')}</div>
    <div class="tt-body"><div class="tt-gutter">${hourLabels}</div>${cols}</div>
  </div>${empty}`;
}

function eventHTML(e: Ev & { lane: number; lanes: number }, d: Derived, startH: number): string {
  const { c, s } = e;
  const len = (e.b - e.a) / 60;
  const clashIds = e.ghost ? null : d.conf.bySession.get(s.id);
  const ghostClash = e.ghost ? overlapsWith(c, s, d.conf.items) : [];
  const cls = ['event'];
  if (e.ghost) cls.push('ghost');
  if (clashIds) cls.push('conflict');
  if (len <= 1.05) cls.push('short');
  if (len < 0.75) cls.push('tiny');

  const clashNames = clashIds ? [...clashIds].map(courseById).filter((x): x is Course => !!x).map(courseLabel) : ghostClash.map(courseLabel);
  const tip = [
    c.name + (c.code ? ` (${c.code})` : ''),
    `${DAYS_LONG[s.day]} ${s.start}–${s.end}`,
    [s.kind, s.location].filter(Boolean).join(' · '),
    e.ghost ? `Option slot — click to pick this one${ghostClash.length ? ` (clashes with ${clashNames.join(', ')})` : ''}` : '',
    clashIds ? `Overlaps ${clashNames.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const meta = [`${s.start}–${s.end}`, s.location].filter(Boolean).join(' · ');
  const kind = [s.kind, c.code && c.code !== c.name ? c.code : ''].filter(Boolean).join(' · ');
  const flag = e.ghost
    ? `<span class="ev-flag ${ghostClash.length ? 'clash' : 'fits'}">${ghostClash.length ? 'Option · clashes' : 'Option · fits'}</span>`
    : '';
  const unpick = s.alt && s.chosen
    ? `<span class="ev-unpick" role="button" data-act="unpick" title="Show all options again">${icon('swap')}</span>` : '';

  return `<button class="${cls.join(' ')}" data-course="${c.id}" data-session="${s.id}" ${e.ghost ? 'data-ghost="1"' : ''}
    style="--h:${c.hue};--top:${(e.a - startH * 60) / 60};--len:${len};--l:${e.lane / e.lanes};--w:${1 / e.lanes}"
    title="${esc(tip)}">
    <span class="ev-title">${esc(c.name)}</span>
    <span class="ev-meta">${esc(meta)}</span>
    ${kind ? `<span class="ev-kind">${esc(kind)}</span>` : ''}
    ${flag}${unpick}
  </button>`;
}

function renderUnscheduled(d: Derived): void {
  const none = d.table.filter((c) => !c.sessions.some(validSession));
  $('#unscheduled').innerHTML = none.length
    ? `<span>Not on the timetable yet:</span>${none.map((c) =>
        `<button data-edit="${c.id}" style="--h:${c.hue}"><span class="card-dot"></span>${esc(courseLabel(c))}</button>`).join('')}`
    : '';
}

/* ───────────────────────── Hover linking ───────────────────────── */

let focusId: string | null = null;
function setFocus(id: string | null): void {
  if (id === focusId) return;
  focusId = id;
  const tt = document.querySelector('.tt');
  if (tt) tt.classList.toggle('has-focus', !!id);
  $$('.event').forEach((e) => e.classList.toggle('hl', e.dataset.course === id));
  $$('.card').forEach((e) => e.classList.toggle('hl', e.dataset.id === id));
}

/* ───────────────────────── Course actions ───────────────────────── */

export function cardAction(act: string, c: Course): void {
  const name = courseLabel(c);
  switch (act) {
    case 'fav':
      commit(() => { c.favorite = !c.favorite; });
      break;
    case 'hide':
      commit(() => { c.hidden = !c.hidden; });
      toast(c.hidden ? `${name} hidden from timetable` : `${name} back on timetable`);
      break;
    case 'advance':
      commit(() => { c.stage = Math.min(2, c.stage + 1) as 0 | 1 | 2; });
      toast(`${name} → ${STAGE_LABEL[c.stage]}`, undoAction());
      break;
    case 'demote':
      commit(() => { c.stage = Math.max(0, c.stage - 1) as 0 | 1 | 2; });
      toast(`${name} → back to ${STAGE_LABEL[c.stage]}`, undoAction());
      break;
    case 'drop':
      commit(() => { if (c.stage >= 0) c.prevStage = c.stage as 0 | 1 | 2; c.stage = -1; });
      toast(`Dropped ${name}`, undoAction());
      break;
    case 'restore':
      commit(() => { c.stage = c.prevStage; });
      toast(`${name} restored to ${STAGE_LABEL[c.stage]}`, undoAction());
      break;
    case 'delete':
      commit(() => { for (const s of state.data.semesters) s.courses = s.courses.filter((x) => x.id !== c.id); });
      toast(`Deleted ${name}`, undoAction());
      break;
  }
}

function pickSlot(c: Course, sid: string): void {
  const target = c.sessions.find((s) => s.id === sid);
  if (!target) return;
  commit(() => { for (const s of c.sessions) if (s.alt && s.kind === target.kind) s.chosen = s.id === sid; });
  toast(`Picked ${DAYS[target.day]} ${target.start} for ${courseLabel(c)}${target.kind ? ` ${target.kind.toLowerCase()}` : ''}`, undoAction());
}

function unpickSlot(c: Course, sid: string): void {
  const target = c.sessions.find((s) => s.id === sid);
  if (!target) return;
  commit(() => { for (const s of c.sessions) if (s.alt && s.kind === target.kind) s.chosen = false; });
}

function nextHue(): number {
  const used = new Map(HUES.map((h) => [h, 0]));
  for (const c of courses()) if (used.has(c.hue)) used.set(c.hue, used.get(c.hue)! + 1);
  const min = Math.min(...used.values());
  return HUES.find((h) => used.get(h) === min)!;
}

export function newCourse(preset: Partial<Course> = {}): Course {
  const v = currentView();
  return normalizeCourse({
    name: '',
    stage: v.stage >= 0 ? v.stage : 0,
    hue: nextHue(),
    tags: [],
    sessions: [{ day: 0, start: '10:00', end: '12:00', kind: 'Lecture' }],
    ...preset,
    id: uid(),
    createdAt: Date.now(),
  })!;
}

/* ───────────────────────── Events ───────────────────────── */

/** Filter chips live in the sidebar head and in the "no matches" message. */
export function onFilterClick(e: Event): boolean {
  const { ui } = state;
  const tagBtn = closest(e.target, '[data-tag]');
  if (tagBtn) {
    const t = tagBtn.dataset.tag!;
    setUi({ tags: ui.tags.includes(t) ? ui.tags.filter((x) => x !== t) : [...ui.tags, t] });
    return true;
  }
  const f = closest(e.target, '[data-filter]');
  if (!f) return false;
  if (f.dataset.filter === 'fav') setUi({ favOnly: !ui.favOnly });
  if (f.dataset.filter === 'conf') setUi({ conflictsOnly: !ui.conflictsOnly });
  if (f.dataset.filter === 'clear') { $<HTMLInputElement>('#search').value = ''; setUi({ favOnly: false, conflictsOnly: false, tags: [], search: '' }); }
  return true;
}

export function initPlanner(): void {
  $('#filters').addEventListener('click', onFilterClick);

  $('#course-list').addEventListener('click', (e) => {
    if (onFilterClick(e)) return;
    const card = closest(e.target, '.card');
    if (!card) return;
    const c = courseById(card.dataset.id!);
    if (!c) return;
    const act = closest(e.target, '[data-act]');
    if (act) { e.stopPropagation(); cardAction(act.dataset.act!, c); return; }
    openEditor(c.id);
  });
  $('#course-list').addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.classList.contains('card')) openEditor(t.dataset.id!);
  });

  $('#timetable').addEventListener('click', (e) => {
    const ev = closest(e.target, '.event');
    if (!ev) return;
    const c = courseById(ev.dataset.course!);
    if (!c) return;
    if (closest(e.target, '[data-act="unpick"]')) unpickSlot(c, ev.dataset.session!);
    else if (ev.dataset.ghost) pickSlot(c, ev.dataset.session!);
    else openEditor(c.id);
  });

  $('#unscheduled').addEventListener('click', (e) => {
    const b = closest(e.target, '[data-edit]');
    if (b) openEditor(b.dataset.edit!);
  });

  $('#day-strip').addEventListener('click', (e) => {
    const b = closest(e.target, '[data-day]');
    if (b) setUi({ day: +b.dataset.day! });
  });

  // Swipe sideways on the phone timetable to change the day.
  let touch: { x: number; y: number } | null = null;
  const tt = $('#timetable');
  tt.addEventListener('touchstart', (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  tt.addEventListener('touchend', (e) => {
    if (!touch || !isNarrow()) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const days = $$('#day-strip [data-day]').map((b) => +b.dataset.day!);
    const i = days.indexOf(+($('#day-strip .on')?.dataset.day ?? state.ui.day));
    const next = days[Math.max(0, Math.min(days.length - 1, i + (dx < 0 ? 1 : -1)))];
    if (next !== undefined && next !== state.ui.day) setUi({ day: next });
  });

  for (const sel of ['#course-list', '#timetable']) {
    const host = $(sel);
    host.addEventListener('mouseover', (e) => {
      const t = closest(e.target, '[data-id], [data-course]');
      setFocus(t ? t.dataset.id || t.dataset.course || null : null);
    });
    host.addEventListener('mouseleave', () => setFocus(null));
  }
}

