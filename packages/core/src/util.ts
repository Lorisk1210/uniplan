export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));

/** A finite, non-negative number, or null. Empty strings count as "not set". */
export const optNumber = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const fmtNum = (n: number): string => (Math.round(n * 10) / 10).toString();

export const plural = (n: number, w: string, p = w + 's'): string => `${n} ${n === 1 ? w : p}`;

export const sum = <T>(list: readonly T[], f: (x: T) => number): number => list.reduce((s, x) => s + f(x), 0);
