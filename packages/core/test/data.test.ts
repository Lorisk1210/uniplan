import { describe, expect, it } from 'vitest';
import {
  defaultProgram, mergeById, mergeData, normalizeData, normalizeProgram, parseBackup, serializeBackup,
} from '../src';

const oct = new Date(2026, 9, 20);

describe('normalizeData', () => {
  it('moves version 1 courses into a semester named after the current term', () => {
    const data = normalizeData([{ id: 'a', name: 'ML', stage: 2, credits: '6', sessions: [{ day: 1, start: '9:15', end: '10:00' }] }], oct);
    expect(data.version).toBe(2);
    expect(data.semesters).toHaveLength(1);
    expect(data.semesters[0].name).toBe('WiSe 2026/27');
    const [c] = data.semesters[0].courses;
    expect(c).toMatchObject({ id: 'a', name: 'ML', stage: 2, credits: 6 });
    expect(c.sessions[0]).toMatchObject({ day: 1, start: '09:15', end: '10:00', kind: 'Lecture' });
  });

  it('reads version 1 backup files', () => {
    const data = normalizeData({ app: 'uniplan', version: 1, courses: [{ name: 'X' }] }, oct);
    expect(data.semesters[0].courses[0].name).toBe('X');
  });

  it('creates no semester for an empty version 1 list', () => {
    expect(normalizeData([]).semesters).toEqual([]);
  });

  it('falls back to empty data for garbage', () => {
    for (const raw of [null, 42, 'x', {}]) {
      const data = normalizeData(raw);
      expect(data.semesters).toEqual([]);
      expect(data.program.name).toBe('M.Sc. Informatik');
    }
  });

  it('keeps unknown area keys so changing the requirements never loses assignments', () => {
    const data = normalizeData({ semesters: [{ name: 'S', courses: [{ name: 'A', area: 'gone' }] }] });
    expect(data.semesters[0].courses[0].area).toBe('gone');
  });

  it('drops invalid lecture dates and an end before the start', () => {
    const data = normalizeData({ semesters: [
      { name: 'A', start: '2026-02-30', end: '2026-07-01' },
      { name: 'B', start: '2026-04-13', end: '2026-01-01' },
      { name: 'C', start: '2026-04-13', end: '2026-07-17' },
    ] });
    expect(data.semesters.map((s) => [s.start, s.end])).toEqual([['', '2026-07-01'], ['2026-04-13', ''], ['2026-04-13', '2026-07-17']]);
  });

  it('gives duplicate semester ids a fresh one', () => {
    const data = normalizeData({ semesters: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }] });
    expect(data.semesters[0].id).toBe('x');
    expect(data.semesters[1].id).not.toBe('x');
  });

  it('round-trips through JSON', () => {
    const data = normalizeData({ semesters: [{ name: 'SoSe 2026', courses: [{ name: 'A', tags: ['x', 'x', ' y '] }] }] });
    expect(data.semesters[0].courses[0].tags).toEqual(['x', 'y']);
    expect(normalizeData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});

describe('normalizeProgram', () => {
  it('fills in missing keys and keeps max at or above min', () => {
    const p = normalizeProgram({ name: '', total: '90', groups: [
      { label: 'Core', min: 30, max: 10, areas: [{ label: 'Theory' }, { label: 'Theory', min: 6, max: '' }] },
    ] });
    expect(p.name).toBe('My degree');
    expect(p.total).toBe(90);
    expect(p.groups[0]).toMatchObject({ key: 'core', min: 30, max: 30 });
    expect(p.groups[0].areas.map((a) => [a.key, a.short, a.min, a.max])).toEqual([['theory', 'Theory', 0, null], ['theory-2', 'Theory', 6, null]]);
  });

  it('never hands an existing key to a new area', () => {
    const p = normalizeProgram({ groups: [{ label: 'G', areas: [{ label: 'Theory' }, { key: 'theory', label: 'Old theory' }] }] });
    expect(p.groups[0].areas.map((a) => a.key)).toEqual(['theory-2', 'theory']);
  });

  it('defaults to the TU Darmstadt preset', () => {
    expect(normalizeProgram(undefined)).toEqual(defaultProgram());
  });
});

describe('backups', () => {
  it('parses full backups and version 1 course lists', () => {
    const data = normalizeData({ semesters: [{ name: 'A', courses: [{ name: 'X' }] }] });
    const full = parseBackup(serializeBackup(data));
    expect(full.kind).toBe('full');
    if (full.kind === 'full') expect(full.data.semesters[0].courses[0].name).toBe('X');
    const v1 = parseBackup(JSON.stringify({ app: 'uniplan', version: 1, courses: [{ name: 'Y' }] }));
    expect(v1.kind).toBe('courses');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });

  it('merges by id', () => {
    expect(mergeById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }]))
      .toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 2 }]);
  });

  it('keeps the current requirements when merging', () => {
    const current = normalizeData({ program: { name: 'Mine', total: 1 }, semesters: [{ id: 's1', name: 'A' }] });
    const incoming = normalizeData({ program: { name: 'Theirs', total: 2 }, semesters: [{ id: 's1', name: 'A2' }, { id: 's2', name: 'B' }] });
    const merged = mergeData(current, incoming);
    expect(merged.program.name).toBe('Mine');
    expect(merged.semesters.map((s) => s.name)).toEqual(['A2', 'B']);
  });
});
