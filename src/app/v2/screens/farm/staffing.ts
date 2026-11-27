import type { Profile } from '../../../types';
import type { FarmCalItem } from '../../data/farm';
import { hoursOf, isPresence, minutes } from './logic';

export const workStart = 6 * 60,
  workEnd = 20 * 60;
export const hourLabel = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
type Span = { start: number; end: number };
type Person = { uid: string; name: string; role: 'management' | 'volunteer' | 'other'; spans: Span[] };
export const plannedAt = (people: Person[], at: number) =>
  people.filter(p => p.spans.some(s => s.start <= at && at < s.end));
export function staffingSummary(
  items: FarmCalItem[],
  date: string,
  now: number,
  profiles: Map<string, Profile>,
  manager: boolean,
) {
  const byPerson = new Map<string, Person>();
  for (const item of items) {
    if (item.date !== date || !isPresence(item) || !item.ownerUid || (!manager && item.audience === 'managers'))
      continue;
    const { from, to } = hoursOf(item);
    const start = from ? minutes(from) : 0,
      end = to ? minutes(to) : 24 * 60;
    if (!(start < end)) continue;
    const p = profiles.get(item.ownerUid);
    const person =
      byPerson.get(item.ownerUid) ||
      ({
        uid: item.ownerUid,
        name: p?.displayName || item.ownerName,
        role: p?.role === 'owner' || p?.role === 'manager' ? 'management' : p?.role === 'staff' ? 'volunteer' : 'other',
        spans: [],
      } as Person);
    person.spans.push({ start, end });
    byPerson.set(person.uid, person);
  }
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  for (const person of people) {
    const merged: Span[] = [];
    for (const span of person.spans.sort((a, b) => a.start - b.start)) {
      const last = merged.at(-1);
      if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
      else merged.push({ ...span });
    }
    person.spans = merged;
  }
  const events = people
    .flatMap(person =>
      person.spans.flatMap(span => [
        { at: span.start, arriving: true, person },
        { at: span.end, arriving: false, person },
      ]),
    )
    .filter(e => e.at > now && e.at < 24 * 60)
    .sort((a, b) => a.at - b.at);
  const points = [...new Set([workStart, workEnd, ...people.flatMap(p => p.spans.flatMap(s => [s.start, s.end]))])]
    .filter(n => n >= workStart && n <= workEnd)
    .sort((a, b) => a - b);
  const gaps: Span[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i],
      end = points[i + 1];
    if (plannedAt(people, start).some(p => p.role === 'volunteer')) continue;
    const last = gaps.at(-1);
    if (last?.end === start) last.end = end;
    else gaps.push({ start, end });
  }
  return {
    people,
    current: plannedAt(people, now),
    next: events.filter(e => e.at === events[0]?.at),
    gap: gaps.find(g => g.end > now),
  };
}
