// Shared bits of the farm screens: the clock in minutes, names and gender of people, the day picker, and calendar item wording.
import { useState, type ReactNode } from 'react';
import { now, nowMs, useClockVersion } from '../../../clock';
import { DAY_LETTERS, hhmm } from '../../format';
import { BackLink, Button, Field, IconButton } from '../../kit';
import type { Profile } from '../../../types';
import type { V2Ctx } from '../../ctx';
import { dayNum, firstOf, hoursOf, isFemale, teamKindLabel, weekdayOf, type CalItem } from './logic';
import './farm.css';

/** Minutes since midnight in Israel, now (re-renders with the demo clock). */
export function useNowMin() {
  useClockVersion();
  const t = hhmm(now());
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
}
export const nowStamp = () => nowMs();

/** Grammatical gender of a person: the profile's optional `fields.gender`, else a first-name guess. */
export const femaleOf = (name: string, p?: Profile | null) => isFemale(name, (p?.fields as Record<string, string> | undefined)?.gender);
export const personName = (ctx: V2Ctx, uid: string, fallback = '') => ctx.peopleByUid.get(uid)?.displayName || fallback;

export const ROLE_WORD = (role: string, female: boolean) =>
  role === 'owner' ? 'בעלים' : role === 'manager' ? (female ? 'מנהלת' : 'מנהל') : role === 'staff' ? (female ? 'מתנדבת' : 'מתנדב') : role === 'vendor' ? 'בעל דוכן' : '';

/** "החווה" back link with an optional action on the other side (F2, F3, F5, F6). */
export function TopRow({ back = 'החווה', onBack, end, flat }: { back?: string; onBack: () => void; end?: ReactNode; flat?: boolean }) {
  return <div className={flat ? 'farm-toprow farm-toprow--flat' : 'farm-toprow'}><BackLink label={back} onClick={onBack} />{end}</div>;
}
export const AddPresenceButton = ({ onClick }: { onClick: () => void }) => <Button icon="plus" iconSize={18} className="farm-addbtn" onClick={onClick}>נוכחות</Button>;
/** Previous / next, and "היום" (back to today, as the old calendar) when the period on screen does not hold today. */
export function Arrows({ prev, next, prevLabel, nextLabel, onToday }: { prev: () => void; next: () => void; prevLabel: string; nextLabel: string; onToday?: () => void }) {
  return (
    <div className="farm-arrows">
      {onToday && <Button variant="outline" className="farm-todaybtn" onClick={onToday}>היום</Button>}
      <IconButton variant="bordered" icon="back" label={prevLabel} onClick={prev} /><IconButton variant="bordered" icon="chevron" label={nextLabel} onClick={next} />
    </div>
  );
}

/** Day buttons "ה׳ 19", seven to a line (F4 multi-select, C11 single). A chosen day outside the week wraps to the next line. */
export function DayPicker({ days, selected, onToggle }: { days: string[]; selected: string[]; onToggle: (d: string) => void }) {
  return (
    <div className="farm-days">
      {days.map((d) => (
        <button key={d} type="button" className="farm-day" aria-pressed={selected.includes(d)} aria-label={`יום ${DAY_LETTERS[weekdayOf(d)]} ${dayNum(d)}.${Number(d.slice(5, 7))}`} onClick={() => onToggle(d)}>
          <span className="farm-day__name">{DAY_LETTERS[weekdayOf(d)]}</span><b className="farm-day__num">{dayNum(d)}</b>
        </button>
      ))}
    </div>
  );
}

/** "תאריך אחר": any date, beyond the seven-day picker (as the old calendar's date field). `min` keeps past days out where they make no sense. */
export function OtherDate({ onPick, min }: { onPick: (d: string) => void; min?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (!open) return <button type="button" className="farm-link farm-otherdate" onClick={() => setOpen(true)}>תאריך אחר</button>;
  return (
    <Field label="תאריך" type="date" ltr min={min} value={value} autoFocus
      onChange={(e) => { const d = e.target.value; setValue(d); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!min || d >= min)) onPick(d); }} />
  );
}

/** The soft line under a calendar item: its note, else "מנהלים" for managers-only items, else who takes part. */
export function itemMeta(ctx: V2Ctx, it: CalItem): string {
  if (it.note) return it.note;
  if (it.audience === 'managers') return 'מנהלים';
  const names = (it.participants || []).map((u) => firstOf(personName(ctx, u))).filter(Boolean);
  if (names.length) return names.join(', ');
  const kind = teamKindLabel(it.kind);
  if (kind) return kind;
  if (it.kind === 'event') return 'אירוע';
  if (it.kind === 'visit') return 'ביקור';
  return '';
}
/** The time column of a calendar item: its start, or "כל היום". */
export const itemTime = (it: CalItem) => hoursOf(it).from || (it.time && !/\d/.test(it.time) ? it.time : 'כל היום');
/** Calendar items sort by start; all-day items first. */
export const byStart = (a: CalItem, b: CalItem) => (hoursOf(a).from || '').localeCompare(hoursOf(b).from || '');
