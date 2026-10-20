import { planEntries } from '@uniplan/core';
import { $, $$, closest, icon, narrowQuery } from './dom';
import type { MenuAction } from './platform';
import { onChange, redo, sem, setUi, state, undo, VIEWS } from './store';
import { initEditor, openEditor } from './ui/editor';
import { exportBackup, exportCalendar, importText, loadExamples, openImport } from './ui/io';
import { initOverview, renderOverview } from './ui/overview';
import { derive, initPlanner, renderPlanner, renderTimetable, type Derived } from './ui/planner';
import { initProgramDialog, openProgramDialog } from './ui/program-dialog';
import { reqsHTML } from './ui/reqs';
import { initReview, startReview } from './ui/review';
import { initSemesterDialog, openSemesterDialog } from './ui/semester-dialog';
import { applyTheme, initTopbar, renderTopbar, stepSemester, toggleMenu, toggleScopeMenu } from './ui/topbar';

/* ───────────────────────── Rendering ───────────────────────── */

function renderSemesterReqs(d: Derived): void {
  const counting = d.view.stage < 0 ? VIEWS[2] : d.view;
  const entries = planEntries(state.data, sem(), counting.stage as 0 | 1 | 2);
  if (!sem().courses.length && !entries.length) { $('#reqs').innerHTML = ''; return; }
  const tentative = entries.some((e) => !e.firm);
  const others = entries.some((e) => e.other);
  const sub = `${state.data.program.name} · counting ${counting.label}${others ? ' plus Final courses from other semesters' : ''}${tentative ? '. Faded: not in Final yet' : ''}`;
  $('#reqs').innerHTML = reqsHTML({ mode: 'semester', entries, sub, collapsible: true });
}

export function render(): void {
  const { ui } = state;
  const app = $('#app');
  app.dataset.mode = ui.mode;
  app.dataset.tab = ui.tab;
  renderTopbar();
  const overview = ui.mode === 'overview';
  $('#planner').hidden = overview;
  $('#overview').hidden = !overview;
  if (overview) {
    renderOverview();
  } else {
    const d = derive();
    renderPlanner(d);
    renderSemesterReqs(d);
  }
}

/* ───────────────────────── Commands ───────────────────────── */

const dialogOpen = () => $$<HTMLDialogElement>('dialog').some((d) => d.open);
const isTyping = (el: Element | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);

/** Undo/redo from the app menu: text fields get their own undo, the planner gets the app's. */
function editHistory(kind: 'undo' | 'redo'): void {
  if (isTyping(document.activeElement)) { document.execCommand(kind); return; }
  if (dialogOpen()) return;
  if (kind === 'undo') undo(); else redo();
}

function runMenuAction(action: MenuAction): void {
  if (action === 'undo' || action === 'redo') { editHistory(action); return; }
  if (dialogOpen()) return;
  toggleMenu(false);
  toggleScopeMenu(false);
  switch (action) {
    case 'new-course': openEditor(); break;
    case 'new-semester': openSemesterDialog(); break;
    case 'edit-semester': openSemesterDialog(sem().id); break;
    case 'overview': setUi({ mode: state.ui.mode === 'overview' ? 'semester' : 'overview' }); break;
    case 'requirements': openProgramDialog(); break;
    case 'import': openImport(); break;
    case 'export': exportBackup(); break;
    case 'export-ics': exportCalendar(); break;
    case 'print': window.print(); break;
    case 'prev-semester': stepSemester(-1); break;
    case 'next-semester': stepSemester(1); break;
  }
}

/* ───────────────────────── Wiring ───────────────────────── */

export function initApp(): void {
  const { platform } = state;
  document.documentElement.dataset.shell = platform.kind;
  document.documentElement.dataset.os = platform.os;

  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon!); });

  initTopbar();
  initPlanner();
  initOverview();
  initEditor();
  initReview();
  initSemesterDialog();
  initProgramDialog();

  $('#btn-add').addEventListener('click', () => openEditor());
  $('#btn-review').addEventListener('click', startReview);

  const search = $<HTMLInputElement>('#search');
  search.value = state.ui.search;
  search.addEventListener('input', () => setUi({ search: search.value }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; setUi({ search: '' }); search.blur(); }
  });

  // Buttons that show up in several places (empty states, requirement panels).
  document.addEventListener('click', (e) => {
    const a = closest(e.target, '[data-act="new"], [data-act="example"], [data-reqs], [data-goto], #reqs [data-edit]');
    if (!a) return;
    if (a.dataset.act === 'new') openEditor();
    else if (a.dataset.act === 'example') loadExamples();
    else if (a.dataset.reqs === 'toggle') setUi({ reqsOpen: !state.ui.reqsOpen });
    else if (a.dataset.reqs === 'edit') openProgramDialog();
    else if (a.dataset.goto === 'overview') setUi({ mode: 'overview' });
    else if (a.dataset.edit) openEditor(a.dataset.edit);
  });

  const importInput = $<HTMLInputElement>('#import-file');
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (file) file.text().then(importText);
  });

  document.addEventListener('keydown', (e) => {
    const typing = isTyping(e.target as Element);
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !platform.nativeUndo && !typing && !dialogOpen() && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key === 'Escape') { toggleMenu(false); toggleScopeMenu(false); }
    if (typing || dialogOpen() || mod || e.altKey) return;
    if (k === 'n') { e.preventDefault(); openEditor(); }
    else if (k === '/') {
      e.preventDefault();
      setUi({ mode: 'semester', tab: 'courses' });
      search.focus();
      search.select();
    } else if (k === 'r' && state.ui.mode === 'semester') { e.preventDefault(); startReview(); }
    else if (k === 's') { e.preventDefault(); toggleScopeMenu(); }
    else if (k === 'o') setUi({ mode: state.ui.mode === 'overview' ? 'semester' : 'overview' });
    else if (k === '[') stepSemester(-1);
    else if (k === ']') stepSemester(1);
    else if (['1', '2', '3', '4'].includes(k)) setUi({ mode: 'semester', view: VIEWS[+k - 1].key });
  });

  platform.onMenu?.(runMenuAction);

  // Back closes whatever is on top: a dialog, a menu, the overview. Otherwise the app goes to the background.
  platform.onBackButton?.(() => {
    const open = $$<HTMLDialogElement>('dialog').filter((d) => d.open).at(-1);
    if (open) { open.dispatchEvent(new Event('cancel')); open.close(); return true; }
    if (!$('#menu').hidden || !$('#scope-menu').hidden) { toggleMenu(false); toggleScopeMenu(false); return true; }
    if (state.ui.mode === 'overview') { setUi({ mode: 'semester' }); return true; }
    return false;
  });

  onChange(render);
  narrowQuery.addEventListener('change', render);

  // Sticky bits below the top bar (phone day strip, menus) need its real height, which wraps on small screens.
  const topbar = $('.topbar');
  new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)).observe(topbar);

  // Keep the "now" line roughly current.
  setInterval(() => {
    if (!dialogOpen() && state.ui.mode === 'semester') renderTimetable(derive());
  }, 5 * 60 * 1000);

  applyTheme();
  render();
}
