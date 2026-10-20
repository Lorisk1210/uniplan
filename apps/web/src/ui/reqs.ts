import {
  courseLabel, creditsOf, fmtNum, plural, shortSemesterName, STAGE_LABEL, tallyCredits, type Bucket, type CreditEntry,
} from '@uniplan/core';
import { esc, icon } from '../dom';
import { state } from '../store';

const reqRange = (min: number, max: number | null) => (max == null ? `min ${min}` : min === max ? `${min}` : `${min}–${max}`);
const reqStatus = (min: number, max: number | null, v: number) => (v < min ? 'low' : max != null && v > max ? 'over' : v || min ? 'ok' : 'none');

function reqBar(min: number, scale: number | null, t: Bucket, st: string): string {
  const top = Math.max(scale ?? min, t.all, 1);
  const pct = (x: number) => Math.min(100, (x / top) * 100);
  return `<div class="rq-bar ${st}">
    <span class="track"><span class="f" style="width:${pct(t.firm)}%"></span><span class="t" style="width:${pct(t.all) - pct(t.firm)}%"></span></span>
    ${min > 0 && min < top ? `<i style="left:${pct(min)}%"></i>` : ''}</div>`;
}

type Mode = 'semester' | 'overview';

/** Course chips. Planning a semester, other semesters' credits fold into one chip that leads to the overview. */
function chipsHTML(entries: CreditEntry[], mode: Mode): string {
  const own = mode === 'semester' ? entries.filter((e) => !e.other) : entries;
  const others = mode === 'semester' ? entries.filter((e) => e.other) : [];
  const chip = (e: CreditEntry) => {
    const c = e.course;
    const tip = mode === 'overview' ? `${c.name} · ${e.semester.name}` : `${c.name} · ${STAGE_LABEL[c.stage]}`;
    return `<button data-edit="${c.id}" class="${e.firm ? '' : 'tent'}" style="--h:${c.hue}" title="${esc(tip)}"><span class="card-dot"></span>${esc(courseLabel(c))}<span class="cr">${c.credits != null ? fmtNum(c.credits) : '?'}</span>${
      mode === 'overview' ? `<span class="sem">${esc(shortSemesterName(e.semester.name))}</span>` : ''}</button>`;
  };
  let html = own.map(chip).join('');
  if (others.length) {
    const cp = creditsOf(others.map((e) => e.course));
    const n = new Set(others.map((e) => e.semester.id)).size;
    const tip = others.map((e) => `${courseLabel(e.course)} (${e.semester.name}) · ${e.course.credits ?? '?'} CP`).join('\n');
    html += `<button class="others" data-goto="overview" title="${esc(tip)}">+${fmtNum(cp)} CP from ${n === 1 ? 'another semester' : `${n} other semesters`}</button>`;
  }
  return html ? `<div class="rq-courses">${html}</div>` : '';
}

// min == null: no requirement, just list what's there. `scale` sizes the bar when there's no max of its own.
function reqRow(lbl: string, min: number | null, max: number | null, t: Bucket, cls: string, mode: Mode, chips: boolean, scale = max): string {
  const st = min == null ? 'none' : reqStatus(min, max, t.all);
  const status = { low: `${fmtNum((min ?? 0) - t.all)} to go`, over: `${fmtNum(t.all - (max ?? 0))} over`, ok: icon('check'), none: '' }[st];
  const tip = `${lbl}: ${fmtNum(t.all)} CP counted${t.firm !== t.all ? ` (${fmtNum(t.firm)} in Final)` : ''}${min == null ? '' : `, needs ${reqRange(min, max)} CP`}`;
  return `<div class="rq-row ${cls} ${st}" title="${esc(tip)}">
    <span class="rq-label">${esc(lbl)}</span>
    ${min == null ? '<span></span>' : reqBar(min, scale, t, st)}
    <span class="rq-num"><b>${fmtNum(t.all)}</b><span>${min == null ? 'CP' : `/ ${reqRange(min, max)}`}</span></span>
    <span class="rq-status">${status}</span>
    ${chips ? chipsHTML(t.entries, mode) : ''}
  </div>`;
}

export interface ReqsOptions {
  mode: Mode;
  entries: CreditEntry[];
  /** Line under the title, e.g. what's being counted. */
  sub: string;
  /** Overview: always open. */
  collapsible: boolean;
}

/** The credit requirements of the degree, filled with `entries`. */
export function reqsHTML({ mode, entries, sub, collapsible }: ReqsOptions): string {
  const program = state.data.program;
  const t = tallyCredits(program, entries);
  const open = !collapsible || state.ui.reqsOpen;
  const total = `<span class="rq-total"><b>${fmtNum(t.total.all)}</b> / ${fmtNum(program.total)} CP</span>`;
  const title = `<span class="rq-title"><h2>Credit requirements</h2><span>${esc(sub)}</span></span>`;
  const head = collapsible
    ? `<button class="rq-head" data-reqs="toggle" aria-expanded="${open}">${title}${total}${icon(open ? 'chevUp' : 'chevDown')}</button>`
    : `<div class="rq-head static">${title}${total}</div>`;
  if (!open) return `<section class="reqs">${head}</section>`;

  let body: string;
  if (!program.groups.length) {
    body = `<div class="rq-group">${reqRow(program.name, program.total, null, t.total, 'g', mode, true)}</div>`;
  } else {
    body = program.groups.map((g) => {
      if (g.areas.length === 1) {
        const a = g.areas[0];
        return `<div class="rq-group">${reqRow(g.label, g.min, g.max, t.area(a.key), 'g', mode, true)}</div>`;
      }
      return `<div class="rq-group">${reqRow(g.label, g.min, g.max, t.group(g), 'g', mode, false)}${g.areas.map((a) =>
        reqRow(a.label, a.min, a.max, t.area(a.key), 'a', mode, true, a.max ?? g.max)).join('')}</div>`;
    }).join('');
    const none = t.area('');
    if (none.entries.length) body += `<div class="rq-group rq-none">${reqRow('Not assigned to an area', null, null, none, 'g', mode, true)}</div>`;
  }
  const missing = entries.filter((e) => e.course.credits == null).length;
  const foot = `<div class="rq-foot">
    ${missing ? `<span>${icon('alert')}${plural(missing, 'course')} without credits</span>` : '<span></span>'}
    <button class="link" data-reqs="edit">${icon('pencil')}Edit requirements</button></div>`;
  return `<section class="reqs open">${head}<div class="rq-body">${body}${foot}</div></section>`;
}
