import { isActive, validSession } from './schedule';
import { parseDate, validDate, weekday } from './time';
import type { Course } from './types';

export interface IcsOptions {
  /** Calendar name shown by calendar apps. */
  name?: string;
  /** Lecture period ("YYYY-MM-DD"). Without both, events start this week and repeat 15 times. */
  start?: string;
  end?: string;
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const stamp = (d: Date, t: string) => `${ymd(d)}T${t.replace(':', '')}00`;
const icsEsc = (s: string) => s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\r?\n/g, '\\n');

const utf8Len = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
};

/** Lines longer than 75 octets are folded onto continuation lines that start with a space (RFC 5545 §3.1). */
function fold(line: string): string {
  if ([...line].reduce((n, ch) => n + utf8Len(ch), 0) <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Len(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Weekly recurring events for the active sessions of `courses`, as an iCalendar file. */
export function buildICS(courses: readonly Course[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const period = validDate(opts.start) && validDate(opts.end) && opts.start <= opts.end ? [parseDate(opts.start), parseDate(opts.end)] as const : null;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - weekday(monday));
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Uniplan//EN', 'CALSCALE:GREGORIAN'];
  if (opts.name) lines.push(`X-WR-CALNAME:${icsEsc(opts.name)}`);
  for (const c of courses) for (const s of c.sessions.filter((x) => isActive(x) && validSession(x))) {
    let first: Date;
    let rule: string;
    if (period) {
      first = new Date(period[0]);
      first.setDate(first.getDate() + ((s.day - weekday(first) + 7) % 7));
      if (first > period[1]) continue;
      rule = `RRULE:FREQ=WEEKLY;UNTIL=${ymd(period[1])}T235959`;
    } else {
      first = new Date(monday);
      first.setDate(monday.getDate() + s.day);
      rule = 'RRULE:FREQ=WEEKLY;COUNT=15';
    }
    lines.push('BEGIN:VEVENT', `UID:${s.id}-${c.id}@uniplan`, `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(first, s.start)}`, `DTEND:${stamp(first, s.end)}`, rule,
      `SUMMARY:${icsEsc([c.name, s.kind && `(${s.kind})`].filter(Boolean).join(' '))}`);
    if (s.location) lines.push(`LOCATION:${icsEsc(s.location)}`);
    const desc = [c.code, c.instructor, c.notes.trim()].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
