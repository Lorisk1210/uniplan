import { creditsOf, finalEntries, fmtNum, plural, semesterStatus, summarizeSemester } from '@uniplan/core';
import { $, closest, coarseQuery, esc, icon } from '../dom';
import { commit, courses, inView, saveUi, sem, semesters, setUi, state, undo, undoAction, VIEWS, type Tab, type ViewKey } from '../store';
import { choose } from './choice';
import { exportBackup, exportCalendar, loadExamples, openImport } from './io';
import { openProgramDialog } from './program-dialog';
import { openSemesterDialog } from './semester-dialog';
import { toast } from './toast';

/* ───────────────────────── Theme ───────────────────────── */

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme(): void {
  const t = state.ui.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : state.ui.theme;
  document.documentElement.dataset.theme = t;
  state.platform.setDarkMode?.(t === 'dark');
}
darkQuery.addEventListener('change', applyTheme);

/* ───────────────────────── Rendering ───────────────────────── */

export function renderTopbar(): void {
  const overview = state.ui.mode === 'overview';
  const s = sem();
  $('#btn-scope').innerHTML = overview
    ? `${icon('grad')}<span class="scope-name">Study overview</span>${icon('chevDown', 'caret')}`
    : `<span class="scope-name">${esc(s.name)}</span>${icon('chevDown', 'caret')}`;
  $('#btn-scope').classList.toggle('is-overview', overview);
  renderWaves();
  ($('#btn-review') as HTMLButtonElement).disabled = state.ui.view === 'dropped';
  $('#btn-review').hidden = overview;
  $('#btn-add').hidden = overview;
  $('#btn-new-semester').hidden = !overview;
  renderTabbar();
}

function renderWaves(): void {
  const list = courses();
  const count = (key: ViewKey) => list.filter((c) => inView(c, VIEWS.find((v) => v.key === key)!)).length;
  const btn = (key: ViewKey) => {
    const v = VIEWS.find((x) => x.key === key)!;
    const on = state.ui.mode === 'semester' && state.ui.view === key;
    return `<button class="wave ${key === 'dropped' ? 'dropped' : ''} ${on ? 'on' : ''}" data-view="${key}" aria-current="${on}">
      <span>${v.label}</span><span class="n">${count(key)}</span></button>`;
  };
  $('#waves').innerHTML =
    (['ideas', 'shortlist', 'final'] as const).map((k, i) => (i ? `<span class="wave-sep">${icon('chevR')}</span>` : '') + btn(k)).join('') +
    `<span class="wave-gap"></span>` + btn('dropped');
}

function renderTabbar(): void {
  const { ui } = state;
  const tab = (key: Tab | 'overview', ic: string, label: string) => {
    const on = key === 'overview' ? ui.mode === 'overview' : ui.mode === 'semester' && ui.tab === key;
    return `<button data-tab="${key}" class="${on ? 'on' : ''}" aria-current="${on}">${icon(ic)}<span>${label}</span></button>`;
  };
  $('#tabbar').innerHTML = tab('courses', 'list', 'Courses') + tab('week', 'calendar', 'Week') + tab('credits', 'award', 'Credits') + tab('overview', 'grad', 'Study');
}

/* ───────────────────────── Semester switcher ───────────────────────── */

const scopeMenu = () => $('#scope-menu');

function renderScopeMenu(): void {
  const { ui } = state;
  const total = creditsOf(finalEntries(state.data).map((e) => e.course));
  const status = { past: 'Completed', current: 'Current', upcoming: 'Upcoming' } as const;
  scopeMenu().innerHTML = `
    <button class="menu-item scope-item ${ui.mode === 'overview' ? 'on' : ''}" data-scope="overview">${icon('grad')}<span>Study overview</span>
      <span class="end">${fmtNum(total)} / ${fmtNum(state.data.program.total)} CP</span></button>
    <div class="menu-sep"></div>
    <div class="menu-label">Semesters</div>
    ${semesters().map((s) => {
      const st = semesterStatus(s);
      const on = ui.mode === 'semester' && s.id === ui.semesterId;
      return `<button class="menu-item scope-item ${on ? 'on' : ''}" data-scope="${s.id}">${icon(on ? 'check' : 'calendar')}
        <span class="sc-name">${esc(s.name)}</span>${st === 'current' ? `<span class="badge current">${status[st]}</span>` : ''}
        <span class="end">${fmtNum(summarizeSemester(s).credits)} CP</span></button>`;
    }).join('')}
    <div class="menu-sep"></div>
    <button class="menu-item" data-scope-act="new">${icon('plus')}New semester…</button>
    ${ui.mode === 'semester' ? `<button class="menu-item" data-scope-act="edit">${icon('pencil')}Edit ${esc(sem().name)}…</button>` : ''}`;
}

export function toggleScopeMenu(open = scopeMenu().hidden): void {
  if (open) { toggleMenu(false); renderScopeMenu(); }
  scopeMenu().hidden = !open;
  $('#btn-scope').setAttribute('aria-expanded', String(open));
}

/* ───────────────────────── Main menu ───────────────────────── */

const menu = () => $('#menu');

function renderMenu(): void {
  const { ui, platform } = state;
  const themeBtn = (t: string, ic: string, l: string) => `<button data-theme-set="${t}" class="${ui.theme === t ? 'on' : ''}">${icon(ic)}${l}</button>`;
  const s = sem();
  const semester = ui.mode === 'semester';
  menu().innerHTML = `
    <div class="menu-label">Appearance</div>
    <div class="menu-theme">${themeBtn('light', 'sun', 'Light')}${themeBtn('dark', 'moon', 'Dark')}${themeBtn('system', 'monitor', 'Auto')}</div>
    <button class="menu-item" data-menu="weekend">${icon('calendar')}Always show weekend<span class="end"><span class="switch ${ui.weekend ? 'on' : ''}"></span></span></button>
    <div class="menu-sep"></div>
    <button class="menu-item" data-menu="requirements">${icon('target')}Degree requirements…</button>
    ${platform.canPrint ? `<button class="menu-item" data-menu="print">${icon('printer')}Print / save as PDF</button>` : ''}
    ${semester ? `<button class="menu-item" data-menu="ics">${icon('calendar')}Export ${esc(s.name)} to calendar (.ics)</button>` : ''}
    <button class="menu-item" data-menu="export">${icon(platform.kind === 'mobile' ? 'share' : 'download')}Export backup (.json)</button>
    <button class="menu-item" data-menu="import">${icon('upload')}Import backup…</button>
    ${platform.revealData ? `<button class="menu-item" data-menu="reveal">${icon('folder')}Show data folder</button>` : ''}
    ${semester ? `<div class="menu-sep"></div>
    <button class="menu-item" data-menu="example">${icon('sparkle')}Add example courses</button>
    <button class="menu-item" data-menu="undo">${icon('undo')}Undo${coarseQuery.matches ? '' : `<span class="end"><kbd>${platform.os === 'mac' ? '⌘' : 'Ctrl'}</kbd><kbd>Z</kbd></span>`}</button>
    <button class="menu-item danger" data-menu="clear">${icon('trashAll')}Delete all courses in ${esc(s.name)}</button>` : ''}
    ${coarseQuery.matches ? '' : `<div class="menu-sep"></div>
    <div class="menu-foot">
      <span><kbd>N</kbd> new</span><span><kbd>/</kbd> search</span><span><kbd>R</kbd> review</span><span><kbd>1</kbd>–<kbd>4</kbd> waves</span>
      <span><kbd>S</kbd> semesters</span><span><kbd>[</kbd><kbd>]</kbd> prev / next</span><span><kbd>O</kbd> overview</span>
    </div>`}
    ${platform.dataLocation ? `<div class="menu-path" title="${esc(platform.dataLocation)}">Saved to ${esc(platform.dataLocation)}</div>` : ''}`;
}

export function toggleMenu(open = menu().hidden): void {
  if (open) { toggleScopeMenu(false); renderMenu(); }
  menu().hidden = !open;
  $('#btn-menu').setAttribute('aria-expanded', String(open));
}

export async function clearSemester(): Promise<void> {
  const s = sem();
  if (!s.courses.length) { toast('Nothing to delete'); return; }
  const v = await choose({
    title: `Delete all courses in ${s.name}?`,
    body: `This removes ${plural(s.courses.length, 'course')}. You can still undo right after, but consider exporting a backup first.`,
    options: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: 'Delete all', primary: true }],
  });
  if (v === 'ok') { commit(() => { s.courses = []; }); toast('All courses deleted', undoAction()); }
}

/** Steps through semesters in order. */
export function stepSemester(dir: 1 | -1): void {
  const list = semesters();
  const i = list.findIndex((s) => s.id === state.ui.semesterId);
  const next = list[i + dir];
  if (next) setUi({ mode: 'semester', semesterId: next.id });
  else toast(dir > 0 ? 'That’s the last semester' : 'That’s the first semester');
}

/* ───────────────────────── Events ───────────────────────── */

export function initTopbar(): void {
  $('#btn-scope').addEventListener('click', (e) => { e.stopPropagation(); toggleScopeMenu(); });
  $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => {
    if (!closest(e.target, '.menu-wrap')) { toggleMenu(false); toggleScopeMenu(false); }
  });

  scopeMenu().addEventListener('click', (e) => {
    const item = closest(e.target, '[data-scope]');
    const act = closest(e.target, '[data-scope-act]');
    toggleScopeMenu(false);
    if (item) setUi(item.dataset.scope === 'overview' ? { mode: 'overview' } : { mode: 'semester', semesterId: item.dataset.scope! });
    else if (act?.dataset.scopeAct === 'new') openSemesterDialog();
    else if (act?.dataset.scopeAct === 'edit') openSemesterDialog(sem().id);
  });

  menu().addEventListener('click', async (e) => {
    const t = closest(e.target, '[data-theme-set]');
    if (t) { state.ui.theme = t.dataset.themeSet as typeof state.ui.theme; saveUi(); applyTheme(); renderMenu(); return; }
    const item = closest(e.target, '[data-menu]');
    if (!item) return;
    const act = item.dataset.menu;
    if (act === 'weekend') { setUi({ weekend: !state.ui.weekend }); renderMenu(); return; }
    toggleMenu(false);
    if (act === 'print') window.print();
    else if (act === 'export') exportBackup();
    else if (act === 'ics') exportCalendar();
    else if (act === 'import') openImport();
    else if (act === 'reveal') state.platform.revealData?.();
    else if (act === 'requirements') openProgramDialog();
    else if (act === 'example') loadExamples();
    else if (act === 'undo') undo();
    else if (act === 'clear') clearSemester();
  });

  $('#waves').addEventListener('click', (e) => {
    const b = closest(e.target, '[data-view]');
    if (b) setUi({ mode: 'semester', view: b.dataset.view as ViewKey });
  });

  $('#tabbar').addEventListener('click', (e) => {
    const b = closest(e.target, '[data-tab]');
    if (!b) return;
    const tab = b.dataset.tab!;
    setUi(tab === 'overview' ? { mode: 'overview' } : { mode: 'semester', tab: tab as Tab });
    $('#main').scrollTo({ top: 0 });
  });

  $('#btn-new-semester').addEventListener('click', () => openSemesterDialog());
}
