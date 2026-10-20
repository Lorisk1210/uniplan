export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fromMin = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const validTime = (t: unknown): t is string => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t);

export const padTime = (t: unknown): string => (validTime(t) ? t.padStart(5, '0') : '');

/** Lenient 24h parser for typed times: "14", "1400", "915", "9:15", "14.30", "14h" → "HH:MM" (null if invalid). */
export const parseTime = (t: unknown): string | null => {
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?h?$/.exec(String(t ?? '').trim());
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
};

/** Monday = 0 … Sunday = 6 */
export const weekday = (d: Date): number => (d.getDay() + 6) % 7;

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const validDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDate(s);
  return isoDate(d) === s;
};

/** "YYYY-MM-DD" → local midnight. */
export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
