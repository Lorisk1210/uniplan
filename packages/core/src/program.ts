import type { Program, ProgramArea, ProgramGroup } from './types';
import { clone, isObject, optNumber, str, uid } from './util';

// Credit requirements of the M.Sc. Informatik at TU Darmstadt.
// Areas without their own max are capped by their group's max.
const TUDA_MSC_INFORMATIK: Program = {
  name: 'M.Sc. Informatik',
  total: 120,
  groups: [
    { key: 'vertiefung', label: 'Wahlbereiche der individuellen Vertiefung', min: 6, max: 51, areas: [
      { key: 'ki', label: 'Künstliche Intelligenz', short: 'KI', min: 0, max: 51 },
      { key: 'cyber', label: 'Cybersicherheit und Privatheit', short: 'Cybersicherheit', min: 0, max: 51 },
      { key: 'kvs', label: 'Komplexe vernetzte Systeme', short: 'KVS', min: 0, max: 51 },
    ] },
    { key: 'basis', label: 'Basis-Wahlbereiche', min: 12, max: 57, areas: [
      { key: 'theory', label: 'Theorie', short: 'Theorie', min: 6, max: null },
      { key: 'swhw', label: 'Software & Hardware', short: 'SW & HW', min: 6, max: null },
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

export interface ProgramPreset {
  key: string;
  label: string;
  make: () => Program;
}

export const PROGRAM_PRESETS: ProgramPreset[] = [
  { key: 'tuda-msc-informatik', label: 'M.Sc. Informatik, TU Darmstadt', make: () => clone(TUDA_MSC_INFORMATIK) },
  { key: 'bachelor-180', label: 'Bachelor, 180 credits (total only)', make: () => ({ name: 'Bachelor', total: 180, groups: [] }) },
  { key: 'master-120', label: 'Master, 120 credits (total only)', make: () => ({ name: 'Master', total: 120, groups: [] }) },
];

export const defaultProgram = (): Program => PROGRAM_PRESETS[0].make();

export interface AreaInfo extends ProgramArea {
  group: ProgramGroup;
}

export const areaIndex = (program: Program): Map<string, AreaInfo> =>
  new Map(program.groups.flatMap((g) => g.areas.map((a) => [a.key, { ...a, group: g }] as const)));

/** Turns a label into a key that's unique among `taken`. */
export function slugKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
  return key;
}

const normMax = (v: unknown, min: number): number | null => {
  const n = optNumber(v);
  return n == null ? null : Math.max(n, min);
};

export function normalizeProgram(raw: unknown): Program {
  if (!isObject(raw)) return defaultProgram();
  const rawGroups = (Array.isArray(raw.groups) ? raw.groups : []).filter(isObject);
  const rawAreas = rawGroups.flatMap((g) => (Array.isArray(g.areas) ? g.areas : []).filter(isObject));
  // Existing keys win over generated ones, so courses never lose their area when one is added.
  const claim = (items: Record<string, unknown>[]) => {
    const keep = new Set<Record<string, unknown>>();
    const taken = new Set<string>();
    for (const x of items) if (typeof x.key === 'string' && x.key && !taken.has(x.key)) { taken.add(x.key); keep.add(x); }
    return (x: Record<string, unknown>, label: string) => {
      if (keep.has(x)) return x.key as string;
      const key = slugKey(label, taken);
      taken.add(key);
      return key;
    };
  };
  const groupKey = claim(rawGroups);
  const areaKey = claim(rawAreas);
  const groups: ProgramGroup[] = rawGroups.map((g) => {
    const label = str(g.label).trim() || 'Untitled group';
    const min = optNumber(g.min) ?? 0;
    const areas: ProgramArea[] = (Array.isArray(g.areas) ? g.areas : []).filter(isObject).map((a) => {
      const aLabel = str(a.label).trim() || 'Untitled area';
      const aMin = optNumber(a.min) ?? 0;
      return { key: areaKey(a, aLabel), label: aLabel, short: str(a.short).trim() || aLabel, min: aMin, max: normMax(a.max, aMin) };
    });
    return { key: groupKey(g, label), label, min, max: normMax(g.max, min), areas };
  });
  return {
    name: str(raw.name).trim() || 'My degree',
    total: optNumber(raw.total) ?? 0,
    groups,
  };
}
