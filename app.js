(() => {
  'use strict';

  /* ───────────────────────── Constants ───────────────────────── */

  const STORE = 'uniplan:v1';
  const UI_STORE = 'uniplan:ui:v1';
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const HUES = [255, 225, 195, 165, 140, 105, 75, 50, 25, 0, 330, 295];
  const STAGE_LABEL = { '-1': 'Dropped', 0: 'Idea', 1: 'Shortlist', 2: 'Final' };

  // Waves are a funnel: each view shows everything that made it at least that far.
  const VIEWS = [
    { key: 'ideas', stage: 0, label: 'Ideas', title: 'Ideas', sub: 'Everything that sounds interesting. Add freely, you’ll narrow it down later.' },
    { key: 'shortlist', stage: 1, label: 'Shortlist', title: 'Shortlist', sub: 'Courses you’re seriously considering.' },
    { key: 'final', stage: 2, label: 'Final', title: 'Final timetable', sub: 'Your plan for the semester.' },
    { key: 'dropped', stage: -1, label: 'Dropped', title: 'Dropped', sub: 'Courses you’ve ruled out. Restore any of them at any time.' },
  ];
  const inView = (c, v) => (v.stage === -1 ? c.stage === -1 : c.stage >= v.stage);

  // Credit requirements of the degree (M.Sc. Informatik, TU Darmstadt). Edit to match your own regulations.
  // Areas without their own max are capped by their group's max.
  const PROGRAM = {
    name: 'M.Sc. Informatik',
    total: 120,
    groups: [
      { key: 'vertiefung', label: 'Wahlbereiche der individuellen Vertiefung', min: 6, max: 51, areas: [
        { key: 'ki', label: 'Künstliche Intelligenz', short: 'KI', min: 0, max: 51 },
        { key: 'cyber', label: 'Cybersicherheit und Privatheit', short: 'Cybersicherheit', min: 0, max: 51 },
        { key: 'kvs', label: 'Komplexe vernetzte Systeme', short: 'KVS', min: 0, max: 51 },
      ] },
      { key: 'basis', label: 'Basis-Wahlbereiche', min: 12, max: 57, areas: [
        { key: 'theory', label: 'Theorie', short: 'Theorie', min: 6 },
        { key: 'swhw', label: 'Software & Hardware', short: 'SW & HW', min: 6 },
      ] },
      { key: 'begleitend', label: 'Studienbegleitende Leistungen', min: 9, max: 18, areas: [
        { key: 'seminar', label: 'Seminars', short: 'Seminar', min: 3, max: 12 },
        { key: 'lab', label: 'Labs', short: 'Lab', min: 6, max: 15 },
        { key: 'plit', label: 'Practical Labs in Teaching', short: 'PLiT', min: 0, max: 5 },
      ] },
      { key: 'generale', label: 'Studium Generale', min: 18, max: 24, areas: [
        { key: 'lang', label: 'Sprachen', short: 'Sprachen', min: 0, max: 21 },
        { key: 'mgw', label: 'Mensch, Gesellschaft, Wirtschaft', short: 'MGW', min: 3, max: 24 },
        { key: 'utn', label: 'Umwelt, Technik, Naturwissenschaft', short: 'UTN', min: 0, max: 21 },
      ] },
      { key: 'thesis', label: 'Masterarbeit', min: 30, max: 30, areas: [
        { key: 'thesis', label: 'Masterarbeit', short: 'Masterarbeit', min: 30, max: 30 },
      ] },
    ],
  };
  const AREAS = new Map(PROGRAM.groups.flatMap((g) => g.areas.map((a) => [a.key, { ...a, group: g }])));

  /* ───────────────────────── Icons ───────────────────────── */

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/><path d="m3 3 18 18"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevUp: '<path d="m18 15-6-6-6 6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    trashAll: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ───────────────────────── Utils ───────────────────────── */

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const validTime = (t) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t);
  const padTime = (t) => (validTime(t) ? t.padStart(5, '0') : '');
  // Lenient 24h parser for typed times: "14", "1400", "915", "9:15", "14.30", "14h" → "HH:MM" (null if invalid).
  const parseTime = (t) => {
    const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?h?$/.exec(String(t ?? '').trim());
    if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
  };
  const validSession = (s) => validTime(s.start) && validTime(s.end) && toMin(s.end) > toMin(s.start);
  const fmtHours = (h) => (Math.round(h * 10) / 10).toString();
  const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;
  const byDayTime = (a, b) => a.day - b.day || toMin(a.start) - toMin(b.start);
  const label = (c) => c.code || c.name;

  /* ───────────────────────── State ───────────────────────── */

  function normSession(s) {
    if (!s || typeof s !== 'object') return null;
    const alt = !!s.alt;
    return {
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      day: Math.min(6, Math.max(0, parseInt(s.day, 10) || 0)),
      start: padTime(s.start),
      end: padTime(s.end),
      kind: String(s.kind ?? 'Lecture').trim(),
      location: String(s.location ?? '').trim(),
      alt,
      chosen: alt && !!s.chosen,
    };
  }

  function normalize(r) {
    if (!r || typeof r !== 'object') return null;
    const credits = r.credits === '' || r.credits == null || isNaN(+r.credits) ? null : +r.credits;
    return {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      name: String(r.name || 'Untitled course').trim(),
      code: String(r.code ?? '').trim(),
      credits,
      instructor: String(r.instructor ?? '').trim(),
      notes: String(r.notes ?? ''),
      tags: Array.isArray(r.tags) ? [...new Set(r.tags.map((t) => String(t).trim()).filter(Boolean))] : [],
      area: AREAS.has(r.area) ? r.area : '',
      hue: Number.isFinite(+r.hue) ? +r.hue : HUES[0],
      favorite: !!r.favorite,
      hidden: !!r.hidden,
      stage: [-1, 0, 1, 2].includes(r.stage) ? r.stage : 0,
      prevStage: [0, 1, 2].includes(r.prevStage) ? r.prevStage : 0,
      createdAt: r.createdAt || Date.now(),
      sessions: Array.isArray(r.sessions) ? r.sessions.map(normSession).filter(Boolean) : [],
    };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE));
      if (Array.isArray(raw)) return raw.map(normalize).filter(Boolean);
    } catch { /* ignore */ }
    return [];
  }
  function loadUi() {
    try { return JSON.parse(localStorage.getItem(UI_STORE)) || {}; } catch { return {}; }
  }

  let courses = load();
  let ui = Object.assign(
    { view: 'ideas', tags: [], favOnly: false, conflictsOnly: false, theme: 'system', weekend: false, search: '', reqsOpen: true },
    loadUi(),
  );
  if (!VIEWS.some((v) => v.key === ui.view)) ui.view = 'ideas';
  let history = [];

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(courses)); } catch { /* quota */ } };
  const saveUi = () => { try { localStorage.setItem(UI_STORE, JSON.stringify(ui)); } catch { /* ignore */ } };
  const courseById = (id) => courses.find((c) => c.id === id);
  const currentView = () => VIEWS.find((v) => v.key === ui.view) || VIEWS[0];

  function commit(fn) {
    history.push(JSON.stringify(courses));
    if (history.length > 100) history.shift();
    fn();
    save();
    render();
  }
  function undo(silent = false) {
    if (!history.length) { if (!silent) toast('Nothing to undo'); return false; }
    courses = JSON.parse(history.pop()).map(normalize);
    save();
    render();
    if (!silent) toast('Undone');
    return true;
  }
  function setUi(patch) {
    Object.assign(ui, patch);
    saveUi();
    render();
  }

  /* ───────────────────────── Derivations ───────────────────────── */

  // Alternative slots (e.g. tutorial groups): once one of a kind is chosen, the rest hide.
  const isActive = (s) => !s.alt || s.chosen;
  const hasChosen = (c, kind) => c.sessions.some((s) => s.alt && s.chosen && s.kind === kind);
  const isGhost = (c, s) => s.alt && !s.chosen && !hasChosen(c, s.kind);

  function matchesFilters(c) {
    const q = ui.search.trim().toLowerCase();
    if (q) {
      const hay = [c.name, c.code, c.instructor, c.notes, AREAS.get(c.area)?.label, ...c.tags, ...c.sessions.flatMap((s) => [s.location, s.kind])]
        .join(' ').toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t.replace(/^#/, '')))) return false;
    }
    if (ui.favOnly && !c.favorite) return false;
    if (ui.tags.length && !ui.tags.some((t) => c.tags.includes(t))) return false;
    return true;
  }

  function computeConflicts(list) {
    const items = [];
    for (const c of list) for (const s of c.sessions) {
      if (isActive(s) && validSession(s)) items.push({ c, s, day: s.day, a: toMin(s.start), b: toMin(s.end) });
    }
    const bySession = new Map();
    const byCourse = new Map();
    const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
    let pairs = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const x = items[i], y = items[j];
        if (x.c.id === y.c.id || x.day !== y.day || !(x.a < y.b && y.a < x.b)) continue;
        pairs++;
        add(bySession, x.s.id, y.c.id); add(bySession, y.s.id, x.c.id);
        add(byCourse, x.c.id, y.c.id); add(byCourse, y.c.id, x.c.id);
      }
    }
    return { items, bySession, byCourse, pairs };
  }

  const overlapsWith = (c, s, items) => {
    if (!validSession(s)) return [];
    const a = toMin(s.start), b = toMin(s.end);
    return [...new Set(items.filter((i) => i.c.id !== c.id && i.day === s.day && i.a < b && a < i.b).map((i) => i.c))];
  };

  function derive() {
    const view = currentView();
    const pool = courses.filter((c) => inView(c, view));
    const filtered = pool.filter(matchesFilters);
    const visible = filtered.filter((c) => !c.hidden);
    const conf = computeConflicts(visible);
    const list = ui.conflictsOnly ? filtered.filter((c) => conf.byCourse.has(c.id)) : filtered;
    const table = ui.conflictsOnly ? visible.filter((c) => conf.byCourse.has(c.id)) : visible;
    return { view, pool, filtered, list, table, conf };
  }

  function weeklyMinutes(c) {
    return c.sessions.filter((s) => isActive(s) && validSession(s)).reduce((m, s) => m + toMin(s.end) - toMin(s.start), 0);
  }

  /* ───────────────────────── Rendering ───────────────────────── */

  function render() {
    const d = derive();
    renderWaves();
    renderFilters(d);
    renderList(d);
    renderHead(d);
    renderTimetable(d);
    renderUnscheduled(d);
    renderReqs(d);
    $('#btn-review').disabled = d.view.stage < 0;
  }

  function renderWaves() {
    const count = (v) => courses.filter((c) => inView(c, v)).length;
    const btn = (v) => `<button class="wave ${v.key === 'dropped' ? 'dropped' : ''} ${ui.view === v.key ? 'on' : ''}" data-view="${v.key}" aria-current="${ui.view === v.key}">
        <span>${v.label}</span><span class="n">${count(v)}</span></button>`;
    $('#waves').innerHTML =
      VIEWS.slice(0, 3).map((v, i) => (i ? `<span class="wave-sep">${icon('chevR')}</span>` : '') + btn(v)).join('') +
      `<span class="wave-gap"></span>` + btn(VIEWS[3]);
  }

  function renderFilters(d) {
    const tagCounts = new Map();
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

  function sortCourses(list) {
    return [...list].sort((a, b) =>
      (b.favorite - a.favorite) || (b.stage - a.stage) || a.name.localeCompare(b.name));
  }

  function renderList(d) {
    const el = $('#course-list');
    const head = $('#list-head');
    const credits = d.list.reduce((s, c) => s + (c.credits || 0), 0);
    head.innerHTML = d.list.length
      ? `<span><b>${plural(d.list.length, 'course')}</b>${d.list.length !== d.pool.length ? ` of ${d.pool.length}` : ''}</span><span>${credits ? `${fmtHours(credits)} credits` : ''}</span>`
      : '';

    if (!courses.length) {
      el.innerHTML = `<div class="list-empty">
        <h3>Start with a brain dump</h3>
        <p>Add every course that sounds remotely interesting. You’ll filter it down in waves later.</p>
        <div class="actions">
          <button class="btn btn-primary" data-act="new">${icon('plus')}Add your first course</button>
          <button class="link" data-act="example">or load example courses</button>
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

  function cardHTML(c, d) {
    const valid = c.sessions.filter(validSession);
    const active = valid.filter(isActive);
    const days = [...new Set(active.map((s) => s.day))].sort().map((x) => DAYS[x]);
    const hrs = weeklyMinutes(c) / 60;
    const toPick = new Set(valid.filter((s) => isGhost(c, s)).map((s) => s.kind)).size;
    const meta = [];
    if (days.length) meta.push(days.join(', '));
    if (hrs) meta.push(`${fmtHours(hrs)} h/wk`);
    if (toPick) meta.push(`${toPick === 1 ? 'pick a slot' : `pick ${toPick} slots`}`);
    if (c.credits != null) meta.push(`${fmtHours(c.credits)} cr`);
    if (c.area) meta.push(AREAS.get(c.area).short);
    if (!valid.length) meta.push('No times yet');

    const clashes = [...(d.conf.byCourse.get(c.id) || [])].map(courseById).filter(Boolean).map(label);
    const dropped = c.stage === -1;

    const stageCtl = dropped
      ? `<button class="btn btn-sm" data-act="restore">${icon('restore')}Restore to ${STAGE_LABEL[c.prevStage]}</button>`
      : `<div class="stage-pill s${c.stage}">
          <button class="sp-btn" data-act="demote" ${c.stage <= 0 ? 'disabled' : ''} title="${c.stage > 0 ? `Back to ${STAGE_LABEL[c.stage - 1]}` : ''}">${icon('chevL')}</button>
          <span>${STAGE_LABEL[c.stage]}</span>
          <button class="sp-btn" data-act="advance" ${c.stage >= 2 ? 'disabled' : ''} title="${c.stage < 2 ? `Move to ${STAGE_LABEL[c.stage + 1]}` : ''}">${icon('chevR')}</button>
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

  function renderHead(d) {
    $('#view-title').textContent = d.view.title;
    $('#view-sub').textContent = d.view.sub;
    const credits = d.table.reduce((s, c) => s + (c.credits || 0), 0);
    const mins = d.table.reduce((s, c) => s + weeklyMinutes(c), 0);
    const stats = [
      [d.table.length, d.table.length === 1 ? 'course' : 'courses'],
      [fmtHours(credits), 'credits'],
      [fmtHours(mins / 60), 'hours / week'],
      [d.conf.pairs, d.conf.pairs === 1 ? 'overlap' : 'overlaps', d.conf.pairs > 0],
    ];
    $('#stats').innerHTML = courses.length
      ? stats.map(([v, l, bad]) => `<div class="stat ${bad ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('')
      : '';
  }

  function layoutDay(evts) {
    evts.sort((x, y) => x.a - y.a || y.b - x.b);
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = [];
      for (const e of cluster) {
        let i = lanes.findIndex((end) => end <= e.a);
        if (i < 0) { i = lanes.length; lanes.push(0); }
        lanes[i] = e.b;
        e.lane = i;
      }
      for (const e of cluster) e.lanes = lanes.length;
      cluster = [];
    };
    for (const e of evts) {
      if (cluster.length && e.a >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.b);
    }
    flush();
    return evts;
  }

  function renderTimetable(d) {
    const el = $('#timetable');
    const events = [];
    for (const c of d.table) for (const s of c.sessions) {
      if (!validSession(s)) continue;
      const ghost = isGhost(c, s);
      if (!ghost && !isActive(s)) continue;
      events.push({ c, s, ghost, day: s.day, a: toMin(s.start), b: toMin(s.end) });
    }

    const days = [0, 1, 2, 3, 4];
    if (ui.weekend || events.some((e) => e.day === 5)) days.push(5);
    if (ui.weekend || events.some((e) => e.day === 6)) days.push(6);
    if (days.includes(6) && !days.includes(5)) days.splice(5, 0, 5);

    let startH = 8, endH = 18;
    if (events.length) {
      startH = Math.min(startH, Math.floor(Math.min(...events.map((e) => e.a)) / 60));
      endH = Math.max(endH, Math.ceil(Math.max(...events.map((e) => e.b)) / 60));
    }
    const hours = endH - startH;
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const hourLabels = Array.from({ length: hours - 1 }, (_, i) =>
      `<span class="tt-hour" style="top:calc(var(--hour) * ${i + 1})">${String(startH + i + 1).padStart(2, '0')}:00</span>`).join('');

    const cols = days.map((day) => {
      const evs = layoutDay(events.filter((e) => e.day === day));
      const isToday = day === todayIdx;
      const nowLine = isToday && nowMin > startH * 60 && nowMin < endH * 60
        ? `<div class="tt-now" style="top:calc(var(--hour) * ${(nowMin - startH * 60) / 60})"></div>` : '';
      return `<div class="tt-col ${isToday ? 'today' : ''}" data-day="${day}">${evs.map((e) => eventHTML(e, d, startH)).join('')}${nowLine}</div>`;
    }).join('');

    let empty = '';
    if (!courses.length) {
      empty = `<div class="tt-empty"><div>
        <h2>Your week, at a glance</h2>
        <p>Add the courses you’re curious about with their times. Overlaps show up right here.</p>
        <div class="actions">
          <button class="btn btn-primary" data-act="new">${icon('plus')}Add course</button>
          <button class="btn" data-act="example">${icon('sparkle')}Load examples</button>
        </div></div></div>`;
    } else if (!events.length) {
      const why = d.pool.length ? (d.table.length ? 'None of these courses have times yet.' : 'Nothing matches your current filters.') : `No courses in ${d.view.label} yet.`;
      empty = `<div class="tt-empty"><div><h2>Nothing scheduled</h2><p style="margin:0">${why}</p></div></div>`;
    }

    el.innerHTML = `<div class="tt" style="--cols:${days.length};--hours:${hours}">
      <div class="tt-head"><div></div>${days.map((day) => `<div class="tt-day ${day === todayIdx ? 'today' : ''}">${DAYS_LONG[day]}</div>`).join('')}</div>
      <div class="tt-body"><div class="tt-gutter">${hourLabels}</div>${cols}</div>
    </div>${empty}`;
  }

  function eventHTML(e, d, startH) {
    const { c, s } = e;
    const len = (e.b - e.a) / 60;
    const clashIds = e.ghost ? null : d.conf.bySession.get(s.id);
    const ghostClash = e.ghost ? overlapsWith(c, s, d.conf.items) : [];
    const cls = ['event'];
    if (e.ghost) cls.push('ghost');
    if (clashIds) cls.push('conflict');
    if (len <= 1.05) cls.push('short');
    if (len < 0.75) cls.push('tiny');

    const clashNames = clashIds ? [...clashIds].map(courseById).filter(Boolean).map(label) : ghostClash.map(label);
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

  function renderUnscheduled(d) {
    const none = d.table.filter((c) => !c.sessions.some(validSession));
    $('#unscheduled').innerHTML = none.length
      ? `<span>Not on the timetable yet:</span>${none.map((c) =>
          `<button data-edit="${c.id}" style="--h:${c.hue}"><span class="card-dot"></span>${esc(label(c))}</button>`).join('')}`
      : '';
  }

  /* ───────────────────────── Credit requirements ───────────────────────── */

  const reqRange = (min, max) => (max == null ? `min ${min}` : min === max ? `${min}` : `${min}–${max}`);
  const reqStatus = (min, max, v) => (v < min ? 'low' : max != null && v > max ? 'over' : v || min ? 'ok' : 'none');

  // Counts the current wave (Final when looking at Dropped). Hidden courses are left out, like on the timetable.
  function tallyCredits(view) {
    const counting = view.stage < 0 ? VIEWS[2] : view;
    const list = courses.filter((c) => inView(c, counting) && !c.hidden);
    const byArea = new Map();
    for (const c of list) {
      const k = c.area || '';
      if (!byArea.has(k)) byArea.set(k, { all: 0, firm: 0, courses: [] });
      const t = byArea.get(k);
      t.all += c.credits || 0;
      if (c.stage === 2) t.firm += c.credits || 0;
      t.courses.push(c);
    }
    const sum = (keys, f) => keys.reduce((s, k) => s + (byArea.get(k)?.[f] || 0), 0);
    const empty = { all: 0, firm: 0, courses: [] };
    const area = (k) => byArea.get(k) || empty;
    const group = (g) => { const ks = g.areas.map((a) => a.key); return { all: sum(ks, 'all'), firm: sum(ks, 'firm') }; };
    const total = { all: list.reduce((s, c) => s + (c.credits || 0), 0), firm: list.filter((c) => c.stage === 2).reduce((s, c) => s + (c.credits || 0), 0) };
    return { counting, list, area, group, total };
  }

  function reqBar(min, scale, t, st) {
    const top = Math.max(scale ?? min, t.all, 1);
    const pct = (x) => Math.min(100, (x / top) * 100);
    return `<div class="rq-bar ${st}">
      <span class="track"><span class="f" style="width:${pct(t.firm)}%"></span><span class="t" style="width:${pct(t.all) - pct(t.firm)}%"></span></span>
      ${min > 0 && min < top ? `<i style="left:${pct(min)}%"></i>` : ''}</div>`;
  }

  // min == null: no requirement, just list what's there. `scale` sizes the bar when there's no max of its own.
  function reqRow(lbl, min, max, t, cls, chips, scale = max) {
    const st = min == null ? 'none' : reqStatus(min, max, t.all);
    const status = { low: `${fmtHours(min - t.all)} to go`, over: `${fmtHours(t.all - max)} over`, ok: icon('check'), none: '' }[st];
    const tip = `${lbl}: ${fmtHours(t.all)} CP counted${t.firm !== t.all ? ` (${fmtHours(t.firm)} in Final)` : ''}${min == null ? '' : `, needs ${reqRange(min, max)} CP`}`;
    return `<div class="rq-row ${cls} ${st}" title="${esc(tip)}">
      <span class="rq-label">${esc(lbl)}</span>
      ${min == null ? '<span></span>' : reqBar(min, scale, t, st)}
      <span class="rq-num"><b>${fmtHours(t.all)}</b><span>${min == null ? 'CP' : `/ ${reqRange(min, max)}`}</span></span>
      <span class="rq-status">${status}</span>
      ${chips?.length ? `<div class="rq-courses">${chips.map((c) =>
        `<button data-edit="${c.id}" class="${c.stage === 2 ? '' : 'tent'}" style="--h:${c.hue}" title="${esc(`${c.name} · ${STAGE_LABEL[c.stage]}`)}"><span class="card-dot"></span>${esc(label(c))}<span class="cr">${c.credits != null ? fmtHours(c.credits) : '?'}</span></button>`).join('')}</div>` : ''}
    </div>`;
  }

  function renderReqs(d) {
    const el = $('#reqs');
    if (!courses.length) { el.innerHTML = ''; return; }
    const t = tallyCredits(d.view);
    const tentative = t.total.firm !== t.total.all;
    const open = ui.reqsOpen;
    const head = `<button class="rq-head" data-reqs="toggle" aria-expanded="${open}">
        <span class="rq-title"><h2>Credit requirements</h2>
          <span>${esc(PROGRAM.name)} · counting ${t.counting.label}${tentative ? ', faded = not in Final yet' : ''}</span></span>
        <span class="rq-total"><b>${fmtHours(t.total.all)}</b> / ${PROGRAM.total} CP</span>
        ${icon(open ? 'chevUp' : 'chevDown')}
      </button>`;
    if (!open) { el.innerHTML = `<section class="reqs">${head}</section>`; return; }

    const body = PROGRAM.groups.map((g) => {
      if (g.areas.length === 1) {
        const a = g.areas[0];
        return `<div class="rq-group">${reqRow(g.label, g.min, g.max, t.area(a.key), 'g', t.area(a.key).courses)}</div>`;
      }
      return `<div class="rq-group">${reqRow(g.label, g.min, g.max, t.group(g), 'g')}${g.areas.map((a) =>
        reqRow(a.label, a.min, a.max, t.area(a.key), 'a', t.area(a.key).courses, a.max ?? g.max)).join('')}</div>`;
    }).join('');
    const none = t.area('');
    const unassigned = none.courses.length
      ? `<div class="rq-group rq-none">${reqRow('Not assigned to an area', null, null, none, 'g', none.courses)}</div>`
      : '';
    el.innerHTML = `<section class="reqs open">${head}<div class="rq-body">${body}${unassigned}</div></section>`;
  }

  /* ───────────────────────── Hover linking ───────────────────────── */

  let focusId = null;
  function setFocus(id) {
    if (id === focusId) return;
    focusId = id;
    const tt = $('.tt');
    if (tt) tt.classList.toggle('has-focus', !!id);
    $$('.event').forEach((e) => e.classList.toggle('hl', e.dataset.course === id));
    $$('.card').forEach((e) => e.classList.toggle('hl', e.dataset.id === id));
  }

  /* ───────────────────────── Course actions ───────────────────────── */

  function cardAction(act, c) {
    const name = label(c);
    switch (act) {
      case 'fav':
        commit(() => { c.favorite = !c.favorite; });
        break;
      case 'hide':
        commit(() => { c.hidden = !c.hidden; });
        toast(c.hidden ? `${name} hidden from timetable` : `${name} back on timetable`);
        break;
      case 'advance':
        commit(() => { c.stage = Math.min(2, c.stage + 1); });
        toast(`${name} → ${STAGE_LABEL[c.stage]}`, undoAction);
        break;
      case 'demote':
        commit(() => { c.stage = Math.max(0, c.stage - 1); });
        toast(`${name} → back to ${STAGE_LABEL[c.stage]}`, undoAction);
        break;
      case 'drop':
        commit(() => { c.prevStage = c.stage; c.stage = -1; });
        toast(`Dropped ${name}`, undoAction);
        break;
      case 'restore':
        commit(() => { c.stage = c.prevStage; });
        toast(`${name} restored to ${STAGE_LABEL[c.stage]}`, undoAction);
        break;
      case 'delete':
        commit(() => { courses = courses.filter((x) => x.id !== c.id); });
        toast(`Deleted ${name}`, undoAction);
        break;
    }
  }
  const undoAction = { action: 'Undo', onAction: () => undo(true) };

  function pickSlot(c, sid) {
    const target = c.sessions.find((s) => s.id === sid);
    if (!target) return;
    commit(() => { for (const s of c.sessions) if (s.alt && s.kind === target.kind) s.chosen = s.id === sid; });
    toast(`Picked ${DAYS[target.day]} ${target.start} for ${label(c)}${target.kind ? ` ${target.kind.toLowerCase()}` : ''}`, undoAction);
  }
  function unpickSlot(c, sid) {
    const target = c.sessions.find((s) => s.id === sid);
    if (!target) return;
    commit(() => { for (const s of c.sessions) if (s.alt && s.kind === target.kind) s.chosen = false; });
  }

  function nextHue() {
    const used = new Map(HUES.map((h) => [h, 0]));
    for (const c of courses) if (used.has(c.hue)) used.set(c.hue, used.get(c.hue) + 1);
    const min = Math.min(...used.values());
    return HUES.find((h) => used.get(h) === min);
  }

  function newCourse(preset = {}) {
    const v = currentView();
    return normalize({
      name: '',
      stage: v.stage >= 0 ? v.stage : 0,
      hue: nextHue(),
      tags: [],
      sessions: [{ day: 0, start: '10:00', end: '12:00', kind: 'Lecture' }],
      ...preset,
      id: uid(),
      createdAt: Date.now(),
    });
  }

  /* ───────────────────────── Editor ───────────────────────── */

  const dlgEditor = $('#dlg-editor');
  let draft = null;
  let draftIsNew = false;

  function openEditor(id, preset) {
    const existing = id && courseById(id);
    draftIsNew = !existing;
    draft = existing ? clone(existing) : newCourse(preset);
    if (draft.name === 'Untitled course' && draftIsNew) draft.name = '';
    dlgEditor.innerHTML = editorHTML();
    renderSessions();
    renderTagInput();
    if (!dlgEditor.open) dlgEditor.showModal();
    const nameEl = $('input[name=name]', dlgEditor);
    nameEl.focus();
    if (!draftIsNew) nameEl.select();
  }

  function editorHTML() {
    const c = draft;
    const stageOpts = [0, 1, 2].concat(c.stage === -1 ? [-1] : []);
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
        <label class="field"><span>Area</span>
          <select name="area">
            <option value="">Not assigned</option>
            ${PROGRAM.groups.map((g) => `<optgroup label="${esc(g.label)}">${g.areas.map((a) =>
              `<option value="${a.key}" ${c.area === a.key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</optgroup>`).join('')}
          </select></label>
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
          <button type="button" class="btn btn-ghost btn-danger btn-sm" data-ed="delete">${icon('trash')}Delete</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ed="duplicate">${icon('copy')}Duplicate</button>`}
        <span class="spacer"></span>
        ${draftIsNew ? `<button type="button" class="btn btn-ghost" data-ed="save-another" title="Shift+Enter">Save &amp; add another</button>` : ''}
        <button type="submit" class="btn btn-primary">${draftIsNew ? 'Add course' : 'Save'}</button>
      </footer>
    </form>`;
  }

  function renderSessions() {
    const el = $('#ed-sessions', dlgEditor);
    if (!draft.sessions.length) {
      el.innerHTML = `<div class="sess-empty">No times yet. That’s fine for now, it just won’t appear on the timetable.</div>`;
      return;
    }
    el.innerHTML = draft.sessions.map((s) => `<div class="sess" data-sid="${s.id}">
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

  function allTags() {
    const m = new Map();
    for (const c of courses) for (const t of c.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }

  function renderTagInput() {
    const el = $('#ed-tags', dlgEditor);
    const prevVal = $('input', el)?.value || '';
    el.innerHTML = draft.tags.map((t, i) =>
      `<span class="tchip">${esc(t)}<button type="button" data-ed="rm-tag" data-i="${i}" aria-label="Remove ${esc(t)}">${icon('x')}</button></span>`).join('') +
      `<input placeholder="${draft.tags.length ? '' : 'Add tags, press Enter…'}" list="tag-suggest" autocomplete="off" aria-label="Add tag">`;
    $('input', el).value = prevVal;
    const others = allTags().filter((t) => !draft.tags.includes(t));
    $('#tag-suggest').innerHTML = others.map((t) => `<option value="${esc(t)}">`).join('');
    $('#ed-tag-sugg', dlgEditor).innerHTML = others.slice(0, 10).map((t) => `<button type="button" data-ed="add-tag" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  }

  function addTag(raw) {
    const parts = String(raw).split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    let added = false;
    for (const t of parts) if (!draft.tags.includes(t)) { draft.tags.push(t); added = true; }
    return added;
  }

  function syncDraft() {
    const f = $('form', dlgEditor);
    if (!f) return;
    const val = (n) => f.elements.namedItem(n).value;
    draft.name = val('name').trim();
    draft.code = val('code').trim();
    draft.credits = val('credits') === '' ? null : Math.max(0, +val('credits'));
    draft.instructor = val('instructor').trim();
    draft.area = val('area');
    draft.notes = val('notes');
    const pending = $('#ed-tags input', dlgEditor);
    if (pending && pending.value.trim()) { addTag(pending.value); pending.value = ''; }
    for (const row of $$('.sess', dlgEditor)) {
      const s = draft.sessions.find((x) => x.id === row.dataset.sid);
      if (!s) continue;
      s.day = +$('[name=day]', row).value;
      const start = $('[name=start]', row).value, end = $('[name=end]', row).value;
      s.start = parseTime(start) || start.trim();
      s.end = parseTime(end) || end.trim();
      s.kind = $('[name=kind]', row).value.trim();
      s.location = $('[name=location]', row).value.trim();
      const alt = $('[name=alt]', row).checked;
      if (!alt) s.chosen = false;
      s.alt = alt;
    }
  }

  function saveEditor(another = false) {
    syncDraft();
    const nameEl = $('input[name=name]', dlgEditor);
    let ok = true;
    if (!draft.name) { nameEl.classList.add('invalid'); nameEl.focus(); ok = false; }
    for (const row of $$('.sess', dlgEditor)) {
      const s = draft.sessions.find((x) => x.id === row.dataset.sid);
      let bad = false;
      for (const k of ['start', 'end']) {
        const unparsable = !!(s && s[k] && !parseTime(s[k]));
        $(`[name=${k}]`, row).classList.toggle('invalid', unparsable);
        bad ||= unparsable;
      }
      const backwards = !bad && s && s.start && s.end && toMin(s.end) <= toMin(s.start);
      if (backwards) $('[name=end]', row).classList.add('invalid');
      if (bad || backwards) ok = false;
    }
    if (!ok) return;

    const c = normalize(clone(draft));
    c.sessions = c.sessions.filter((s) => s.start && s.end);
    const isNew = draftIsNew;
    commit(() => {
      const i = courses.findIndex((x) => x.id === c.id);
      if (i >= 0) courses[i] = c; else courses.push(c);
    });
    toast(isNew ? `Added ${label(c)}` : `Saved ${label(c)}`, isNew ? undoAction : undefined);

    if (another) openEditor(null, { stage: c.stage < 0 ? 0 : c.stage, tags: [...c.tags] });
    else dlgEditor.close();
  }

  dlgEditor.addEventListener('submit', (e) => { e.preventDefault(); saveEditor(false); });

  dlgEditor.addEventListener('click', (e) => {
    if (e.target === dlgEditor) { dlgEditor.close(); return; }
    const hueBtn = e.target.closest('[data-hue]');
    if (hueBtn) {
      draft.hue = +hueBtn.dataset.hue;
      $$('.hue', dlgEditor).forEach((b) => b.classList.toggle('on', b === hueBtn));
      $('.ed-swatch', dlgEditor).style.setProperty('--h', draft.hue);
      return;
    }
    const stageBtn = e.target.closest('[data-stage]');
    if (stageBtn) {
      draft.stage = +stageBtn.dataset.stage;
      $$('[data-stage]', dlgEditor).forEach((b) => b.classList.toggle('on', b === stageBtn));
      return;
    }
    if (e.target.closest('#ed-tags') && e.target.id === 'ed-tags') { $('#ed-tags input', dlgEditor).focus(); return; }

    const btn = e.target.closest('[data-ed]');
    if (!btn) return;
    switch (btn.dataset.ed) {
      case 'close': dlgEditor.close(); break;
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
        $(`.sess[data-sid="${s.id}"] [name=day]`, dlgEditor).focus();
        break;
      }
      case 'rm-session': {
        syncDraft();
        const sid = btn.closest('.sess').dataset.sid;
        draft.sessions = draft.sessions.filter((s) => s.id !== sid);
        renderSessions();
        break;
      }
      case 'rm-tag':
        draft.tags.splice(+btn.dataset.i, 1);
        renderTagInput();
        $('#ed-tags input', dlgEditor).focus();
        break;
      case 'add-tag':
        addTag(btn.dataset.t);
        renderTagInput();
        break;
      case 'save-another': saveEditor(true); break;
      case 'duplicate': {
        syncDraft();
        const copy = normalize({ ...clone(draft), id: uid(), name: `${draft.name} (copy)`, createdAt: Date.now() });
        copy.sessions.forEach((s) => { s.id = uid(); });
        dlgEditor.close();
        commit(() => courses.push(copy));
        toast(`Duplicated ${label(draft)}`, undoAction);
        openEditor(copy.id);
        break;
      }
      case 'delete': {
        const c = courseById(draft.id);
        dlgEditor.close();
        if (c) cardAction('delete', c);
        break;
      }
    }
  });

  dlgEditor.addEventListener('keydown', (e) => {
    const tagInput = e.target.closest('#ed-tags input');
    if (tagInput) {
      if ((e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && tagInput.value.trim())) && tagInput.value.trim()) {
        e.preventDefault();
        addTag(tagInput.value);
        tagInput.value = '';
        renderTagInput();
        $('#ed-tags input', dlgEditor).focus();
        return;
      }
      if (e.key === 'Backspace' && !tagInput.value && draft.tags.length) {
        draft.tags.pop();
        renderTagInput();
        $('#ed-tags input', dlgEditor).focus();
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); return; }
    }
    if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey) && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveEditor(draftIsNew && e.shiftKey);
    }
  });

  dlgEditor.addEventListener('input', (e) => {
    if (e.target.classList.contains('invalid')) e.target.classList.remove('invalid');
  });

  // Moving the start time shifts the end time by the same amount, keeping the duration.
  dlgEditor.addEventListener('change', (e) => {
    if (!e.target.classList.contains('time-in')) return;
    const parsed = parseTime(e.target.value);
    if (parsed) e.target.value = parsed;
    else if (e.target.value.trim()) e.target.classList.add('invalid');
    if (e.target.name !== 'start') return;
    const row = e.target.closest('.sess');
    const endEl = $('[name=end]', row);
    const prev = e.target.dataset.prev;
    const next = e.target.value;
    if (validTime(next)) {
      if (validTime(prev) && validTime(endEl.value) && toMin(endEl.value) > toMin(prev)) {
        endEl.value = fromMin(Math.min(23 * 60 + 55, toMin(next) + toMin(endEl.value) - toMin(prev)));
      } else if (!validTime(endEl.value) || toMin(endEl.value) <= toMin(next)) {
        endEl.value = fromMin(Math.min(23 * 60 + 55, toMin(next) + 90));
      }
      e.target.dataset.prev = next;
      endEl.classList.remove('invalid');
    }
  });

  // ↑/↓ nudge a time field by 5 min (Shift: 1 h), like the native time picker did.
  dlgEditor.addEventListener('keydown', (e) => {
    if (!e.target.classList?.contains('time-in') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const cur = parseTime(e.target.value);
    const step = (e.shiftKey ? 60 : 5) * (e.key === 'ArrowUp' ? 1 : -1);
    const base = cur ? toMin(cur) : 10 * 60 - step;
    e.target.value = fromMin(Math.max(0, Math.min(23 * 60 + 55, base + step)));
    e.target.classList.remove('invalid');
    e.target.dispatchEvent(new Event('change', { bubbles: true }));
  });

  dlgEditor.addEventListener('focusout', (e) => {
    const tagInput = e.target.closest?.('#ed-tags input');
    if (tagInput && tagInput.value.trim() && !dlgEditor.contains(e.relatedTarget?.closest?.('[data-ed="rm-tag"]'))) {
      if (addTag(tagInput.value)) { tagInput.value = ''; renderTagInput(); }
    }
  });

  /* ───────────────────────── Review (wave triage) ───────────────────────── */

  const dlgReview = $('#dlg-review');
  let review = null;

  function startReview() {
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
    dlgReview.showModal();
  }

  function renderReview() {
    const r = review;
    const v = VIEWS.find((x) => x.key === r.viewKey);
    while (r.i < r.ids.length && !courseById(r.ids[r.i])) r.i++;

    if (r.i >= r.ids.length) {
      const t = { advance: 0, keep: 0, drop: 0 };
      for (const l of r.log) t[l.type]++;
      const next = VIEWS.find((x) => x.stage === r.stage + 1);
      dlgReview.innerHTML = `<div class="rv"><div class="rv-done">
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

    const c = courseById(r.ids[r.i]);
    const others = courses.filter((x) => x.id !== c.id && inView(x, v) && !x.hidden);
    const items = computeConflicts(others).items;
    const sessions = c.sessions.filter(validSession).sort(byDayTime);
    const hrs = weeklyMinutes(c) / 60;
    const next = STAGE_LABEL[r.stage + 1];

    const facts = [
      c.credits != null ? `<span>${icon('award')}${fmtHours(c.credits)} credits</span>` : '',
      hrs ? `<span>${icon('clock')}${fmtHours(hrs)} h / week</span>` : '',
      c.instructor ? `<span>${icon('user')}${esc(c.instructor)}</span>` : '',
      c.area ? `<span>${icon('layers')}${esc(AREAS.get(c.area).label)}</span>` : '',
    ].join('');

    dlgReview.innerHTML = `<div class="rv">
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
            ? `<span class="flag clash" title="${esc(clash.map((x) => x.name).join(', '))}">overlaps ${esc(clash.map(label).join(', '))}</span>`
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

  function reviewDecide(type) {
    const r = review;
    const c = courseById(r.ids[r.i]);
    if (!c) return;
    if (type === 'keep') {
      r.log.push({ type, changed: false });
    } else {
      commit(() => {
        if (type === 'advance') c.stage = Math.min(2, c.stage + 1);
        if (type === 'drop') { c.prevStage = c.stage; c.stage = -1; }
      });
      r.log.push({ type, changed: true });
    }
    r.i++;
    renderReview();
  }

  function reviewBack() {
    const r = review;
    const last = r.log.pop();
    if (!last) return;
    if (last.changed) undo(true);
    r.i = Math.max(0, r.i - 1);
    // Skip back over any courses that were deleted meanwhile.
    while (r.i > 0 && !courseById(r.ids[r.i])) r.i--;
    renderReview();
  }

  dlgReview.addEventListener('click', (e) => {
    if (e.target === dlgReview) { dlgReview.close(); return; }
    const btn = e.target.closest('[data-rv]');
    if (!btn) return;
    const act = btn.dataset.rv;
    if (act === 'close') dlgReview.close();
    else if (act === 'back') reviewBack();
    else if (act === 'goto') { dlgReview.close(); setUi({ view: btn.dataset.view }); }
    else if (act === 'fav') {
      const c = courseById(review.ids[review.i]);
      commit(() => { c.favorite = !c.favorite; });
      btn.classList.toggle('on', c.favorite);
    } else if (act === 'edit') {
      const id = review.ids[review.i];
      dlgReview.close();
      openEditor(id);
    } else reviewDecide(act);
  });

  dlgReview.addEventListener('keydown', (e) => {
    if (!review || e.metaKey || e.ctrlKey || e.altKey) return;
    const done = review.i >= review.ids.length;
    const k = e.key.toLowerCase();
    if (!done && (k === 'arrowleft' || k === 'd')) { e.preventDefault(); reviewDecide('drop'); }
    else if (!done && (k === 'arrowdown' || k === 'k' || k === ' ')) { e.preventDefault(); reviewDecide('keep'); }
    else if (!done && (k === 'arrowright' || k === 'a') && review.stage < 2) { e.preventDefault(); reviewDecide('advance'); }
    else if (!done && k === 'f') { e.preventDefault(); $('[data-rv=fav]', dlgReview)?.click(); }
    else if (k === 'backspace' || k === 'z' || k === 'arrowup') { e.preventDefault(); reviewBack(); }
    else if (k === 'enter' && done) { e.preventDefault(); ($('[data-rv=goto]', dlgReview) || $('[data-rv=close]', dlgReview)).click(); }
  });

  /* ───────────────────────── Choice dialog ───────────────────────── */

  const dlgChoice = $('#dlg-choice');
  function choose({ title, body, options }) {
    return new Promise((resolve) => {
      dlgChoice.innerHTML = `<div class="dlg-inner">
        <div class="choice-body"><h2>${esc(title)}</h2><p>${body}</p></div>
        <div class="choice-foot">${options.map((o) =>
          `<button class="btn ${o.primary ? 'btn-primary' : ''} ${o.danger ? 'btn-danger' : ''}" data-choice="${o.value}">${esc(o.label)}</button>`).join('')}</div>
      </div>`;
      const done = (v) => { dlgChoice.close(); resolve(v); };
      dlgChoice.onclick = (e) => {
        if (e.target === dlgChoice) return done(null);
        const b = e.target.closest('[data-choice]');
        if (b) done(b.dataset.choice);
      };
      dlgChoice.oncancel = () => resolve(null);
      dlgChoice.showModal();
      $$('[data-choice]', dlgChoice).at(-1).focus();
    });
  }

  /* ───────────────────────── Menu ───────────────────────── */

  const menu = $('#menu');
  const menuBtn = $('#btn-menu');

  function renderMenu() {
    const themeBtn = (t, ic, l) => `<button data-theme-set="${t}" class="${ui.theme === t ? 'on' : ''}">${icon(ic)}${l}</button>`;
    menu.innerHTML = `
      <div class="menu-label">Appearance</div>
      <div class="menu-theme">${themeBtn('light', 'sun', 'Light')}${themeBtn('dark', 'moon', 'Dark')}${themeBtn('system', 'monitor', 'Auto')}</div>
      <button class="menu-item" data-menu="weekend">${icon('calendar')}Always show weekend<span class="end"><span class="switch ${ui.weekend ? 'on' : ''}"></span></span></button>
      <div class="menu-sep"></div>
      <button class="menu-item" data-menu="print">${icon('printer')}Print / save as PDF</button>
      <button class="menu-item" data-menu="ics">${icon('calendar')}Export final wave to calendar (.ics)</button>
      <button class="menu-item" data-menu="export">${icon('download')}Export backup (.json)</button>
      <button class="menu-item" data-menu="import">${icon('upload')}Import backup…</button>
      <div class="menu-sep"></div>
      <button class="menu-item" data-menu="example">${icon('sparkle')}Add example courses</button>
      <button class="menu-item" data-menu="undo">${icon('undo')}Undo<span class="end"><kbd>Ctrl</kbd><kbd>Z</kbd></span></button>
      <button class="menu-item danger" data-menu="clear">${icon('trashAll')}Delete all courses</button>
      <div class="menu-sep"></div>
      <div class="menu-foot">
        <span><kbd>N</kbd> new</span><span><kbd>/</kbd> search</span><span><kbd>R</kbd> review</span><span><kbd>1</kbd>–<kbd>4</kbd> waves</span>
      </div>`;
  }

  function toggleMenu(open = menu.hidden) {
    if (open) renderMenu();
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) toggleMenu(false); });

  menu.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-theme-set]');
    if (t) { ui.theme = t.dataset.themeSet; saveUi(); applyTheme(); renderMenu(); return; }
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    const act = item.dataset.menu;
    if (act === 'weekend') { setUi({ weekend: !ui.weekend }); renderMenu(); return; }
    toggleMenu(false);
    if (act === 'print') window.print();
    else if (act === 'export') exportJSON();
    else if (act === 'ics') exportICS();
    else if (act === 'import') $('#import-file').click();
    else if (act === 'example') loadExamples();
    else if (act === 'undo') undo();
    else if (act === 'clear') {
      if (!courses.length) return toast('Nothing to delete');
      const v = await choose({
        title: 'Delete all courses?',
        body: `This removes all ${plural(courses.length, 'course')}. You can still undo right after, but consider exporting a backup first.`,
        options: [{ value: 'cancel', label: 'Cancel' }, { value: 'ok', label: 'Delete all', primary: true }],
      });
      if (v === 'ok') { commit(() => { courses = []; }); toast('All courses deleted', undoAction); }
    }
  });

  /* ───────────────────────── Import / export ───────────────────────── */

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  function exportJSON() {
    download(`uniplan-${today()}.json`, JSON.stringify({ app: 'uniplan', version: 1, exportedAt: new Date().toISOString(), courses }, null, 2), 'application/json');
    toast(`Exported ${plural(courses.length, 'course')}`);
  }

  // Weekly recurring events starting this week (or next, if the week is mostly over), for 15 weeks.
  function exportICS() {
    const final = courses.filter((c) => c.stage === 2 && !c.hidden);
    const list = final.length ? final : derive().table;
    if (!list.length) return toast('No courses to export');
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = (d, t) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${t.replace(':', '')}00`;
    const icsEsc = (s) => String(s).replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Uniplan//EN', 'CALSCALE:GREGORIAN'];
    for (const c of list) for (const s of c.sessions.filter((x) => isActive(x) && validSession(x))) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + s.day);
      lines.push('BEGIN:VEVENT', `UID:${s.id}-${c.id}@uniplan`, `DTSTAMP:${now}`,
        `DTSTART:${stamp(day, s.start)}`, `DTEND:${stamp(day, s.end)}`, 'RRULE:FREQ=WEEKLY;COUNT=15',
        `SUMMARY:${icsEsc([c.name, s.kind && `(${s.kind})`].filter(Boolean).join(' '))}`,
        s.location ? `LOCATION:${icsEsc(s.location)}` : '',
        `DESCRIPTION:${icsEsc([c.code, c.instructor, c.notes].filter(Boolean).join('\n'))}`,
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    download(`uniplan-${today()}.ics`, lines.filter(Boolean).join('\r\n'), 'text/calendar');
    toast(final.length ? `Exported ${plural(final.length, 'final course')} (15 weekly repeats)` : 'No final courses yet, exported what’s on screen');
  }

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      const data = JSON.parse(await file.text());
      incoming = (Array.isArray(data) ? data : data.courses || []).map(normalize).filter(Boolean);
    } catch {
      return toast('That file doesn’t look like a Uniplan backup');
    }
    if (!incoming.length) return toast('No courses found in that file');
    let mode = 'replace';
    if (courses.length) {
      mode = await choose({
        title: `Import ${plural(incoming.length, 'course')}?`,
        body: `You already have ${plural(courses.length, 'course')}. Merge keeps both (matching courses get updated), replace swaps everything out.`,
        options: [{ value: 'cancel', label: 'Cancel' }, { value: 'replace', label: 'Replace' }, { value: 'merge', label: 'Merge', primary: true }],
      });
    }
    if (mode !== 'replace' && mode !== 'merge') return;
    commit(() => {
      if (mode === 'replace') courses = incoming;
      else for (const c of incoming) {
        const i = courses.findIndex((x) => x.id === c.id);
        if (i >= 0) courses[i] = c; else courses.push(c);
      }
    });
    toast(`Imported ${plural(incoming.length, 'course')}`, undoAction);
  });

  /* ───────────────────────── Example data ───────────────────────── */

  function loadExamples() {
    const S = (day, start, end, kind, location = '', alt = false) => ({ day, start, end, kind, location, alt });
    const ex = [
      { name: 'Machine Learning', code: 'CS 4780', area: 'ki', credits: 8, instructor: 'Prof. Weinberger', hue: 255, favorite: true, stage: 1, tags: ['AI', 'core'],
        notes: 'Written exam at the end. Needs linear algebra + probability.',
        sessions: [S(0, '10:15', '12:00', 'Lecture', 'HG E 7'), S(2, '10:15', '12:00', 'Lecture', 'HG E 7'),
          S(3, '14:15', '16:00', 'Exercise', 'CAB G 61', true), S(4, '10:15', '12:00', 'Exercise', 'CAB G 52', true)] },
      { name: 'Algorithms & Data Structures II', area: 'theory', code: 'CS 2110', credits: 7, instructor: 'Prof. Kleinberg', hue: 195, stage: 1, tags: ['core', 'theory'],
        sessions: [S(1, '08:15', '10:00', 'Lecture', 'ML D 28'), S(3, '08:15', '10:00', 'Lecture', 'ML D 28'), S(1, '16:15', '17:00', 'Exercise', 'LEE C 104')] },
      { name: 'Computer Vision', area: 'ki', code: 'CS 4670', credits: 6, hue: 330, stage: 0, tags: ['AI', 'elective'],
        notes: 'Project-based, no final exam. Overlaps ML lecture on Monday though.',
        sessions: [S(0, '10:15', '12:00', 'Lecture', 'CAB G 11'), S(2, '16:15', '18:00', 'Exercise', 'CAB H 52')] },
      { name: 'Human-Computer Interaction', area: 'swhw', code: 'INFO 3450', credits: 5, hue: 50, favorite: true, stage: 0, tags: ['design', 'elective'],
        sessions: [S(1, '13:15', '15:00', 'Lecture', 'IFW A 36'), S(1, '15:15', '16:00', 'Exercise', 'IFW A 36')] },
      { name: 'Philosophy of Mind', area: 'mgw', code: 'PHIL 2600', credits: 3, hue: 25, stage: 0, tags: ['humanities', 'minor'],
        sessions: [S(2, '14:15', '16:00', 'Seminar', 'RZ F 21')] },
      { name: 'Distributed Systems', area: 'kvs', code: 'CS 5414', credits: 6, instructor: 'Prof. Birman', hue: 140, stage: 0, tags: ['systems', 'core'],
        sessions: [S(3, '10:15', '12:00', 'Lecture', 'HG F 1'), S(4, '13:15', '15:00', 'Lab', 'CAB H 56')] },
      { name: 'Entrepreneurship & Startups', area: 'mgw', code: 'MGT 3300', credits: 4, hue: 75, stage: 0, tags: ['business', 'minor'],
        sessions: [S(2, '17:15', '19:00', 'Lecture', 'HG E 3')] },
      { name: 'Japanese I', area: 'lang', code: 'LANG 1101', credits: 3, hue: 0, stage: 0, tags: ['language'],
        sessions: [S(0, '18:00', '19:30', 'Seminar', 'Language Center'), S(3, '18:00', '19:30', 'Seminar', 'Language Center')] },
      { name: 'Information Security', area: 'cyber', code: 'CS 5430', credits: 6, hue: 225, stage: 0, tags: ['systems', 'elective'],
        sessions: [S(1, '10:15', '12:00', 'Lecture', 'NO C 60'), S(2, '08:15', '10:00', 'Exercise', 'CHN D 46', true), S(4, '08:15', '10:00', 'Exercise', 'CHN D 48', true)] },
      { name: 'Data Visualization', area: 'swhw', code: 'INFO 4310', credits: 4, hue: 165, stage: 0, tags: ['design', 'AI'],
        sessions: [S(4, '10:15', '12:00', 'Lecture', 'IFW B 42')] },
      { name: 'Game Theory', area: 'mgw', code: 'ECON 3610', credits: 5, hue: 105, stage: -1, prevStage: 0, tags: ['theory', 'business'],
        sessions: [S(0, '14:15', '16:00', 'Lecture', 'HG D 7')] },
      { name: 'Robotics Seminar', area: 'seminar', code: 'MAE 4180', credits: 3, hue: 295, stage: 0, tags: ['AI', 'elective'],
        notes: 'Times not announced yet.', sessions: [] },
    ];
    commit(() => { courses.push(...ex.map((c) => normalize({ ...c, id: uid() }))); });
    toast(`Added ${ex.length} example courses`, undoAction);
  }

  /* ───────────────────────── Toasts ───────────────────────── */

  function toast(msg, opts = {}) {
    const host = $('#toasts');
    while (host.children.length >= 3) host.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ''}`;
    host.appendChild(el);
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    const timer = setTimeout(kill, opts.action ? 5000 : 2400);
    if (opts.action) $('button', el).addEventListener('click', () => { clearTimeout(timer); kill(); opts.onAction(); });
  }

  /* ───────────────────────── Theme ───────────────────────── */

  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = ui.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : ui.theme;
    document.documentElement.dataset.theme = t;
  }
  darkQuery.addEventListener('change', applyTheme);

  /* ───────────────────────── Global events ───────────────────────── */

  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  $('#btn-add').addEventListener('click', () => openEditor());
  $('#btn-review').addEventListener('click', startReview);

  $('#waves').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setUi({ view: b.dataset.view });
  });

  const search = $('#search');
  search.value = ui.search;
  search.addEventListener('input', () => setUi({ search: search.value }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; setUi({ search: '' }); search.blur(); }
  });

  function onFilterClick(e) {
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      const t = tagBtn.dataset.tag;
      setUi({ tags: ui.tags.includes(t) ? ui.tags.filter((x) => x !== t) : [...ui.tags, t] });
      return true;
    }
    const f = e.target.closest('[data-filter]');
    if (!f) return false;
    if (f.dataset.filter === 'fav') setUi({ favOnly: !ui.favOnly });
    if (f.dataset.filter === 'conf') setUi({ conflictsOnly: !ui.conflictsOnly });
    if (f.dataset.filter === 'clear') { search.value = ''; setUi({ favOnly: false, conflictsOnly: false, tags: [], search: '' }); }
    return true;
  }
  $('#filters').addEventListener('click', onFilterClick);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="new"], [data-act="example"]');
    if (!a) return;
    if (a.dataset.act === 'new') openEditor(); else loadExamples();
  });

  $('#course-list').addEventListener('click', (e) => {
    if (onFilterClick(e)) return;
    const card = e.target.closest('.card');
    if (!card) return;
    const c = courseById(card.dataset.id);
    if (!c) return;
    const act = e.target.closest('[data-act]');
    if (act) { e.stopPropagation(); cardAction(act.dataset.act, c); return; }
    openEditor(c.id);
  });
  $('#course-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) openEditor(e.target.dataset.id);
  });

  $('#timetable').addEventListener('click', (e) => {
    const ev = e.target.closest('.event');
    if (!ev) return;
    const c = courseById(ev.dataset.course);
    if (!c) return;
    if (e.target.closest('[data-act="unpick"]')) unpickSlot(c, ev.dataset.session);
    else if (ev.dataset.ghost) pickSlot(c, ev.dataset.session);
    else openEditor(c.id);
  });

  $('#unscheduled').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openEditor(b.dataset.edit);
  });

  $('#reqs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openEditor(b.dataset.edit);
    else if (e.target.closest('[data-reqs="toggle"]')) setUi({ reqsOpen: !ui.reqsOpen });
  });

  for (const sel of ['#course-list', '#timetable']) {
    const host = $(sel);
    host.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-id], [data-course]');
      setFocus(t ? t.dataset.id || t.dataset.course : null);
    });
    host.addEventListener('mouseleave', () => setFocus(null));
  }

  document.addEventListener('keydown', (e) => {
    const dialogOpen = $$('dialog').some((d) => d.open);
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing && !dialogOpen) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.key === 'Escape' && !menu.hidden) { toggleMenu(false); return; }
    if (typing || dialogOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); openEditor(); }
    else if (k === '/') { e.preventDefault(); search.focus(); search.select(); }
    else if (k === 'r') { e.preventDefault(); startReview(); }
    else if (['1', '2', '3', '4'].includes(k)) setUi({ view: VIEWS[+k - 1].key });
  });

  dlgEditor.addEventListener('close', () => { draft = null; });
  dlgReview.addEventListener('close', () => { review = null; });

  // Keep the "now" line roughly current.
  setInterval(() => { if (!$$('dialog').some((d) => d.open)) renderTimetable(derive()); }, 5 * 60 * 1000);

  applyTheme();
  render();
})();
