import { describe, expect, it } from 'vitest';
import {
  newSemester, nextTerm, parseTermName, pickDefaultSemester, semesterStatus, shortSemesterName, sortSemesters, suggestSemesterName,
  termAt, termName,
} from '../src';

describe('terms', () => {
  it('maps dates to winter and summer terms', () => {
    expect(termAt(new Date(2026, 0, 15))).toEqual({ kind: 'winter', year: 2025 });
    expect(termAt(new Date(2026, 2, 31))).toEqual({ kind: 'winter', year: 2025 });
    expect(termAt(new Date(2026, 3, 1))).toEqual({ kind: 'summer', year: 2026 });
    expect(termAt(new Date(2026, 8, 30))).toEqual({ kind: 'summer', year: 2026 });
    expect(termAt(new Date(2026, 9, 1))).toEqual({ kind: 'winter', year: 2026 });
  });

  it('names and steps terms', () => {
    expect(termName({ kind: 'winter', year: 2099 })).toBe('WiSe 2099/00');
    expect(termName(nextTerm({ kind: 'winter', year: 2025 }))).toBe('SoSe 2026');
    expect(termName(nextTerm({ kind: 'summer', year: 2026 }))).toBe('WiSe 2026/27');
  });

  it('parses common spellings', () => {
    expect(parseTermName('WiSe 2025/26')).toEqual({ kind: 'winter', year: 2025 });
    expect(parseTermName('WS 25/26')).toEqual({ kind: 'winter', year: 2025 });
    expect(parseTermName('SS26')).toEqual({ kind: 'summer', year: 2026 });
    expect(parseTermName('Sommersemester 2026')).toEqual({ kind: 'summer', year: 2026 });
    expect(parseTermName('Winter 2024')).toEqual({ kind: 'winter', year: 2024 });
    expect(parseTermName('Exchange in Japan')).toBeNull();
  });

  it('abbreviates names for chips', () => {
    expect(shortSemesterName('WiSe 2026/27')).toBe('WS 26/27');
    expect(shortSemesterName('SoSe 2009')).toBe('SS 09');
    expect(shortSemesterName('Exchange in Japan')).toBe('Exchange…');
    expect(shortSemesterName('Gap year')).toBe('Gap year');
  });
});

describe('semesters', () => {
  const now = new Date(2026, 9, 20);

  it('suggests the current term, then the next free one', () => {
    expect(suggestSemesterName([], now)).toBe('WiSe 2026/27');
    expect(suggestSemesterName([newSemester('WiSe 2026/27'), newSemester('sose 2027')], now)).toBe('WiSe 2027/28');
  });

  it('derives the status from dates or the term in the name', () => {
    expect(semesterStatus(newSemester('SoSe 2026'), now)).toBe('past');
    expect(semesterStatus(newSemester('WiSe 2026/27'), now)).toBe('current');
    expect(semesterStatus(newSemester('Anything', { start: '2026-10-21', end: '2027-02-12' }), now)).toBe('upcoming');
    expect(semesterStatus(newSemester('Exchange'), now)).toBeNull();
  });

  it('sorts chronologically, undated last', () => {
    const a = newSemester('Exchange', { createdAt: 1 });
    const b = newSemester('WiSe 2026/27', { createdAt: 2 });
    const c = newSemester('SoSe 2026', { createdAt: 3 });
    const d = newSemester('X', { start: '2026-05-01', end: '2026-06-01', createdAt: 4 });
    expect(sortSemesters([a, b, c, d]).map((s) => s.name)).toEqual(['SoSe 2026', 'X', 'WiSe 2026/27', 'Exchange']);
  });

  it('opens the running semester, else the next one, else the latest', () => {
    const past = newSemester('SoSe 2026');
    const cur = newSemester('WiSe 2026/27');
    const next = newSemester('SoSe 2027');
    expect(pickDefaultSemester([next, cur, past], now)).toBe(cur);
    expect(pickDefaultSemester([next, past], now)).toBe(next);
    expect(pickDefaultSemester([past, newSemester('SoSe 2025')], now)).toBe(past);
    expect(pickDefaultSemester([], now)).toBeUndefined();
  });
});
