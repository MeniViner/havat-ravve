// אנשים והרשאות: what the phone and the computer share. Words that follow the person (the app's own rule), who passes
// the filter, the owner's actions on a person, and what is known about their entries, keys and permission changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ddmm, dayTime, daysFromToday, firstName, hhmm } from '../../app/v2/format';
import { gw } from '../../app/v2/gender';
import { nowMs } from '../../app/clock';
import { useLoad } from '../shared';
import { errorText, source, type AccessChange, type Me, type Person, type PersonAccess } from '../source';

export type Notify = (t: string, tone?: 'info' | 'alert') => void;
export type Role = 'guest' | 'staff' | 'manager' | 'owner';
export const ROLE_VALUES: Role[] = ['guest', 'staff', 'manager', 'owner'];
const ROLE_ORDER = ['owner', 'manager', 'staff', 'vendor', 'guest'];
export const OWNER_EMAIL = 'meniviner@gmail.com';

/* ───────── words ───────── */
const WORDS: Record<Person['role'], [string, string]> = { owner: ['בעלים', 'בעלים'], manager: ['מנהל', 'מנהלת'], staff: ['מתנדב', 'מתנדבת'], guest: ['אורח', 'אורחת'], vendor: ['בעל דוכן', 'בעלת דוכן'] };
type Gendered = Person & { gender?: string; fields?: Record<string, unknown> };
export const gp = (p: Person, male: string, female: string) => gw(p.displayName, male, female, p as Gendered);
export const roleWord = (p: Person, role: Person['role'] = p.role) => gp(p, ...WORDS[role]);
/** The neutral labels the server writes into the activity lines, back to the role. */
const BY_LABEL: Record<string, Person['role']> = { בעלים: 'owner', 'מנהל/ת': 'manager', 'מתנדב/ת': 'staff', 'אורח/ת': 'guest', 'בעל דוכן': 'vendor', מנהל: 'manager', מתנדב: 'staff', אורח: 'guest' };
export const callIt = (p: Person) => p.displayName || p.email;
const year = (iso: string) => { const y = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric' }); return y.format(new Date(iso)) === y.format(new Date(nowMs())) ? '' : '.' + y.format(new Date(iso)); };
/** "3.11", and the year when it is not this one. */
export const day = (iso: string) => ddmm(iso) + year(iso);
export const lastEntry = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? `היום ${hhmm(iso)}` : d === -1 ? 'אתמול' : day(iso); };
export const lastEntryFull = (a: PersonAccess) => `${a.at ? dayTime(a.at) : ''}${a.device ? (a.device === 'phone' ? ' · מהטלפון' : ' · מהמחשב') : ''}`;
/** A line of the permission history, as a sentence. A line that is not one of the known kinds is shown as it was written. */
export function changeText(p: Person, c: AccessChange): string {
  const by = firstName(c.by || '');
  const did = (m: string, f: string) => gw(c.by, m, f);
  const role = /^(?:.*: )(.+?) ← (.+)$/.exec(c.text);
  if (role && by) return `${by} ${did('קבע', 'קבעה')}: ${BY_LABEL[role[2]] ? roleWord(p, BY_LABEL[role[2]]) : role[2]}`;
  if (/נחסם\/ה$/.test(c.text) && by) return `${by} ${did('חסם', 'חסמה')}`;
  if (/שוחרר\/ה$/.test(c.text) && by) return `${by} ${did('שחרר', 'שחררה')} את החסימה`;
  if (/נרשם\/ה$/.test(c.text)) return gp(p, 'נרשם לאפליקציה', 'נרשמה לאפליקציה');
  return c.text;
}
export const statusWord = (p: Person) => (p.status === 'blocked' ? gp(p, 'חסום', 'חסומה') : p.status === 'pending' ? gp(p, 'ממתין לאישור', 'ממתינה לאישור') : gp(p, 'פעיל', 'פעילה'));

/* ───────── the list ───────── */
export type Filter = 'all' | 'team' | 'guests' | 'vendors' | 'blocked';
export const FILTERS: { v: Filter; l: string }[] = [{ v: 'all', l: 'כולם' }, { v: 'team', l: 'צוות' }, { v: 'guests', l: 'אורחים' }, { v: 'vendors', l: 'דוכנים' }, { v: 'blocked', l: 'חסומים' }];
const TEAM = ['owner', 'manager', 'staff'];
const passes = (p: Person, f: Filter) => f === 'all' || (f === 'team' ? TEAM.includes(p.role) : f === 'guests' ? p.role === 'guest' : f === 'vendors' ? p.role === 'vendor' : p.status === 'blocked');
export function usePeopleList(people: Person[]) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.v, people.filter((p) => passes(p, f.v)).length])) as Record<Filter, number>, [people]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .filter((p) => passes(p, filter))
      .filter((p) => !t || `${p.displayName} ${p.email} ${p.phone} ${p.customerNumber ?? ''}`.toLowerCase().includes(t))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || (a.displayName || '').localeCompare(b.displayName || '', 'he'));
  }, [people, filter, q]);
  return { filter, setFilter, q, setQ, counts, rows };
}
/** Everyone's last entry: one request; null while loading, or when the server does not say. */
export const usePeopleAccess = () => useLoad(() => source.peopleAccess().catch(() => null)).data;
/** The working API keys' names by person: one request; null while loading or when it failed. */
export function usePeopleKeys() {
  const keys = useLoad(() => source.keys()).data;
  return useMemo(() => {
    if (!keys) return null;
    const out: Record<string, string[]> = {};
    for (const k of keys) if (k.status === 'active') for (const a of k.actors) { const uid = a.replace(/^user:/, ''); (out[uid] ||= []).push(k.label); }
    return out;
  }, [keys]);
}
export function useChanges(p: Person) {
  // walking the list with the arrows asks only for the person it stops on
  const here = useRef(true);
  useEffect(() => { here.current = true; return () => { here.current = false; }; }, []);
  return useLoad(async () => { await new Promise((r) => setTimeout(r, 150)); return here.current ? source.accessChanges(p.uid) : []; }, [p.uid, p.updatedAt]);
}

/* ───────── actions ───────── */
export function usePersonActions(p: Person, me: Me, onChanged: () => void, notify: Notify) {
  const [busy, setBusy] = useState(false);
  const run = async (op: string, body: Record<string, unknown>, done: string): Promise<boolean> => {
    setBusy(true);
    try { await source.action(op, { uid: p.uid, ifUpdatedAt: p.updatedAt, ...body }); notify(done); onChanged(); return true; }
    catch (e) { notify(errorText(e), 'alert'); return false; }
    finally { setBusy(false); }
  };
  const blocked = p.status === 'blocked';
  return {
    busy, run, blocked, self: p.uid === me.uid, farmOwner: (p.email || '').toLowerCase() === OWNER_EMAIL,
    setRole: (role: Role) => run('people.setRole', { role }, 'התפקיד עודכן'),
    setNotes: (notes: string) => run('people.setNotes', { notes }, 'ההערות נשמרו'),
    toggleBlock: () => run('people.setStatus', { status: blocked ? 'active' : 'blocked' }, blocked ? 'החסימה שוחררה' : gp(p, 'נחסם', 'נחסמה')),
    remove: () => run('people.delete', {}, gp(p, 'נמחק', 'נמחקה')),
  };
}
export const OWNER_WARN = 'בעלים רואים ומשנים הכל באפליקציה, ונכנסים גם לקונסולה הזאת: אנשים ותפקידים, מפתחות API, מתגים, גיבויים ומחיקת נתונים.';
export const blockText = (p: Person) => (p.status === 'blocked' ? `${callIt(p)} ${gp(p, 'יוכל', 'תוכל')} להיכנס לאפליקציה שוב.` : `${callIt(p)} לא ${gp(p, 'יוכל', 'תוכל')} להיכנס לאפליקציה עד שתשחררו.`);
export const deleteText = (p: Person) => `החשבון של ${callIt(p)} יימחק מהאפליקציה. כרטיסים, תרומות וביקורים נשארים. ${gp(p, 'אם יתחבר שוב, יתחיל', 'אם תתחבר שוב, תתחיל')} מההתחלה. כדי רק למנוע כניסה, עדיף לחסום.`;

/** A role set ahead for an email. */
export function useInvite(notify: Notify, close: () => void) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'guest'>>('staff');
  const [busy, setBusy] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const save = async () => {
    setBusy(true);
    try {
      await source.action('invites.setRole', { email: email.trim().toLowerCase(), role });
      notify(`${email.trim()} יקבל/תקבל את התפקיד כשיירשם/תירשם`);
      setEmail(''); close();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return { email, setEmail, role, setRole, busy, ok, save };
}
