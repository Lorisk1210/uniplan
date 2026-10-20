import {
  byDayTime, computeConflicts, courseLabel, DAYS, fmtNum, overlapsWith, plural, STAGE_LABEL, validSession, weeklyMinutes,
  type Course, type Stage,
} from '@uniplan/core';
import { $, closest, esc, icon } from '../dom';
import { areas, commit, courseById, courses, inView, setUi, undo, VIEWS, type ViewKey } from '../store';
import { openEditor } from './editor';
import { derive, sortCourses } from './planner';
import { toast } from './toast';

interface Review {
  viewKey: ViewKey;
  stage: Stage;
  ids: string[];
  i: number;
  log: { type: 'advance' | 'keep' | 'drop'; changed: boolean }[];
}

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>('#dlg-review');
let review: Review | null = null;

export function startReview(): void {
  const d = derive();
  if (d.view.stage < 0) return;
  const ids = sortCourses(d.list.filter((c) => c.stage === d.view.stage)).map((c) => c.id);
  if (!ids.length) {
    toast(d.list.length
      ? `Everything here is already past ${STAGE_LABEL[d.view.stage]}`
      : 'Nothing to review in this wave');
    return;
  }
  review = { viewKey: d.view.key, stage: d.view.stage, ids, i: 0, log: [] };
  renderReview();
  dlg().showModal();
}

function renderReview(): void {
  const r = review!;
  const el = dlg();
  const v = VIEWS.find((x) => x.key === r.viewKey)!;
  while (r.i < r.ids.length && !courseById(r.ids[r.i])) r.i++;

  if (r.i >= r.ids.length) {
    const t = { advance: 0, keep: 0, drop: 0 };
    for (const l of r.log) t[l.type]++;
    const next = VIEWS.find((x) => x.stage === r.stage + 1);
    el.innerHTML = `<div class="rv"><div class="rv-done">
      <h2>Wave reviewed</h2>
      <p>You went through ${plural(r.ids.length, 'course')} in ${v.label}.</p>
      <div class="rv-tally">
        ${r.stage < 2 ? `<div><b>${t.advance}</b><span>moved on</span></div>` : ''}
        <div><b>${t.keep}</b><span>kept</span></div>
        <div><b>${t.drop}</b><span>dropped</span></div>
      </div>
      <div class="actions">
        ${r.log.length ? `<button class="btn btn-ghost" data-rv="back">${icon('undo')}Back</button>` : ''}
        <button class="btn ${next && t.advance ? '' : 'btn-primary'}" data-rv="close">Done</button>
        ${next && t.advance ? `<button class="btn btn-primary" data-rv="goto" data-view="${next.key}">Open ${next.label} ${icon('chevR')}</button>` : ''}
      </div>
    </div></div>`;
    return;
  }

  const c = courseById(r.ids[r.i])!;
  const others = courses().filter((x) => x.id !== c.id && inView(x, v) && !x.hidden);
  const items = computeConflicts(others).items;
  const sessions = c.sessions.filter(validSession).sort(byDayTime);
  const hrs = weeklyMinutes(c) / 60;
  const next = STAGE_LABEL[(r.stage + 1) as Stage];
  const area = areas().get(c.area);

  const facts = [
    c.credits != null ? `<span>${icon('award')}${fmtNum(c.credits)} credits</span>` : '',
    hrs ? `<span>${icon('clock')}${fmtNum(hrs)} h / week</span>` : '',
    c.instructor ? `<span>${icon('user')}${esc(c.instructor)}</span>` : '',
    area ? `<span>${icon('layers')}${esc(area.label)}</span>` : '',
  ].join('');

  el.innerHTML = `<div class="rv">
    <div class="rv-top">
      <span class="t">Reviewing ${v.label}</span>
      <span class="c">${r.i + 1} / ${r.ids.length}</span>
      <button class="icon-btn" data-rv="close" title="Close (Esc)">${icon('x')}</button>
    </div>
    <div class="rv-progress"><span style="width:${(r.i / r.ids.length) * 100}%"></span></div>
    <div class="rv-card" style="--h:${c.hue}" data-key="${c.id}">
      <div class="rv-head">
        <div>
          ${c.code ? `<div class="rv-code">${esc(c.code)}</div>` : ''}
          <h2 class="rv-title">${esc(c.name)}</h2>
        </div>
        <button class="star ${c.favorite ? 'on' : ''}" data-rv="fav" title="Favorite (F)" style="opacity:1">${icon('star')}</button>
      </div>
      ${facts ? `<div class="rv-facts">${facts}</div>` : ''}
      ${c.tags.length ? `<div class="card-tags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${sessions.length ? `<ul class="rv-sessions">${sessions.map((s) => {
        const clash = overlapsWith(c, s, items);
        const flag = clash.length
          ? `<span class="flag clash" title="${esc(clash.map((x: Course) => x.name).join(', '))}">overlaps ${esc(clash.map(courseLabel).join(', '))}</span>`
          : s.alt ? `<span class="flag opt">option</span>` : '';
        return `<li><span class="d">${DAYS[s.day]}</span><span class="tm">${s.start}–${s.end}</span><span class="k">${esc([s.kind, s.location].filter(Boolean).join(' · '))}</span>${flag}</li>`;
      }).join('')}</ul>` : `<p class="rv-none">No times entered yet.</p>`}
      ${c.notes.trim() ? `<p class="rv-notes">${esc(c.notes.trim())}</p>` : ''}
    </div>
    <div class="rv-actions ${r.stage >= 2 ? 'two' : ''}">
      <button class="btn rv-drop" data-rv="drop"><kbd>←</kbd>Drop</button>
      <button class="btn" data-rv="keep"><kbd>↓</kbd>Keep as ${STAGE_LABEL[r.stage]}</button>
      ${r.stage < 2 ? `<button class="btn btn-primary" data-rv="advance">To ${next}<kbd>→</kbd></button>` : ''}
    </div>
    <div class="rv-sub">
      <button data-rv="back" ${r.log.length ? '' : 'disabled'}>${icon('undo')}Back</button>
      <button data-rv="edit">Edit course</button>
    </div>
  </div>`;
}

function reviewDecide(type: 'advance' | 'keep' | 'drop'): void {
  const r = review!;
  const c = courseById(r.ids[r.i]);
  if (!c) return;
  if (type === 'keep') {
    r.log.push({ type, changed: false });
  } else {
    commit(() => {
      if (type === 'advance') c.stage = Math.min(2, c.stage + 1) as Stage;
      if (type === 'drop') { c.prevStage = c.stage as 0 | 1 | 2; c.stage = -1; }
    });
    r.log.push({ type, changed: true });
  }
  r.i++;
  renderReview();
}

function reviewBack(): void {
  const r = review!;
  const last = r.log.pop();
  if (!last) return;
  if (last.changed) undo(true);
  r.i = Math.max(0, r.i - 1);
  // Skip back over any courses that were deleted meanwhile.
  while (r.i > 0 && !courseById(r.ids[r.i])) r.i--;
  renderReview();
}

export function initReview(): void {
  const d = dlg();
  d.addEventListener('click', (e) => {
    if (e.target === d) { d.close(); return; }
    const btn = closest(e.target, '[data-rv]');
    if (!btn || !review) return;
    const act = btn.dataset.rv!;
    if (act === 'close') d.close();
    else if (act === 'back') reviewBack();
    else if (act === 'goto') { d.close(); setUi({ view: btn.dataset.view as ViewKey }); }
    else if (act === 'fav') {
      const c = courseById(review.ids[review.i]);
      if (!c) return;
      commit(() => { c.favorite = !c.favorite; });
      btn.classList.toggle('on', c.favorite);
    } else if (act === 'edit') {
      const id = review.ids[review.i];
      d.close();
      openEditor(id);
    } else reviewDecide(act as 'advance' | 'keep' | 'drop');
  });

  d.addEventListener('keydown', (e) => {
    if (!review || e.metaKey || e.ctrlKey || e.altKey) return;
    const done = review.i >= review.ids.length;
    const k = e.key.toLowerCase();
    if (!done && (k === 'arrowleft' || k === 'd')) { e.preventDefault(); reviewDecide('drop'); }
    else if (!done && (k === 'arrowdown' || k === 'k' || k === ' ')) { e.preventDefault(); reviewDecide('keep'); }
    else if (!done && (k === 'arrowright' || k === 'a') && review.stage < 2) { e.preventDefault(); reviewDecide('advance'); }
    else if (!done && k === 'f') { e.preventDefault(); d.querySelector<HTMLElement>('[data-rv=fav]')?.click(); }
    else if (k === 'backspace' || k === 'z' || k === 'arrowup') { e.preventDefault(); reviewBack(); }
    else if (k === 'enter' && done) { e.preventDefault(); (d.querySelector<HTMLElement>('[data-rv=goto]') || d.querySelector<HTMLElement>('[data-rv=close]'))?.click(); }
  });

  d.addEventListener('close', () => { review = null; });
}
