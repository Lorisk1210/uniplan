import { describe, expect, it } from 'vitest';
import {
  buildICS, computeConflicts, finalEntries, layoutDay, normalizeCourse, normalizeData, planEntries,
  summarizeSemester, tallyCredits, type Course,
} from '../src';

const course = (patch: Record<string, unknown>): Course => normalizeCourse({ name: 'C', ...patch })!;

describe('conflicts', () => {
  const a = course({ id: 'a', sessions: [{ id: 'a1', day: 0, start: '10:00', end: '12:00' }] });
  const b = course({ id: 'b', sessions: [{ id: 'b1', day: 0, start: '11:00', end: '13:00' }, { id: 'b2', day: 1, start: '10:00', end: '12:00' }] });

  it('finds overlapping sessions of different courses', () => {
    const conf = computeConflicts([a, b]);
    expect(conf.pairs).toBe(1);
    expect([...conf.byCourse.get('a')!]).toEqual(['b']);
    expect(conf.bySession.has('b2')).toBe(false);
  });

  it('ignores unpicked option slots until one is chosen', () => {
    const opt = course({ id: 'o', sessions: [
      { id: 'o1', day: 0, start: '10:00', end: '11:00', kind: 'Tutorial', alt: true },
      { id: 'o2', day: 2, start: '10:00', end: '11:00', kind: 'Tutorial', alt: true },
    ] });
    expect(computeConflicts([a, opt]).pairs).toBe(0);
    opt.sessions[0].chosen = true;
    expect(computeConflicts([a, opt]).pairs).toBe(1);
  });

  it('lays overlapping events out side by side', () => {
    const laid = layoutDay([{ a: 600, b: 720 }, { a: 660, b: 780 }, { a: 800, b: 860 }]);
    expect(laid.map((e) => [e.lane, e.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});

describe('credits', () => {
  const data = normalizeData({ semesters: [
    { id: 's1', name: 'SoSe 2026', courses: [
      { name: 'Done', credits: 6, stage: 2, area: 'theory' },
      { name: 'Idea', credits: 5, stage: 0, area: 'theory' },
      { name: 'Hidden final', credits: 3, stage: 2, hidden: true, area: 'mgw' },
    ] },
    { id: 's2', name: 'WiSe 2026/27', courses: [
      { name: 'Planned', credits: 8, stage: 2, area: 'ki' },
      { name: 'Maybe', credits: 4, stage: 1, area: 'gone' },
      { name: 'Hidden maybe', credits: 4, stage: 1, hidden: true },
      { name: 'Dropped', credits: 9, stage: -1, area: 'ki' },
    ] },
  ] });

  it('counts only Final courses for the whole degree', () => {
    const t = tallyCredits(data.program, finalEntries(data));
    expect(t.total.all).toBe(17);
    expect(t.total.firm).toBe(17);
    expect(t.area('theory').all).toBe(6);
    expect(t.area('ki').all).toBe(8);
    const basis = data.program.groups.find((g) => g.key === 'basis')!;
    expect(t.group(basis).all).toBe(6);
  });

  it('adds a semester plan on top of Final courses from other semesters', () => {
    const s2 = data.semesters[1];
    const t = tallyCredits(data.program, planEntries(data, s2, 1));
    // own: Planned 8 (firm) + Maybe 4 (tentative); others: Done 6 + Hidden final 3
    expect(t.total.all).toBe(21);
    expect(t.total.firm).toBe(17);
    expect(t.area('').all).toBe(4);
    expect(t.area('theory').entries.every((e) => e.other)).toBe(true);
  });

  it('summarizes a semester', () => {
    expect(summarizeSemester(data.semesters[0])).toEqual({ credits: 9, final: 2, missingCredits: 0, open: 1 });
  });
});

describe('ics', () => {
  const c = course({ id: 'c', name: 'ML, advanced', code: 'CS1', sessions: [
    { id: 's', day: 2, start: '10:15', end: '12:00', kind: 'Lecture', location: 'HG; E 7' },
    { id: 't', day: 4, start: '', end: '' },
  ] });

  it('starts on the first matching weekday of the lecture period', () => {
    const ics = buildICS([c], { name: 'WiSe', start: '2026-10-19', end: '2027-02-12', now: new Date(2026, 9, 1) });
    expect(ics).toContain('DTSTART:20261021T101500');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270212T235959');
    expect(ics).toContain('SUMMARY:ML\\, advanced (Lecture)');
    expect(ics).toContain('LOCATION:HG\\; E 7');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('repeats 15 times from this week without a lecture period', () => {
    const ics = buildICS([c], { now: new Date(2026, 9, 22) });
    expect(ics).toContain('DTSTART:20261021T101500');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=15');
  });

  it('can start the 15 weeks on a given day instead', () => {
    const ics = buildICS([c], { from: '2027-04-01', now: new Date(2026, 9, 22) });
    expect(ics).toContain('DTSTART:20270407T101500');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=15');
  });

  it('folds long lines', () => {
    const long = course({ name: 'Übung '.repeat(40), sessions: [{ day: 0, start: '10:00', end: '11:00' }] });
    const lines = buildICS([long]).split('\r\n');
    expect(lines.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
  });

  it('builds an empty calendar for no courses', () => {
    expect(buildICS([])).toBe('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Uniplan//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n');
  });
});
