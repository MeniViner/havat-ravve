// Data for the system area: my profile (L6, C12, C13), profile photo (A1, A2), global search (C2), first entry (C9),
// install (C10), the offline queue (C8) and the suspended screen (X2). Everything goes through db.ts, so the same code
// runs on demo data and on Firestore. All "now" comes from clock.ts.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useList, useDoc, write, type Spec } from '../../db';
import { nowIso, todayKey, nowMs } from '../../clock';
import { compressPhoto, useOpenTasks, useHistoryTasks, useOpenShopping, useRecentBought } from '../../store';
import { useAllEvents, useVisits } from '../../data';
import { useActivityBy } from '../../activity';
import { getDemo } from '../../demo/store';
import { readyAuth } from '../../firebase';
import { storePhoto } from '../../upload';
import type { Activity, CalendarItem, FarmEvent, Place, Profile, RegistrationField, RoleInvite, ShoppingItem, Task, Ticket, Visit } from '../../types';
import { RECEIPT_PREFERENCE_FIELD } from '../../types';
import type { V2Ctx } from '../ctx';
import { gw } from '../gender';

// ---------- small date helpers (Israeli calendar day keys) ----------
const keyToUtc = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Start of today, of this week (Sunday) and of this month as ISO instants (Israel midnight, +02:00 is close enough for counting). */
export function periodStarts(today = todayKey()) {
  const wd = new Date(keyToUtc(today)).getUTCDay();
  const week = utcToKey(keyToUtc(today) - wd * 86400_000);
  const month = today.slice(0, 8) + '01';
  const iso = (k: string, t = '00:00:00') => new Date(`${k}T${t}+02:00`).toISOString();
  return { day: iso(today), week: iso(week), month: iso(month), end: iso(today, '23:59:59') };
}

// ---------- role words ----------
/** The role word under the name (L6 "מתנדב", C12 "בעלים"). */
export function roleWord(p: Pick<Profile, 'role' | 'helper'>, owner: boolean, manager: boolean) {
  if (owner) return 'בעלים';
  if (manager) return 'מנהל';
  if (p.role === 'vendor') return p.helper ? 'עוזר בדוכן' : 'בעל דוכן';
  if (p.role === 'staff') return 'מתנדב';
  return 'אורח';
}
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** "מאוקטובר 2026" from the account's creation date. */
export function sinceText(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const m = +(p.find((x) => x.type === 'month')?.value || 1); const y = p.find((x) => x.type === 'year')?.value || '';
  return `מ${MONTHS[m - 1]} ${y}`;
}

// ---------- photo ----------
export type PhotoSource = 'custom' | 'google' | 'none';
type PhotoFields = { photo?: string; photoSource?: PhotoSource; googlePhoto?: string };
/** The effective source: missing = google when a Google photo exists, else initials (types.ts). */
export const sourceOf = (p: PhotoFields): PhotoSource => p.photoSource || (p.googlePhoto ? 'google' : p.photo ? 'custom' : 'none');
/** The picture to draw for a person, or undefined for initials. */
export function photoOf(p: PhotoFields): string | undefined {
  const s = sourceOf(p);
  if (s === 'none') return undefined;
  if (s === 'custom') return p.photo || undefined;
  return p.googlePhoto || undefined;
}
/** The Google account picture of the signed-in person (real accounts only). */
export async function googlePhotoUrl(): Promise<string> {
  if (getDemo().on) return '';
  try { return (await readyAuth()).currentUser?.photoURL || ''; } catch { return ''; }
}

/** The image picked in A1 waiting to be cropped in A2 (kept in memory only; a reload goes back to A1). */
let picked: { url: string; name: string } | null = null;
const pickedListeners = new Set<() => void>();
export function setPicked(file: File | null) {
  if (picked) URL.revokeObjectURL(picked.url);
  picked = file ? { url: URL.createObjectURL(file), name: file.name } : null;
  pickedListeners.forEach((l) => l());
}
export const usePicked = () => useSyncExternalStore((l) => { pickedListeners.add(l); return () => pickedListeners.delete(l); }, () => picked);

/** Draws the circle area of the crop to a 320px square, compresses it in the browser and returns a small data URL (well under 1 MiB). */
export async function cropToDataUrl(img: HTMLImageElement, view: { size: number; circle: number; scale: number; x: number; y: number }): Promise<string> {
  const OUT = 320;
  const canvas = document.createElement('canvas'); canvas.width = OUT; canvas.height = OUT;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, OUT, OUT);
  // the image is drawn centred in the frame at `scale` (px per image px), shifted by x/y; the circle is centred in the frame
  const k = OUT / view.circle;
  const w = img.naturalWidth * view.scale * k; const h = img.naturalHeight * view.scale * k;
  g.drawImage(img, OUT / 2 - w / 2 + view.x * k, OUT / 2 - h / 2 + view.y * k, w, h);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('לא הצלחנו לקרוא את התמונה'))), 'image/jpeg', 0.9));
  return compressPhoto(new File([blob], 'photo.jpg', { type: 'image/jpeg' }), OUT, 80_000);
}
/** The cropped photo goes to R2 when it can (a short link in the profile); otherwise the small data URL, as before. */
export const saveCustomPhoto = async (uid: string, photo: string) => write.update('users', uid, { photo: await storePhoto(photo, 'avatar'), photoSource: 'custom', updatedAt: nowIso() });
export async function savePhotoSource(uid: string, source: PhotoSource) {
  const patch: Record<string, unknown> = { photoSource: source, updatedAt: nowIso() };
  if (source === 'google') { const g = await googlePhotoUrl(); if (g) patch.googlePhoto = g; }
  return write.update('users', uid, patch);
}
/** Keeps the copy of the Google picture fresh (quiet: the rules may still refuse it, which must not alarm anyone). */
export function useGooglePhotoSync(profile: Profile) {
  useEffect(() => {
    if (getDemo().on) return;
    let off = false;
    void googlePhotoUrl().then((g) => { if (!off && g && g !== profile.googlePhoto) void write.update('users', profile.uid, { googlePhoto: g }, { quiet: true }).catch(() => {}); });
    return () => { off = true; };
  }, [profile.uid, profile.googlePhoto]);
}

// ---------- registration questions (settings.registrationFields; the same rules as the old RegistrationFields.tsx) ----------
/** The questions a person answers: a label, and options for a choice; the receipt preference has its own toggle. */
export const registrationQuestions = (fields: RegistrationField[] | undefined) => (fields || []).filter((f) => (
  f.id !== RECEIPT_PREFERENCE_FIELD && (f.label || '').trim() && (f.type !== 'choice' || (f.options || []).length)
));
/** The stored answer, or '' (a choice answer that is no longer one of the options counts as none). */
export function answerOf(answers: Record<string, string> | undefined, field: RegistrationField) {
  const value = answers?.[field.id];
  return typeof value === 'string' && (field.type !== 'choice' || (field.options || []).includes(value)) ? value : '';
}
/** The stored answers of these questions only (the draft a form starts from); other keys of `fields` are left alone. */
export const answersFor = (answers: Record<string, string> | undefined, questions: RegistrationField[]) =>
  Object.fromEntries(questions.filter((f) => typeof answers?.[f.id] === 'string').map((f) => [f.id, answers![f.id]]));
/** The ids of required questions still without an answer. */
export const missingAnswers = (answers: Record<string, string> | undefined, questions: RegistrationField[]) =>
  questions.filter((f) => f.required && !answerOf(answers, f).trim()).map((f) => f.id);
/** What the profile shows for an answer: a date question "1975-03-14" as "14.03.1975". */
export const answerText = (answers: Record<string, string> | undefined, field: RegistrationField) => {
  const a = answerOf(answers, field);
  return field.type === 'date' ? birthText(a) : a;
};

// ---------- profile ----------
/** `answers`: the registration questions (optional; kept as they are when left out). */
export type ProfileDraft = { displayName: string; phone: string; town: string; birthDate: string; receipt: 'whatsapp' | 'email'; answers?: Record<string, string> };
export const receiptOf = (p: Profile): 'whatsapp' | 'email' => (p.fields?.[RECEIPT_PREFERENCE_FIELD] === 'email' ? 'email' : 'whatsapp');
/** "14.3.1975" / "14/03/1975" / "1975-03-14" -> "1975-03-14"; '' stays ''; null when it is not a date. */
export function parseBirth(s: string): string | null {
  const t = s.trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || dt.getTime() > nowMs()) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const birthText = (iso?: string) => { const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || ''; };
const trimmed = (a: Record<string, string> | undefined) => Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
/** Only the person's own fields; never role, status or anything a manager owns. */
export function saveProfile(p: Profile, d: ProfileDraft) {
  return write.update('users', p.uid, {
    displayName: d.displayName.trim(), phone: d.phone.trim(), town: d.town.trim(), birthDate: parseBirth(d.birthDate) || '',
    fields: { ...(p.fields || {}), ...trimmed(d.answers), [RECEIPT_PREFERENCE_FIELD]: d.receipt }, updatedAt: nowIso(),
  });
}

// ---------- notifications preferences (L6 / C12 row) ----------
// push preferences are saved by the push area (src/app/v2/data/push.ts), which keeps the device list

// ---------- counts and presence (L6 / C12) ----------
/** Tasks I marked done today, this week (from Sunday) and this month. */
export function useMyCounts(ctx: V2Ctx) {
  const s = periodStarts(ctx.today);
  const done = useHistoryTasks(ctx.role !== 'vendor', ctx.manager, s.month, s.end);
  return useMemo(() => {
    const mine = done.items.filter((t) => t.doneBy?.uid === ctx.user.uid && t.doneAt);
    return { day: mine.filter((t) => t.doneAt! >= s.day).length, week: mine.filter((t) => t.doneAt! >= s.week).length, month: mine.length, loading: done.loading };
  }, [done.items, done.loading, ctx.user.uid, s.day, s.week]);
}
/** "היום, עד 13:00" / "היום, כל היום" from my presence entries today (calendar kind 'presence'). */
export function usePresenceText(uid: string, today: string, enabled = true) {
  const r = useList<CalendarItem>('calendar', { where: [['date', '==', today], ['kind', '==', 'presence'], ['ownerUid', '==', uid]] }, enabled && !!uid);
  if (!r.items.length) return r.loading ? '' : 'לא היום';
  const ends: string[] = [];
  for (const c of r.items) {
    const to = c.to || (c.time || '').split(/[–-]/)[1]?.trim();
    if (!to) return 'היום, כל היום';
    ends.push(to);
  }
  return `היום, עד ${ends.sort().at(-1)}`;
}

// ---------- first entry (C9) ----------
/** The role invitation a manager prepared for this e-mail. In demo the "new" persona answers the latest invitation. */
export function useInviteFor(email: string) {
  const e = (email || '').toLowerCase();
  const one = useDoc<RoleInvite>(`role_invites/${e || '_'}`, !!e && !getDemo().on);
  const all = useList<RoleInvite>('role_invites', { orderBy: [['createdAt', 'desc']], limit: 5 }, getDemo().on);
  if (getDemo().on) return { invite: all.items.find((i) => i.email === e) || all.items[0] || null, loading: all.loading };
  return { invite: one.item, loading: one.loading };
}
export const INVITE_ROLE_WORD: Record<RoleInvite['role'], string> = { staff: 'כמתנדב', manager: 'כמנהל', owner: 'כבעלים' };
export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || '';
/** `fields`: the whole answers map to store (the profile's fields with the new answers); left out, fields stay untouched. */
export const markWelcomed = (uid: string, d: { displayName: string; phone: string; fields?: Record<string, string> }) =>
  write.update('users', uid, { displayName: d.displayName.trim(), phone: d.phone.trim(), ...(d.fields ? { fields: trimmed(d.fields) } : {}), welcomedAt: nowIso(), updatedAt: nowIso() });

// ---------- install (C10) ----------
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e as InstallPrompt; installListeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { writeFlag(INSTALLED_KEY, 'yes'); installPrompt = null; installListeners.forEach((l) => l()); });
}
export const useInstallPrompt = () => useSyncExternalStore((l) => { installListeners.add(l); return () => installListeners.delete(l); }, () => installPrompt);
export async function promptInstall() {
  const p = installPrompt; if (!p) return false;
  installPrompt = null; installListeners.forEach((l) => l());
  try { await p.prompt(); return (await p.userChoice).outcome === 'accepted'; } catch { return false; }
}
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);

// ---------- the install offer (C10 once, right after the first entry) ----------
// No strip or banner anywhere (needs-design decision 1): C10 is offered once, as its own screen after C9, and then only from
// the profile row "התקנה למסך הבית". "Once" is per device (localStorage), like installing itself: a new phone is offered again.
const INSTALL_OFFERED_KEY = 'farm-install-offered';
const INSTALLED_KEY = 'farm-app-installed';
function readFlag(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function writeFlag(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* installing still works for this visit */ } }
export const isInstalledApp = () => isStandalone() || readFlag(INSTALLED_KEY) === 'yes';
/** C10 as the step after C9: /install with first=1 ("אחר כך" and installing go on to the app instead of back). */
export const FIRST_INSTALL = '/install?first=1';
/** Pure: offer C10 after the first entry? Not in demo, not when the app already runs installed, and only once on this device. */
export const installOfferDue = (o: { demo: boolean; installed: boolean; offered: boolean }) => !o.demo && !o.installed && !o.offered;
export const installOffered = () => readFlag(INSTALL_OFFERED_KEY) === 'yes';
/** Where C9 goes when it is done: C10 the first time on this device (and remembers it was offered), else the app. */
export function afterFirstEntry(demo: boolean): string {
  if (!installOfferDue({ demo, installed: isInstalledApp(), offered: installOffered() })) return '/tasks';
  writeFlag(INSTALL_OFFERED_KEY, 'yes');
  return FIRST_INSTALL;
}

// ---------- offline queue (C8) ----------
// db.ts counts pending writes but does not describe them. The queue view lists my own activity entries written since the
// connection dropped: every meaningful write logs one (activity.ts), and Firestore shows a pending local write in queries.
const OFF_KEY = 'farm-offline-since';
const readOff = () => { try { return localStorage.getItem(OFF_KEY) || ''; } catch { return ''; } };
export const setOfflineSince = (iso: string) => { try { iso ? localStorage.setItem(OFF_KEY, iso) : localStorage.removeItem(OFF_KEY); } catch { /* private mode */ } };
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { if (!readOff()) setOfflineSince(nowIso()); });
  window.addEventListener('online', () => setTimeout(() => setOfflineSince(''), 30_000));
}
export type QueueRow = { id: string; icon: 'tasks' | 'cart' | 'file'; title: string; meta: string };
const actionTitle = (a: Activity) => {
  if (a.action === 'created' && (a.kind === 'task' || a.kind === 'task_private')) return `משימה חדשה: ${a.text}`;
  if (a.action === 'added' && a.kind === 'shopping') return `קנייה חדשה: ${a.text}`;
  const word: Record<string, string> = { done: 'בוצע', bought: 'נקנה', edited: 'נערך', photo: 'תמונה נוספה', note: 'הערה נוספה', assigned: 'הוקצה', undone: 'הוחזר לביצוע', deleted: 'נמחק' };
  return `${word[a.action] || 'נשמר'}: ${a.text.replace(' · ', ', ')}`;
};
const hm = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** Demo C8: the designed queue (the strip says 3). */
const DEMO_QUEUE: QueueRow[] = [
  { id: 'q1', icon: 'tasks', title: 'בוצע: לפרוס רשתות צל', meta: '08:30 · עם תמונה' },
  { id: 'q2', icon: 'cart', title: 'נקנה: ביצים, 2 תבניות', meta: '08:40' },
  { id: 'q3', icon: 'tasks', title: 'משימה חדשה: לתקן את הברז', meta: '09:02' },
];
export function useOfflineQueue(uid: string, pending: number, demoOffline: boolean) {
  const since = readOff();
  const mine = useActivityBy(uid, !!uid && (demoOffline || pending > 0 || !!since), 40);
  return useMemo(() => {
    const live: QueueRow[] = mine.items.filter((a) => since && a.at >= since).map((a) => ({ id: a.id, icon: a.kind === 'shopping' ? 'cart' : a.kind.startsWith('task') ? 'tasks' : 'file', title: actionTitle(a), meta: hm(a.at) }));
    return demoOffline ? [...live, ...DEMO_QUEUE] : live;
  }, [mine.items, since, demoOffline]);
}

// ---------- suspended (X2) ----------
/** When the account was suspended: the latest "נחסם" log entry, else the last update. */
export function suspendedAt(p: Profile) {
  const hit = [...(p.log || [])].reverse().find((l) => /נחסם|הושעה/.test(l.text));
  return hit?.at || p.updatedAt || '';
}

// ---------- search (C2) ----------
export type SearchKind = 'people' | 'visits' | 'tasks' | 'events' | 'shopping' | 'places';
export type Hit = { id: string; kind: SearchKind; title: string; meta: string; tag?: { text: string; tone: 'warm' | 'waiting' }; initials?: string; href: string };
const norm = (s: string) => (s || '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[-\s]+/g, ' ').trim();
const digits = (s: string) => (s || '').replace(/\D/g, '');
function matches(q: string, ...fields: (string | undefined)[]) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return false;
  const hay = norm(fields.filter(Boolean).join(' '));
  const hayDigits = digits(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w) || (/^[\d-]{3,}$/.test(w) && hayDigits.includes(digits(w))));
}
const ROLE_TAG: Partial<Record<Profile['role'], string>> = { owner: 'בעלים', manager: 'מנהל', staff: 'מתנדב' };

/** Everything the person may read, loaded once while the search screen is open. Volunteers get no people, visits or money. */
export function useSearchData(ctx: V2Ctx) {
  const manager = ctx.manager;
  const s = periodStarts(ctx.today);
  const from = new Date(keyToUtc(ctx.today) - 45 * 86400_000).toISOString();
  const open = useOpenTasks(true, manager);
  const done = useHistoryTasks(true, manager, from, s.end);
  const shop = useOpenShopping(true);
  const bought = useRecentBought(true);
  const events = useAllEvents(true);
  const visits = useVisits(manager);
  const unpaid = useList<Ticket>('tickets', { where: [['paymentStatus', 'in', ['pending', 'claimed']]], limit: 500 } as Spec, manager);
  const loading = open.loading || shop.loading || events.loading;
  return { tasks: [...open.items, ...done.items.filter((t) => !open.items.some((o) => o.id === t.id))], shopping: [...shop.items, ...bought.items.filter((b) => !shop.items.some((s) => s.id === b.id))], events: events.items, visits: manager ? visits.items : [], unpaid: manager ? unpaid.items : [], loading };
}

export function searchAll(ctx: V2Ctx, data: ReturnType<typeof useSearchData>, q: string): Hit[] {
  if (!norm(q)) return [];
  const out: Hit[] = [];
  const manager = ctx.manager;
  const fname = (n?: string) => firstName(n || '');
  const dayDate = (iso: string) => { const k = iso.slice(0, 10); const wd = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][new Date(keyToUtc(k)).getUTCDay()]; return `${wd} ${+k.slice(8, 10)}.${+k.slice(5, 7)}`; };
  if (manager) {
    const people = [...ctx.peopleByUid.values()].filter((p) => p.role !== 'vendor' && p.uid && !p.uid.startsWith('demo-u-farm'));
    // the team first, then people with something open (money, a visit request), then everyone else
    const rank = (p: Profile) => (ROLE_TAG[p.role] ? 0 : data.unpaid.some((t) => t.ownerUid === p.uid) || data.visits.some((v) => v.uid === p.uid && v.status === 'new') ? 1 : 2);
    for (const p of people.sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, 'he'))) {
      if (!matches(q, p.displayName, p.phone, p.email, p.town)) continue;
      const owes = data.unpaid.filter((t) => t.ownerUid === p.uid && t.status === 'valid');
      const sum = owes.reduce((s, t) => s + (Number(t.price) || 0), 0);
      const visit = data.visits.find((v) => v.uid === p.uid && v.status === 'new');
      const extra = sum ? owes[0].eventTitle : visit ? gw(p.displayName, 'ביקש ביקור', 'ביקשה ביקור', p) : '';
      const role = ROLE_TAG[p.role];
      out.push({ id: p.uid, kind: 'people', title: p.displayName, meta: [p.phone, extra].filter(Boolean).join(' · '), initials: p.displayName,
        tag: sum ? { text: `${Math.round(sum).toLocaleString('en-US')} ₪`, tone: 'waiting' } : role ? { text: role, tone: 'warm' } : undefined, href: `/manage/people/${p.uid}` });
    }
    for (const v of data.visits as Visit[]) {
      if (v.status === 'cancelled' || !matches(q, v.name, v.phone, v.type, v.note)) continue;
      out.push({ id: v.id, kind: 'visits', title: `${v.name} · ${v.people} אנשים`, meta: [v.date ? dayDate(v.date) : '', v.type].filter(Boolean).join(' · '),
        tag: v.status === 'new' ? { text: 'חדש', tone: 'waiting' } : undefined, href: `/manage/visits/${v.id}` });
    }
  }
  for (const t of data.tasks as Task[]) {
    if ((!manager && t.managersOnly) || !matches(q, t.title, t.note, t.location?.placeName)) continue;
    const when = t.dueDate ? (t.dueDate === ctx.today ? 'היום' : dayDate(t.dueDate)) : '';
    const meta = t.done
      ? ['בוצע', fname(t.doneBy?.name), t.doneAt ? `${+t.doneAt.slice(8, 10)}.${+t.doneAt.slice(5, 7)}` : ''].filter(Boolean).join(' · ')
      : [t.assignee ? (t.assignee.uid === ctx.user.uid ? 'עליך' : fname(t.assignee.name)) : 'פנויה', when].filter(Boolean).join(' · ');
    out.push({ id: t.id, kind: 'tasks', title: t.title, meta, href: `/tasks/${t.id}` });
  }
  for (const e of data.events as FarmEvent[]) {
    if (!manager && !e.published) continue;
    if (!matches(q, e.title, e.location, e.description)) continue;
    out.push({ id: e.id, kind: 'events', title: e.title, meta: e.start ? dayDate(e.start) : '', href: manager ? `/manage/events/${e.id}` : `/farm/events/${e.id}` });
  }
  for (const s of data.shopping as ShoppingItem[]) {
    if (!matches(q, s.title, s.note, s.qty)) continue;
    out.push({ id: s.id, kind: 'shopping', title: s.title, meta: [s.qty, s.bought ? 'נקנה' : ''].filter(Boolean).join(' · '), href: `/shopping/${s.id}` });
  }
  for (const p of ctx.places as Place[]) {
    if (!matches(q, p.name)) continue;
    out.push({ id: p.id, kind: 'places', title: p.name, meta: '', href: `/places/${p.id}` });
  }
  return out;
}
