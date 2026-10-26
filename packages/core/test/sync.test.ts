import { describe, expect, it } from 'vitest';
import { canonicalItems, fromItems, mergeItems, newSemester, normalizeCourse, normalizeData, toItems, type PlanData } from '../src';

const course = (id: string, name: string, createdAt = 1) => normalizeCourse({ id, name, createdAt })!;
const plan = (...courses: ReturnType<typeof course>[]): PlanData =>
  normalizeData({ version: 2, semesters: [newSemester('WiSe 2026/27', { id: 's1', createdAt: 1, courses })] });

describe('toItems and fromItems', () => {
  it('splits a plan into one item per program, semester and course, and puts it back together', () => {
    const data = plan(course('b', 'Second', 2), course('a', 'First', 1));
    const items = toItems(data);
    expect([...items.keys()]).toEqual(['program', 'semester:s1', 'course:b', 'course:a']);
    expect(JSON.parse(items.get('course:a')!)).toMatchObject({ name: 'First', semesterId: 's1' });
    const back = fromItems(items);
    expect(back.program).toEqual(data.program);
    // Courses come back in the order they were created.
    expect(back.semesters[0].courses.map((c) => c.name)).toEqual(['First', 'Second']);
  });

  it('keeps a course whose semester is gone in a semester of its own', () => {
    const items = toItems(plan(course('a', 'Orphan')));
    items.delete('semester:s1');
    const back = fromItems(items);
    expect(back.semesters).toHaveLength(1);
    expect(back.semesters[0]).toMatchObject({ id: 's1', name: 'Recovered courses' });
    expect(back.semesters[0].courses[0].name).toBe('Orphan');
  });

  it('skips items that aren’t JSON objects', () => {
    const items = toItems(plan(course('a', 'Fine')));
    items.set('course:bad', 'not json');
    expect(fromItems(items).semesters[0].courses).toHaveLength(1);
  });

  it('writes the same items again after a round trip, so nothing looks changed', () => {
    const items = toItems(plan(course('a', 'A'), course('b', 'B', 2)));
    expect(canonicalItems(items)).toEqual(items);
  });
});

describe('mergeItems', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o));

  it('keeps changes from both sides to different items and sends only this device’s', () => {
    const base = m({ a: '1', b: '1', c: '1' });
    const local = m({ a: '2', b: '1', c: '1', d: 'new' });
    const remote = m({ a: '1', b: '3' });
    const r = mergeItems(base, local, remote);
    expect(Object.fromEntries(r.merged)).toEqual({ a: '2', b: '3', d: 'new' });
    expect(r.put).toEqual([['a', '2'], ['d', 'new']]);
    expect(r.remove).toEqual([]);
  });

  it('sends this device’s deletes', () => {
    const r = mergeItems(m({ a: '1', b: '1' }), m({ a: '1' }), m({ a: '1', b: '1' }));
    expect([...r.merged.keys()]).toEqual(['a']);
    expect(r.remove).toEqual(['b']);
  });

  it('prefers this device’s edit when both changed an item, and an edit over a delete', () => {
    expect(mergeItems(m({ a: '1' }), m({ a: 'mine' }), m({ a: 'theirs' })).merged.get('a')).toBe('mine');
    expect(mergeItems(m({ a: '1' }), m({}), m({ a: 'theirs' })).merged.get('a')).toBe('theirs');
    const r = mergeItems(m({ a: '1' }), m({ a: 'mine' }), m({}));
    expect(r.merged.get('a')).toBe('mine');
    expect(r.put).toEqual([['a', 'mine']]);
  });

  it('on a first sync, lets the server win and keeps what only this device has', () => {
    const r = mergeItems(null, m({ a: 'mine', only: 'here' }), m({ a: 'theirs', b: 'theirs' }));
    expect(Object.fromEntries(r.merged)).toEqual({ a: 'theirs', only: 'here', b: 'theirs' });
    expect(r.put).toEqual([['only', 'here']]);
  });

  it('has nothing to send once both sides agree', () => {
    const items = m({ a: '1', b: '2' });
    const r = mergeItems(items, new Map(items), new Map(items));
    expect(r.put).toEqual([]);
    expect(r.remove).toEqual([]);
  });
});
