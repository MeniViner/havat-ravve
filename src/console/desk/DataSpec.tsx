// The data browser's rules, shared by the phone and the computer: which collections are the server's own, what a record
// of each kind shows first, which state it is in, and the loading and editing both layouts use.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ddmm, dayTime, firstName, hhmm, daysFromToday } from '../../app/v2/format';
import { gw } from '../../app/v2/gender';
import { nowMs } from '../../app/clock';
import { ago, useLoad } from '../shared';
import { fieldLabel, valueText } from '../labels';
import { errorText, source, type DataCollection, type DataDoc, type DataDocRow, type DocHistory } from '../source';
import type { TagTone } from './desk';

export type Notify = (t: string, tone?: 'info' | 'alert') => void;
/** A collection, or one record's own ("events/e1" + vendors). */
export type Place = { group: string; parent?: string };
export const SYSTEM = new Set(['api_log', 'api_failures', 'api_idempotency', 'push_jobs', 'email_outbox', 'account_deletions', 'account_activity', 'counters']);
export const SIMPLE = new Set(['string', 'integer', 'double', 'boolean', 'null']);
export const groupOf = (path: string) => path.split('/').filter((_, i) => i % 2 === 0).join('/*/');
export const placeKey = (p: Place) => `${p.group}|${p.parent || ''}`;

/* ───────── the address: #/data/tasks/<id>, #/data/events/e1/vendors/v1, #/data/events/*\/vendors/e1/v1 ───────── */
export function readAddress(rest: string[]): { place: Place | null; doc: string | null } {
  if (!rest.length) return { place: null, doc: null };
  if (rest.includes('*')) {
    // a collection everywhere it appears: its names with stars between them, then the ids that fill the stars and the record's own
    let n = 1;
    while (rest[n] === '*' && rest[n + 1]) n += 2;
    const names = rest.slice(0, n).filter((x) => x !== '*'), ids = rest.slice(n);
    return { place: { group: names.join('/*/') }, doc: ids.length === names.length ? names.map((c, i) => `${c}/${ids[i]}`).join('/') : null };
  }
  const full = rest.length % 2 === 0;
  const col = full ? rest.slice(0, -1) : rest;
  const parent = col.slice(0, -1).join('/');
  return { place: { group: groupOf(col.join('/')), ...(parent ? { parent } : {}) }, doc: full ? rest.join('/') : null };
}
export function writeAddress(place: Place, doc?: string | null): string[] {
  if (place.parent) return (doc || `${place.parent}/${place.group.split('/*/').pop()}`).split('/');
  if (!place.group.includes('/*/')) return doc ? doc.split('/') : [place.group];
  return [...place.group.split('/'), ...(doc ? doc.split('/').filter((_, i) => i % 2 === 1) : [])];
}

/* ───────── loading ───────── */
const ORDER = ['tasks', 'shopping', 'tickets', 'calendar', 'vendors', 'events', 'places', 'donations', 'visits', 'settings', 'users', 'activity', 'notifications'];
const rank = (g: string) => { const i = ORDER.indexOf(g); return i < 0 ? ORDER.length : i; };
const size = (c: DataCollection) => c.count ?? c.backupCount ?? 0;
/** The farm's own collections (the big ones first, read only last) and the server's. */
export function useCollections() {
  const list = useLoad(() => source.dataCollections());
  const split = useMemo(() => {
    const items = list.data?.items || [];
    return {
      farm: items.filter((c) => !SYSTEM.has(c.group)).sort((a, b) => Number(a.readOnly) - Number(b.readOnly) || (a.readOnly ? 0 : size(b) - size(a)) || rank(a.group) - rank(b.group)),
      system: items.filter((c) => SYSTEM.has(c.group)),
    };
  }, [list.data]);
  return { ...list, ...split };
}
export function useRecords(place: Place | null) {
  const key = place ? placeKey(place) : '';
  const [st, setSt] = useState<{ key: string; rows: DataDocRow[]; next: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async (after: string | null) => {
    if (!place) return;
    const n = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await source.dataDocs(place.group, after, place.parent);
      if (n === seq.current) setSt((p) => ({ key, rows: after && p?.key === key ? [...p.rows, ...r.items] : r.items, next: r.next }));
    } catch (e) { if (n === seq.current) setError(errorText(e)); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(null); }, [load]);
  const cur = st?.key === key ? st : null;
  return { rows: cur?.rows ?? null, next: cur?.next ?? null, error, loading, reload: () => load(null), more: () => { if (cur?.next) load(cur.next); } };
}

const IL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
/** A stored instant as an Israel time for its input, and back. */
const toInput = (iso: string) => IL.format(new Date(iso)).replace(' ', 'T');
const fromInput = (v: string) => {
  const utc = Date.parse(v + ':00Z');
  if (Number.isNaN(utc)) return null;
  // the offset is Israel's at that moment, summer or winter
  const off = Date.parse(toInput(new Date(utc).toISOString()) + ':00Z') - utc;
  const t = utc - off;
  return new Date(t - (Date.parse(toInput(new Date(t).toISOString()) + ':00Z') - utc)).toISOString();
};
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;
/** What a text field really holds: an instant, a day, or just text. An empty one is told by its name. */
export function textKind(k: string, v: unknown): 'instant' | 'day' | 'text' {
  if (typeof v !== 'string') return 'text';
  if (INSTANT_RE.test(v) && !Number.isNaN(Date.parse(v))) return 'instant';
  if (DAY_RE.test(v)) return 'day';
  return v ? 'text' : /At$/.test(k) ? 'instant' : /(^d|D)ate$/.test(k) ? 'day' : 'text';
}
/** The draft of a careful edit of simple fields, and the two writes (edit, delete) with the record's own time. */
export function useRecordEdit(d: DataDoc, notify: Notify, done: () => void, gone: () => void) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const keys = useMemo(() => Object.keys(d.fields).sort(), [d]);
  const editable = (k: string) => !d.readOnly && SIMPLE.has(d.types[k]);
  const kind = (k: string) => (d.types[k] === 'string' ? textKind(k, d.fields[k]) : 'text');
  const start = () => { setDraft(Object.fromEntries(keys.filter(editable).map((k) => [k, d.types[k] === 'boolean' ? !!d.fields[k] : d.fields[k] === null ? '' : kind(k) === 'instant' && d.fields[k] ? toInput(String(d.fields[k])) : String(d.fields[k])]))); setConfirm(false); setEdit(true); };
  const parsed = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const t = d.types[k];
      const val = t === 'boolean' ? v : t === 'integer' || t === 'double' ? (String(v).trim() === '' ? null : Number(v)) : t === 'null' ? (String(v) === '' ? null : v)
        : kind(k) === 'instant' ? (d.fields[k] && v === toInput(String(d.fields[k])) ? d.fields[k] : v ? fromInput(String(v)) ?? v : v) : v;
      if (JSON.stringify(val) !== JSON.stringify(d.fields[k])) out[k] = val;
    }
    return out;
  }, [draft, d]);
  const badKey = (k: string) => (k in parsed && kind(k) === 'instant' && (Number.isNaN(Date.parse(String(parsed[k]))))) || (k in parsed && kind(k) === 'day' && parsed[k] !== '' && Number.isNaN(Date.parse(String(parsed[k])))) || (d.types[k] === 'integer' || d.types[k] === 'double') && k in parsed && parsed[k] !== null && !Number.isFinite(parsed[k] as number);
  const bad = Object.keys(parsed).some(badKey);
  const save = async () => {
    setBusy(true);
    try { await source.editDoc(d.path, parsed, d.updateTime!); notify('נשמר'); setEdit(false); setConfirm(false); done(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { await source.deleteDoc(d.path, d.updateTime!); notify('נמחק. אפשר לשחזר מסל המחזור במסך הגיבויים'); gone(); }
    catch (e) { notify(errorText(e), 'alert'); }
  };
  return { kind, edit, setEdit, draft, setDraft, confirm, setConfirm, busy, keys, editable, start, parsed, bad, badKey, changes: Object.keys(parsed).length, save, remove };
}

/* ───────── words ───────── */
/** The table's time: "לפני 35 דקות", "היום 07:10", "אתמול 18:20", "21.11". */
export function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = (nowMs() - Date.parse(iso)) / 60_000;
  if (min >= 0 && min < 59.5) return ago(iso);
  const d = daysFromToday(iso);
  return d === 0 ? `היום ${hhmm(iso)}` : d === -1 ? `אתמול ${hhmm(iso)}` : ddmm(iso);
}
/** A history's time: as above, and the hour also on older days. */
export function whenFull(iso: string): string {
  const min = (nowMs() - Date.parse(iso)) / 60_000;
  return min >= 0 && min < 59.5 ? ago(iso) : dayTime(iso);
}
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A stored value as text; a plain date in Israel's order. */
export function showValue(v: unknown): string {
  const m = typeof v === 'string' ? DAY_RE.exec(v) : null;
  if (m) return `${+m[3]}.${+m[2]}.${m[1]}`;
  if (Array.isArray(v)) return v.length ? v.map(showValue).join(', ') : '—';
  // a place is its name, or where it is; the stored form is in "כל השדות"
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.placeName === 'string' && o.placeName) return o.placeName; if (typeof o.lat === 'number' && typeof o.lng === 'number') return `${o.lat}, ${o.lng}`; }
  return valueText(v);
}
const VERBS: Record<string, [string, string]> = {
  created: ['יצר', 'יצרה'], edited: ['שינה', 'שינתה'], urgent: ['סימן דחוף', 'סימנה דחוף'], done: ['סימן שבוצע', 'סימנה שבוצע'], reopened: ['פתח שוב', 'פתחה שוב'],
  assigned: ['שייך', 'שייכה'], released: ['שחרר', 'שחררה'], taken: ['לקח', 'לקחה'], deleted: ['מחק', 'מחקה'], bought: ['סימן שנקנה', 'סימנה שנקנה'], unbought: ['ביטל את הסימון שנקנה', 'ביטלה את הסימון שנקנה'],
  published: ['פרסם', 'פרסמה'], unpublished: ['הסתיר', 'הסתירה'], joined: ['נרשם', 'נרשמה'], photo: ['הוסיף תמונה', 'הוסיפה תמונה'], paid: ['אישר תשלום', 'אישרה תשלום'], cancelled: ['ביטל', 'ביטלה'],
};
/** A line of the app's own activity about a record, as a sentence: who, what they did, and what the line adds to the title. */
export function activityText(a: DocHistory['activity'][number], title: string): string {
  const who = a.via || firstName(a.by || '');
  const verb = VERBS[a.action];
  if (!verb || !who) return who && a.text ? `${who}: ${a.text}` : a.text || who;
  const rest = a.action === 'urgent' ? '' : (title ? a.text.split(title).join('') : a.text).replace(/^[\s·:,"-]+|[\s·:,"-]+$/g, '');
  return `${who} ${a.via ? verb[0] : gw(a.by, verb[0], verb[1])}${rest ? ' ' + rest : ''}`;
}

/* ───────── what each kind of record shows ───────── */
type F = Record<string, unknown>;
export type Status = { label: string; tone: TagTone; chip: string };
export type Spec = {
  head: string;
  cols?: { key: string; head: string; width: number; text: (f: F) => string }[];
  status?: (f: F) => Status | null;
  chips?: { value: string; label: string }[];
  /** What the panel shows first; what is empty is not shown. */
  facts?: { label: string; text: (f: F) => string }[];
};
const name = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as { name?: string; placeName?: string }).name || (v as { placeName?: string }).placeName || '') : '');
const str = (k: string) => (f: F) => { const t = showValue(f[k]); return t === '—' ? '' : t; };
const money = (k: string) => (f: F) => (typeof f[k] === 'number' ? `${(f[k] as number).toLocaleString('he-IL')} ₪` : '');
const yesNo = (k: string) => (f: F) => (typeof f[k] === 'boolean' ? (f[k] ? 'כן' : 'לא') : '');
const PAY: Record<string, Status> = {
  free: { label: 'חינם', tone: 'neutral', chip: 'paid' }, paid: { label: 'שולם', tone: 'green', chip: 'paid' }, paid_onsite: { label: 'שולם במקום', tone: 'green', chip: 'paid' },
  pending: { label: 'ממתין', tone: 'amber', chip: 'waiting' }, claimed: { label: 'לאישור', tone: 'amber', chip: 'waiting' }, cancelled: { label: 'בוטל', tone: 'neutral', chip: 'cancelled' },
};
const PAY_CHIPS = [{ value: 'waiting', label: 'ממתינים' }, { value: 'paid', label: 'שולמו' }, { value: 'cancelled', label: 'בוטלו' }];
const VISIT: Record<string, Status> = {
  new: { label: 'חדש', tone: 'amber', chip: 'new' }, approved: { label: 'אושר', tone: 'green', chip: 'approved' }, rejected: { label: 'לא מתאים', tone: 'neutral', chip: 'closed' }, cancelled: { label: 'בוטל', tone: 'neutral', chip: 'closed' },
};
const ROLE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל/ת', staff: 'מתנדב/ת', guest: 'אורח/ת', vendor: 'בעל דוכן' };
const STALL: Record<string, Status> = {
  confirmed: { label: 'אושר', tone: 'green', chip: 'confirmed' }, approved: { label: 'אושר', tone: 'green', chip: 'confirmed' }, pending: { label: 'ממתין', tone: 'amber', chip: 'waiting' }, invited: { label: 'הוזמן', tone: 'amber', chip: 'waiting' }, declined: { label: 'לא מגיע', tone: 'neutral', chip: 'declined' }, cancelled: { label: 'בוטל', tone: 'neutral', chip: 'declined' },
};
/** A stored time as a short date; text that is no date stays as it is. */
const dateText = (v: unknown) => (typeof v !== 'string' ? '' : Number.isNaN(Date.parse(v)) ? v : ddmm(v));
const made = (f: F) => { const at = dateText(f.createdAt); return [at, name(f.createdBy) || name(f.addedBy)].filter(Boolean).join(' · '); };
const MADE = { label: 'נוצר', text: made };

export const SPECS: Record<string, Spec> = {
  tasks: {
    head: 'משימה',
    cols: [{ key: 'who', head: 'על מי', width: 110, text: (f) => firstName(name(f.assignee)) || (f.templateId ? 'מי שפנוי' : 'פנויה') }],
    // urgent shows only while nobody took it: that is when it still waits for someone
    status: (f) => (f.done === true ? { label: 'בוצעה', tone: 'green', chip: 'done' } : f.done !== false ? null : f.urgent && !name(f.assignee) ? { label: 'דחוף', tone: 'red', chip: 'open' } : { label: 'פתוחה', tone: 'neutral', chip: 'open' }),
    chips: [{ value: 'open', label: 'פתוחות' }, { value: 'done', label: 'בוצעו' }],
    facts: [
      { label: 'כותרת', text: str('title') }, { label: 'על מי', text: (f) => name(f.assignee) || (f.templateId ? 'מי שפנוי' : 'פנויה') }, { label: 'מקום', text: (f) => name(f.location) || name(f.place) },
      { label: 'עד מתי', text: str('dueDate') }, { label: 'דחוף', text: yesNo('urgent') }, { label: 'הערה', text: str('note') },
      { label: 'בוצעה', text: (f) => (f.done ? [dateText(f.doneAt), name(f.doneBy)].filter(Boolean).join(' · ') || 'כן' : '') }, { label: 'נוצרה', text: made },
    ],
  },
  shopping: {
    head: 'פריט',
    cols: [{ key: 'qty', head: 'כמות', width: 100, text: str('qty') }],
    status: (f) => (f.bought === true ? { label: 'נקנה', tone: 'green', chip: 'bought' } : f.bought !== false ? null : f.urgent ? { label: 'דחוף', tone: 'red', chip: 'open' } : { label: 'לקנות', tone: 'neutral', chip: 'open' }),
    chips: [{ value: 'open', label: 'לקנות' }, { value: 'bought', label: 'נקנו' }],
    facts: [{ label: 'פריט', text: (f) => str('title')(f) || str('text')(f) }, { label: 'כמות', text: str('qty') }, { label: 'דחוף', text: yesNo('urgent') }, { label: 'הערה', text: str('note') }, { label: 'קישור', text: str('link') }, { label: 'נקנה', text: (f) => (f.bought ? [dateText(f.boughtAt), name(f.boughtBy)].filter(Boolean).join(' · ') || 'כן' : '') }, MADE],
  },
  tickets: {
    head: 'כרטיס', cols: [{ key: 'event', head: 'אירוע', width: 150, text: str('eventTitle') }, { key: 'price', head: 'מחיר', width: 80, text: money('price') }],
    status: (f) => (f.status === 'cancelled' ? PAY.cancelled : PAY[String(f.paymentStatus)] || null), chips: PAY_CHIPS,
  },
  donations: { head: 'תרומה', cols: [{ key: 'amount', head: 'סכום', width: 90, text: money('amount') }], status: (f) => PAY[String(f.paymentStatus)] || null, chips: PAY_CHIPS },
  visits: {
    head: 'ביקור', cols: [{ key: 'date', head: 'תאריך', width: 110, text: str('date') }, { key: 'people', head: 'אנשים', width: 70, text: str('people') }],
    status: (f) => VISIT[String(f.status)] || null, chips: [{ value: 'new', label: 'חדשים' }, { value: 'approved', label: 'אושרו' }, { value: 'closed', label: 'סגורים' }],
  },
  events: {
    head: 'אירוע', cols: [{ key: 'date', head: 'תאריך', width: 110, text: (f) => (dateText(f.start) || str('date')(f)) }, { key: 'price', head: 'מחיר', width: 80, text: money('price') }],
    status: (f) => (typeof f.published !== 'boolean' ? null : f.published ? { label: 'מפורסם', tone: 'green', chip: 'on' } : { label: 'טיוטה', tone: 'neutral', chip: 'off' }), chips: [{ value: 'on', label: 'מפורסמים' }, { value: 'off', label: 'טיוטות' }],
  },
  users: {
    head: 'שם', cols: [{ key: 'role', head: 'תפקיד', width: 100, text: (f) => ROLE[String(f.role)] || '' }],
    status: (f) => (f.status === 'blocked' ? { label: 'חסום', tone: 'red', chip: 'blocked' } : f.status === 'pending' ? { label: 'ממתין', tone: 'amber', chip: 'active' } : f.status === 'active' ? { label: 'פעיל', tone: 'neutral', chip: 'active' } : null),
    chips: [{ value: 'active', label: 'פעילים' }, { value: 'blocked', label: 'חסומים' }],
  },
  'events/*/vendors': {
    head: 'דוכן', cols: [{ key: 'fee', head: 'דמי השתתפות', width: 100, text: money('fee') }],
    status: (f) => STALL[String(f.status)] || (typeof f.confirmed === 'boolean' ? (f.confirmed ? STALL.confirmed : STALL.pending) : null), chips: [{ value: 'confirmed', label: 'אושרו' }, { value: 'waiting', label: 'ממתינים' }, { value: 'declined', label: 'לא מגיעים' }],
  },
  places: { head: 'מקום' },
  vendors: { head: 'דוכן', cols: [{ key: 'product', head: 'מה מוכרים', width: 140, text: str('product') }, { key: 'phone', head: 'טלפון', width: 120, text: str('phone') }] },
  calendar: { head: 'מה', cols: [{ key: 'date', head: 'תאריך', width: 100, text: str('date') }, { key: 'time', head: 'שעה', width: 70, text: (f) => str('time')(f) || str('start')(f) }] },
  settings: { head: 'הגדרה' },
  activity: { head: 'פעולה', cols: [{ key: 'by', head: 'מי', width: 120, text: (f) => name(f.by) }] },
  notifications: { head: 'הודעה', cols: [{ key: 'kind', head: 'ממי', width: 120, text: (f) => name(f.by) }] },
  vendor_requests: { head: 'בקשה', cols: [{ key: 'phone', head: 'טלפון', width: 120, text: str('phone') }] },
};
export const specOf = (group: string): Spec => SPECS[group] || { head: 'רשומה' };

const FIRST = ['title', 'name', 'displayName', 'text', 'status', 'email', 'phone', 'role', 'date', 'amount', 'price', 'qty', 'category', 'note', 'notes'];
const LAST = new Set(['createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'id']);
/** The panel's lines: the kind's own, or every field that holds something, the familiar ones first. */
export function factsOf(d: DataDoc): { label: string; stored: string | null; text: string }[] {
  const spec = specOf(d.group);
  if (spec.facts) return spec.facts.map((x) => ({ label: x.label, stored: null, text: x.text(d.fields) })).filter((x) => x.text);
  const pos = (k: string) => { const i = FIRST.indexOf(k); return i < 0 ? FIRST.length : i; };
  const rows = Object.keys(d.fields).filter((k) => !LAST.has(k)).sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
    .map((k) => ({ label: fieldLabel(k) || '', stored: fieldLabel(k) ? null : k, text: d.group === 'users' && k === 'role' ? ROLE[String(d.fields[k])] || '' : wordOf(d, k) || str(k)(d.fields) })).filter((x) => x.text);
  const m = made(d.fields);
  return m ? [...rows, { label: 'נוצר', stored: null, text: m }] : rows;
}
/** A state word of the record in Hebrew, instead of the stored one. */
function wordOf(d: DataDoc, k: string): string {
  if (d.group === 'activity' && k === 'action') return VERBS[String(d.fields[k])]?.[0] || '';
  if (k !== 'status' && k !== 'paymentStatus') return '';
  if (k === 'paymentStatus') return PAY[String(d.fields[k])]?.label || '';
  const s: Record<string, Status> = d.group === 'visits' ? VISIT : d.group === 'events/*/vendors' ? STALL : { active: { label: 'פעיל', tone: 'neutral', chip: '' }, blocked: { label: 'חסום', tone: 'neutral', chip: '' }, valid: { label: 'תקף', tone: 'neutral', chip: '' }, cancelled: PAY.cancelled };
  return s[String(d.fields[k])]?.label || '';
}
export const cut = (t: string, n = 400): ReactNode => (t.length > n ? t.slice(0, n) + '…' : t);
