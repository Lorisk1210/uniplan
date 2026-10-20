/** -1 = dropped, 0 = idea, 1 = shortlist, 2 = final. */
export type Stage = -1 | 0 | 1 | 2;

export interface Session {
  id: string;
  /** 0 = Monday … 6 = Sunday */
  day: number;
  /** "HH:MM", or '' while the time isn't known yet */
  start: string;
  end: string;
  kind: string;
  location: string;
  /** One of several alternative slots (e.g. tutorial groups); pick one on the timetable. */
  alt: boolean;
  chosen: boolean;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  instructor: string;
  notes: string;
  tags: string[];
  /** Key of a `ProgramArea`, or '' when not assigned. Unknown keys count as unassigned. */
  area: string;
  hue: number;
  favorite: boolean;
  hidden: boolean;
  stage: Stage;
  /** Where a dropped course goes back to when restored. */
  prevStage: 0 | 1 | 2;
  createdAt: number;
  sessions: Session[];
}

export interface Semester {
  id: string;
  name: string;
  /** Lecture period as "YYYY-MM-DD", or '' if unknown. Used for ordering and calendar export. */
  start: string;
  end: string;
  createdAt: number;
  courses: Course[];
}

export interface ProgramArea {
  key: string;
  label: string;
  short: string;
  min: number;
  /** null: capped only by the group's max. */
  max: number | null;
}

export interface ProgramGroup {
  key: string;
  label: string;
  min: number;
  max: number | null;
  areas: ProgramArea[];
}

/** Credit requirements of a degree. */
export interface Program {
  name: string;
  total: number;
  groups: ProgramGroup[];
}

export interface PlanData {
  version: 2;
  program: Program;
  semesters: Semester[];
}
