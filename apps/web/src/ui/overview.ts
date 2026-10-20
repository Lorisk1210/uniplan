import {
  creditsOf, finalEntries, fmtDate, fmtNum, plural, semesterStatus, shortSemesterName, summarizeSemester, type Semester, type SemesterStatus,
} from '@uniplan/core';
import { $, $$, closest, esc, icon } from '../dom';
import { areas, semesters, setUi, state } from '../store';
import { openEditor } from './editor';
import { reqsHTML } from './reqs';
import { openSemesterDialog } from './semester-dialog';

const STATUS_LABEL: Record<SemesterStatus, string> = { past: 'Completed', current: 'Current', upcoming: 'Upcoming' };

const dateRange = (s: Semester) =>
  s.start && s.end ? `${fmtDate(s.start, { day: 'numeric', month: 'short' })} – ${fmtDate(s.end)}` : s.start ? `From ${fmtDate(s.start)}` : '';

/** Only semesters whose dates (or term) are over count as completed; undated ones might still be running. */
const isDone = (s: Semester) => semesterStatus(s) === 'past';
const openLabel = (list: Semester[]) =>
  list.some((s) => !semesterStatus(s) && summarizeSemester(s).credits) ? 'current, upcoming and undated semesters' : 'current and upcoming semesters';

/** Degree progress: one segment per semester. Completed semesters are solid, the rest a lighter step of the same hue. */
function meterHTML(list: Semester[], total: number, earned: number): string {
  const scale = Math.max(total, earned, 1);
  const segs = list.map((s) => ({ s, cp: summarizeSemester(s).credits, status: semesterStatus(s) })).filter((x) => x.cp > 0);
  const pct = (cp: number) => (cp / scale) * 100;
  const label = (x: (typeof segs)[number]) => `${x.s.name}: ${fmtNum(x.cp)} CP${x.status ? ` · ${STATUS_LABEL[x.status].toLowerCase()}` : ''}`;
  const open = segs.some((x) => !isDone(x.s));
  const done = segs.some((x) => isDone(x.s));
  const key = (cls: string, text: string) => `<span><i class="${cls}"></i>${text}</span>`;
  return `<div class="ov-meter" role="img" aria-label="${esc(`${fmtNum(earned)} of ${fmtNum(total)} credits. ${segs.map(label).join('. ')}`)}">
      <div class="ov-track">${segs.map((x) =>
        `<span class="ov-seg ${isDone(x.s) ? '' : 'planned'}" style="width:${pct(x.cp)}%" title="${esc(label(x))}" data-sem="${x.s.id}"></span>`).join('')}</div>
      <div class="ov-labels">${segs.map((x) =>
        `<span style="width:${pct(x.cp)}%" title="${esc(label(x))}"><b>${esc(shortSemesterName(x.s.name))}</b> ${fmtNum(x.cp)}</span>`).join('')}</div>
      ${segs.length ? `<div class="ov-key">${done ? key('done', 'Completed semesters') : ''}${open ? key('planned', openLabel(list).replace(/^./, (c) => c.toUpperCase())) : ''}</div>` : ''}
    </div>`;
}

function semCardHTML(s: Semester): string {
  const sum = summarizeSemester(s);
  const status = semesterStatus(s);
  const dates = dateRange(s);
  const facts = [plural(sum.final, 'final course'), sum.open ? `${sum.open} still open` : ''].filter(Boolean).join(' · ');
  return `<article class="sem-card ${s.id === state.ui.semesterId ? 'active' : ''}" data-sem="${s.id}" tabindex="0">
    <div class="sc-top">
      <h3>${esc(s.name)}</h3>
      ${status ? `<span class="badge ${status}">${STATUS_LABEL[status]}</span>` : ''}
    </div>
    ${dates ? `<p class="sc-dates">${esc(dates)}</p>` : ''}
    <p class="sc-cp"><b>${fmtNum(sum.credits)}</b> CP in Final</p>
    <p class="sc-facts">${esc(facts)}${sum.missingCredits ? ` · <span class="warn">${sum.missingCredits} without credits</span>` : ''}</p>
    <div class="sc-actions">
      <button class="btn btn-sm" data-ov="open">Open ${icon('chevR')}</button>
      <button class="icon-btn sm" data-ov="edit" title="Edit semester">${icon('pencil')}</button>
    </div>
  </article>`;
}

/** Every Final course, semester by semester: the table behind the meter. */
function transcriptHTML(list: Semester[]): string {
  const rows = list.map((s) => {
    const final = s.courses.filter((c) => c.stage === 2).sort((a, b) => a.name.localeCompare(b.name));
    if (!final.length) return '';
    const sum = summarizeSemester(s);
    return `<tbody>
      <tr class="tr-sem"><th colspan="3" scope="rowgroup">${esc(s.name)}</th><td class="num">${fmtNum(sum.credits)}</td></tr>
      ${final.map((c) => `<tr data-edit="${c.id}" tabindex="0">
        <td class="tr-name"><span class="card-dot" style="--h:${c.hue}"></span><span>${esc(c.name)}${c.code ? ` <small>${esc(c.code)}</small>` : ''}</span></td>
        <td class="tr-area" colspan="2">${esc(areas().get(c.area)?.short ?? '')}</td>
        <td class="num">${c.credits != null ? fmtNum(c.credits) : '<span class="warn" title="No credits entered">?</span>'}</td>
      </tr>`).join('')}
    </tbody>`;
  }).join('');
  return rows
    ? `<section class="ov-section"><h2 class="ov-h2">Final courses</h2>
        <table class="transcript"><thead><tr><th scope="col">Course</th><th scope="col" colspan="2">Area</th><th scope="col" class="num">CP</th></tr></thead>${rows}</table></section>`
    : '';
}

export function renderOverview(): void {
  const program = state.data.program;
  const list = semesters();
  const entries = finalEntries(state.data);
  const earned = creditsOf(entries.map((e) => e.course));
  const done = creditsOf(list.filter(isDone).flatMap((s) => s.courses.filter((c) => c.stage === 2)));
  const total = program.total;
  const toGo = Math.max(0, total - earned);
  const pctDone = total ? Math.min(100, Math.round((earned / total) * 100)) : 0;

  const kpis: [string, string][] = [
    [`${pctDone}%`, 'of the degree'],
    [fmtNum(toGo), toGo === 1 ? 'credit to go' : 'credits to go'],
    [String(entries.length), entries.length === 1 ? 'final course' : 'final courses'],
    [String(list.length), list.length === 1 ? 'semester' : 'semesters'],
  ];

  $('#overview').innerHTML = `<div class="ov">
    <div class="main-head">
      <div>
        <h1 class="view-title">Study overview</h1>
        <p class="view-sub">${esc(program.name)}. Counts every course that made it into Final, across all semesters.</p>
      </div>
    </div>

    <section class="ov-progress">
      <div class="ov-top">
        <div class="ov-hero">
          <b>${fmtNum(earned)}</b><span>/ ${fmtNum(total)} credits</span>
          ${earned !== done ? `<p>${fmtNum(done)} from completed semesters, ${fmtNum(earned - done)} from ${openLabel(list)}</p>` : ''}
        </div>
        <div class="stats">${kpis.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      </div>
      ${meterHTML(list, total, earned)}
    </section>

    <section class="ov-section">
      <h2 class="ov-h2">Semesters</h2>
      <div class="sem-grid">
        ${list.map(semCardHTML).join('')}
        <button class="sem-card sem-new" data-ov="new">${icon('plus')}<span>New semester</span></button>
      </div>
    </section>

    <div class="ov-reqs">${reqsHTML({ mode: 'overview', entries, sub: 'Final courses of all semesters', collapsible: false })}</div>

    ${transcriptHTML(list)}
  </div>`;
  fitMeterLabels();
}

/** Semester labels under the meter only show where they fit their segment. */
function fitMeterLabels(): void {
  for (const el of $$('#overview .ov-labels span')) {
    el.classList.remove('clipped');
    el.classList.toggle('clipped', el.scrollWidth > el.clientWidth + 1);
  }
}

export function initOverview(): void {
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(fitMeterLabels, 100); });
  const el = $('#overview');
  el.addEventListener('click', (e) => {
    const edit = closest(e.target, '[data-edit]');
    if (edit) { openEditor(edit.dataset.edit!); return; }
    const act = closest(e.target, '[data-ov]');
    const card = closest(e.target, '.sem-card[data-sem], .ov-seg[data-sem]');
    if (act?.dataset.ov === 'new') { openSemesterDialog(); return; }
    if (act?.dataset.ov === 'edit' && card) { openSemesterDialog(card.dataset.sem!); return; }
    if (card) setUi({ mode: 'semester', semesterId: card.dataset.sem! });
  });
  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter') return;
    if (t.matches('.sem-card[data-sem]')) setUi({ mode: 'semester', semesterId: t.dataset.sem! });
    else if (t.matches('tr[data-edit]')) openEditor(t.dataset.edit!);
  });
}

