import { normalizeCourse } from './normalize';
import type { Course } from './types';
import { uid } from './util';

type Slot = [day: number, start: string, end: string, kind: string, location?: string, alt?: boolean];
const S = ([day, start, end, kind, location = '', alt = false]: Slot) => ({ day, start, end, kind, location, alt });

// Area keys match the M.Sc. Informatik preset; with other requirements they show up as "not assigned".
const EXAMPLES = [
  { name: 'Machine Learning', code: 'CS 4780', area: 'ki', credits: 8, instructor: 'Prof. Weinberger', hue: 255, favorite: true, stage: 1, tags: ['AI', 'core'],
    notes: 'Written exam at the end. Needs linear algebra + probability.',
    sessions: [[0, '10:15', '12:00', 'Lecture', 'HG E 7'], [2, '10:15', '12:00', 'Lecture', 'HG E 7'],
      [3, '14:15', '16:00', 'Exercise', 'CAB G 61', true], [4, '10:15', '12:00', 'Exercise', 'CAB G 52', true]] },
  { name: 'Algorithms & Data Structures II', area: 'theory', code: 'CS 2110', credits: 7, instructor: 'Prof. Kleinberg', hue: 195, stage: 1, tags: ['core', 'theory'],
    sessions: [[1, '08:15', '10:00', 'Lecture', 'ML D 28'], [3, '08:15', '10:00', 'Lecture', 'ML D 28'], [1, '16:15', '17:00', 'Exercise', 'LEE C 104']] },
  { name: 'Computer Vision', area: 'ki', code: 'CS 4670', credits: 6, hue: 330, stage: 0, tags: ['AI', 'elective'],
    notes: 'Project-based, no final exam. Overlaps ML lecture on Monday though.',
    sessions: [[0, '10:15', '12:00', 'Lecture', 'CAB G 11'], [2, '16:15', '18:00', 'Exercise', 'CAB H 52']] },
  { name: 'Human-Computer Interaction', area: 'swhw', code: 'INFO 3450', credits: 5, hue: 50, favorite: true, stage: 0, tags: ['design', 'elective'],
    sessions: [[1, '13:15', '15:00', 'Lecture', 'IFW A 36'], [1, '15:15', '16:00', 'Exercise', 'IFW A 36']] },
  { name: 'Philosophy of Mind', area: 'mgw', code: 'PHIL 2600', credits: 3, hue: 25, stage: 0, tags: ['humanities', 'minor'],
    sessions: [[2, '14:15', '16:00', 'Seminar', 'RZ F 21']] },
  { name: 'Distributed Systems', area: 'kvs', code: 'CS 5414', credits: 6, instructor: 'Prof. Birman', hue: 140, stage: 0, tags: ['systems', 'core'],
    sessions: [[3, '10:15', '12:00', 'Lecture', 'HG F 1'], [4, '13:15', '15:00', 'Lab', 'CAB H 56']] },
  { name: 'Entrepreneurship & Startups', area: 'mgw', code: 'MGT 3300', credits: 4, hue: 75, stage: 0, tags: ['business', 'minor'],
    sessions: [[2, '17:15', '19:00', 'Lecture', 'HG E 3']] },
  { name: 'Japanese I', area: 'lang', code: 'LANG 1101', credits: 3, hue: 0, stage: 0, tags: ['language'],
    sessions: [[0, '18:00', '19:30', 'Seminar', 'Language Center'], [3, '18:00', '19:30', 'Seminar', 'Language Center']] },
  { name: 'Information Security', area: 'cyber', code: 'CS 5430', credits: 6, hue: 225, stage: 0, tags: ['systems', 'elective'],
    sessions: [[1, '10:15', '12:00', 'Lecture', 'NO C 60'], [2, '08:15', '10:00', 'Exercise', 'CHN D 46', true], [4, '08:15', '10:00', 'Exercise', 'CHN D 48', true]] },
  { name: 'Data Visualization', area: 'swhw', code: 'INFO 4310', credits: 4, hue: 165, stage: 0, tags: ['design', 'AI'],
    sessions: [[4, '10:15', '12:00', 'Lecture', 'IFW B 42']] },
  { name: 'Game Theory', area: 'mgw', code: 'ECON 3610', credits: 5, hue: 105, stage: -1, prevStage: 0, tags: ['theory', 'business'],
    sessions: [[0, '14:15', '16:00', 'Lecture', 'HG D 7']] },
  { name: 'Robotics Seminar', area: 'seminar', code: 'MAE 4180', credits: 3, hue: 295, stage: 0, tags: ['AI', 'elective'],
    notes: 'Times not announced yet.', sessions: [] },
] satisfies (Record<string, unknown> & { sessions: Slot[] })[];

/** Fresh copies of the example courses, with new ids. */
export const exampleCourses = (): Course[] =>
  EXAMPLES.map((c) => normalizeCourse({ ...c, id: uid(), sessions: c.sessions.map(S) })!);
