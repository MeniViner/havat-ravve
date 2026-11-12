// Auth, profiles, people, tasks, recurring templates, shopping and places.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, runTransaction } from 'firebase/firestore';
import { db, auth, authReady, ownerEmail, nowIso, todayKey, hoursAgoIso, isGoogleUser, type Session } from './firebase';
import { useList, useDoc, write, newId } from './db';
import { useDemo, PERSONA_UID, demoDoc, demoOnly } from './demo/store';
import { logActivity } from './activity';
import type { Profile, Task, Template, ShoppingItem, Place, RoleInvite, Actor, Role, Status, ShoppingCategory, TaskLocation } from './types';
import { CATEGORY_LABELS, ROLE_LABELS } from './types';

// ---------- auth ----------
type AuthState = { loading: boolean; user: User | null };
let authState: AuthState = { loading: true, user: null };
const authListeners = new Set<() => void>();
authReady.then(() => onAuthStateChanged(auth, (user) => { authState = { loading: false, user: isGoogleUser(user) ? user : null }; authListeners.forEach((l) => l()); }));
const useFirebaseAuth = () => useSyncExternalStore((l) => { authListeners.add(l); return () => authListeners.delete(l); }, () => authState);

/** The current session: the signed-in Google account, or the active demo persona. */
export function useAuth(): { loading: boolean; user: Session | null; real: boolean } {
  const fb = useFirebaseAuth();
  const demo = useDemo();
  return useMemo(() => {
    if (demo.on) {
      const uid = PERSONA_UID[demo.persona];
      const p = uid ? (demoDoc('users/' + uid) as Profile | null) : null;
      return { loading: false, user: p ? { uid: p.uid, email: p.email, displayName: p.displayName } : null, real: false };
    }
    return { loading: fb.loading, user: fb.user ? { uid: fb.user.uid, email: fb.user.email || '', displayName: fb.user.displayName || '' } : null, real: true };
  }, [fb, demo.on, demo.persona]);
}

// ---------- profile ----------
export function useProfile(user: Session | null) {
  const { item, loading, error } = useDoc<Profile>('users/' + (user?.uid || '_'), !!user);
  // a profile that could not be read is not a missing profile: never send an existing member to registration because of a network error
  return { profile: item ? { ...item, uid: user!.uid } : null, loading, error: error || '', missing: !!user && !loading && !item && !error };
}

export const isOwnerEmail = (email?: string | null) => !!email && email.toLowerCase() === ownerEmail.toLowerCase();
export const canManage = (p: Profile | null, email?: string | null) => isOwnerEmail(email) || (!!p && p.status === 'active' && (p.role === 'owner' || p.role === 'manager'));
export const isOwner = (p: Profile | null, email?: string | null) => isOwnerEmail(email) || (!!p && p.status === 'active' && p.role === 'owner');
export const isTeam = (p: Profile | null, email?: string | null) => canManage(p, email) || (!!p && p.status === 'active' && p.role === 'staff');
export const actorOf = (user: Session, p: Profile | null): Actor => ({ uid: user.uid, name: p?.displayName || user.displayName || user.email || '' });

/** The role for a brand-new account: owner by bootstrap email, otherwise whatever a manager pre-assigned to this email, otherwise guest. Real accounts only. */
export async function createProfile(user: Session, data: { displayName: string; phone: string }) {
  // this transaction talks to Firestore directly, so it must never run for a demo persona
  if (demoOnly() || user.uid.startsWith('demo-')) throw new Error('במצב הדגמה לא נרשמים באמת. יוצאים מההדגמה כדי להירשם.');
  const email = (user.email || '').toLowerCase();
  const counterRef = doc(db, 'counters', 'users');
  const userRef = doc(db, 'users', user.uid);
  const inviteRef = doc(db, 'role_invites', email);
  const now = nowIso();
  await runTransaction(db, async (t) => {
    const existing = await t.get(userRef);
    if (existing.exists()) return;
    const counter = await t.get(counterRef);
    const invite = isOwnerEmail(email) ? null : await t.get(inviteRef).catch(() => null);
    const value = (counter.exists() ? counter.data().value : 0) + 1;
    if (counter.exists()) t.update(counterRef, { value }); else t.set(counterRef, { value });
    const role: Role = isOwnerEmail(email) ? 'owner' : (invite?.exists() ? (invite.data().role as Role) : 'guest');
    const profile: Profile = { uid: user.uid, email, displayName: data.displayName.trim(), phone: data.phone.trim(), role, status: 'active', customerNumber: value, acceptedTermsAt: now, createdAt: now, updatedAt: now };
    t.set(userRef, profile);
  });
  logActivity({ uid: user.uid, name: data.displayName.trim() }, 'user', user.uid, 'joined', `${data.displayName.trim()} נרשם/ה`, { subjectUid: user.uid });
}

export const updateOwnProfile = (uid: string, data: { displayName?: string; phone?: string; fields?: Record<string, string> }) =>
  write.update('users', uid, { ...(data.displayName !== undefined ? { displayName: data.displayName.trim() } : {}), ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}), ...(data.fields ? { fields: data.fields } : {}), updatedAt: nowIso() });

// ---------- people (managers) ----------
export const usePeople = (enabled: boolean) => useList<Profile>('users', { orderBy: [['displayName', 'asc']] }, enabled);
/** Team members only (names for "who is it on"). Volunteers may read this list; the full people list is for managers. */
export function useTeam(enabled: boolean) {
  const r = useList<Profile>('users', { where: [['role', 'in', ['owner', 'manager', 'staff']]] }, enabled);
  return useMemo(() => ({ ...r, items: r.items.filter((p) => p.status === 'active').sort((a, b) => a.displayName.localeCompare(b.displayName, 'he')) }), [r]);
}
export const usePerson = (uid: string, enabled = true) => useDoc<Profile>('users/' + (uid || '_'), enabled && !!uid);
export async function setUserRole(actor: Actor, p: Profile, role: Role, status: Status, notes = p.notes || '') {
  const entry = { at: nowIso(), by: actor, text: role !== p.role ? `תפקיד: ${ROLE_LABELS[p.role]} ← ${ROLE_LABELS[role]}` : status !== p.status ? `מצב: ${status === 'blocked' ? 'נחסם' : 'שוחרר'}` : 'עודכן' };
  await write.update('users', p.uid, { role, status, notes, updatedAt: nowIso(), log: [...(p.log || []).slice(-29), entry] });
  if (role !== p.role) logActivity(actor, 'user', p.uid, 'role', `${p.displayName}: ${ROLE_LABELS[p.role]} ← ${ROLE_LABELS[role]}`, { subjectUid: p.uid });
  if (status !== p.status) logActivity(actor, 'user', p.uid, status === 'blocked' ? 'blocked' : 'unblocked', `${p.displayName} ${status === 'blocked' ? 'נחסם/ה' : 'שוחרר/ה'}`, { subjectUid: p.uid });
}
export const setUserNotes = (p: Profile, notes: string) => write.update('users', p.uid, { notes, updatedAt: nowIso() });

export const useRoleInvites = (enabled: boolean) => useList<RoleInvite>('role_invites', { orderBy: [['createdAt', 'desc']] }, enabled);
export async function inviteByEmail(actor: Actor, email: string, role: RoleInvite['role'] | 'guest') {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e)) throw Error('כתובת מייל לא תקינה');
  if (role === 'guest') { await write.remove('role_invites', e); return; }
  await write.set('role_invites', e, { email: e, role, createdBy: actor, createdAt: nowIso() });
  logActivity(actor, 'user', e, 'invited', `${e} הוגדר/ה מראש כ${ROLE_LABELS[role]}`);
}
export const removeRoleInvite = (email: string) => write.remove('role_invites', email);

// ---------- tasks ----------
const staffOnly = (manager: boolean): Spec['where'] => (manager ? [] : [['managersOnly', '==', false]]);
type Spec = import('./db').Spec;
export const useOpenTasks = (enabled: boolean, manager: boolean) => useList<Task>('tasks', { where: [...staffOnly(manager)!, ['done', '==', false]], orderBy: [['createdAt', 'desc']] }, enabled);
function useCutoff(hours: number) {
  const [cutoff, setCutoff] = useState(hoursAgoIso(hours));
  useEffect(() => { const t = setInterval(() => setCutoff(hoursAgoIso(hours)), 10 * 60_000); return () => clearInterval(t); }, [hours]);
  return cutoff;
}
export function useRecentDoneTasks(enabled: boolean, manager: boolean, hours = 24) {
  const cutoff = useCutoff(hours);
  return useList<Task>('tasks', { where: [...staffOnly(manager)!, ['doneAt', '>=', cutoff]], orderBy: [['doneAt', 'desc']] }, enabled);
}
export const useHistoryTasks = (enabled: boolean, manager: boolean, fromIso: string, toIso: string) =>
  useList<Task>('tasks', { where: [...staffOnly(manager)!, ['doneAt', '>=', fromIso], ['doneAt', '<=', toIso]], orderBy: [['doneAt', 'desc']], limit: 500 }, enabled);
export const useTask = (id: string, enabled = true) => useDoc<Task>('tasks/' + (id || '_'), enabled && !!id);
export const useTasksAtPlace = (placeId: string, enabled = true) => useList<Task>('tasks', { where: [['location.placeId', '==', placeId]], orderBy: [['createdAt', 'desc']], limit: 50 }, enabled && !!placeId);

export type NewTask = { title: string; note: string; photo: string; location: TaskLocation | null; dueDate: string; managersOnly: boolean; assignee: Actor | null; urgent: boolean };
const taskText = (t: { title: string }) => t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title;
export async function addTask(actor: Actor, data: NewTask) {
  const now = nowIso();
  const id = newId('tasks');
  await write.set('tasks', id, { ...data, title: data.title.trim(), templateId: null, dateKey: null, createdBy: actor, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', updatedAt: now });
  logActivity(actor, 'task', id, 'created', taskText(data), { subjectUid: data.assignee?.uid });
  if (data.assignee && data.assignee.uid !== actor.uid) logActivity(actor, 'task', id, 'assigned', `${taskText(data)} ← ${data.assignee.name}`, { subjectUid: data.assignee.uid });
  return id;
}
export async function editTask(actor: Actor, task: Task, data: Partial<NewTask>) {
  await write.update('tasks', task.id, { ...data, updatedAt: nowIso() });
  if (data.urgent !== undefined && data.urgent !== task.urgent && Object.keys(data).length === 1) { logActivity(actor, 'task', task.id, data.urgent ? 'urgent' : 'edited', `${data.urgent ? 'סומנה דחוף: ' : 'הורד הדחוף: '}${taskText(task)}`); return; }
  logActivity(actor, 'task', task.id, 'edited', taskText({ title: data.title ?? task.title }));
  if (data.assignee && data.assignee.uid !== task.assignee?.uid) logActivity(actor, 'task', task.id, 'assigned', `${taskText(task)} ← ${data.assignee.name}`, { subjectUid: data.assignee.uid });
}
export async function setTaskDone(actor: Actor, task: Task, done: boolean) {
  const now = nowIso();
  await write.update('tasks', task.id, done ? { done: true, doneBy: actor, doneAt: now, updatedAt: now } : { done: false, doneBy: null, doneAt: null, updatedAt: now }); // the result photo and note stay: un-ticking by mistake must not destroy them
  logActivity(actor, 'task', task.id, done ? 'done' : 'undone', taskText(task), { subjectUid: task.assignee?.uid });
}
export async function setTaskDoneDetails(actor: Actor, task: Task, data: { donePhoto?: string; doneNote?: string }) {
  await write.update('tasks', task.id, { ...data, updatedAt: nowIso() });
  logActivity(actor, 'task', task.id, data.donePhoto !== undefined ? 'photo' : 'note', `${taskText(task)}${data.doneNote ? ': ' + data.doneNote : ''}`);
}
export async function deleteTask(actor: Actor, task: Task) {
  await write.remove('tasks', task.id);
  logActivity(actor, 'task', task.id, 'deleted', taskText(task));
}
export const restoreTask = (task: Task) => { const { id, ...rest } = task; return write.set('tasks', id, rest); };

// ---------- templates (recurring) ----------
export const useTemplates = (enabled: boolean, manager: boolean) => useList<Template>('task_templates', { where: staffOnly(manager), orderBy: [['createdAt', 'asc']] }, enabled);
export const useTemplateTasks = (templateId: string, fromIso: string, enabled = true) => useList<Task>('tasks', { where: [['templateId', '==', templateId], ['createdAt', '>=', fromIso]], orderBy: [['createdAt', 'desc']], limit: 60 }, enabled && !!templateId);
export type NewTemplate = { title: string; note: string; days: number[]; time: string; active: boolean; managersOnly: boolean };
export async function saveTemplate(actor: Actor, data: NewTemplate, existing?: Template) {
  const now = nowIso();
  if (existing) await write.update('task_templates', existing.id, { ...data, title: data.title.trim(), updatedAt: now });
  else await write.set('task_templates', newId('task_templates'), { ...data, title: data.title.trim(), createdBy: actor, createdAt: now, updatedAt: now });
}
export const deleteTemplate = (id: string) => write.remove('task_templates', id);

/** Today's instances of recurring tasks, done or not. The shell uses it to know which ones still have to be created. */
export const useTodayInstances = (enabled: boolean, manager: boolean, key: string) => useList<Task>('tasks', { where: [...staffOnly(manager)!, ['dateKey', '==', key]] }, enabled);
/** Creates today's missing instances of due recurring templates (id = templateId_date, so two phones create the same document).
 *  No transaction: it has to work without reception. If the document already exists on the server the rules refuse the second write, quietly. */
export function materializeToday(templates: Template[], existing: Task[], actor: Actor, key: string) {
  const weekday = new Date(key + 'T12:00:00').getDay();
  const have = new Set(existing.map((t) => t.id));
  for (const t of templates) {
    if (!t.active || !(t.days.length === 0 || t.days.includes(weekday))) continue;
    const id = `${t.id}_${key}`;
    if (have.has(id)) continue;
    const now = nowIso();
    write.set('tasks', id, { title: t.title, note: t.note, photo: '', location: null, dueDate: key, managersOnly: t.managersOnly, templateId: t.id, dateKey: key, createdBy: actor, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: now }, { quiet: true }).catch(() => {});
  }
}
/** The calendar day in Israel, kept current while the app stays open overnight or comes back from the background. */
export function useToday() {
  const [key, setKey] = useState(todayKey());
  useEffect(() => {
    const tick = () => setKey(todayKey());
    const t = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return key;
}

// ---------- shopping ----------
export const useOpenShopping = (enabled: boolean) => useList<ShoppingItem>('shopping', { where: [['bought', '==', false]], orderBy: [['createdAt', 'desc']] }, enabled);
export function useRecentBought(enabled: boolean) {
  const cutoff = useCutoff(24);
  return useList<ShoppingItem>('shopping', { where: [['boughtAt', '>=', cutoff]], orderBy: [['boughtAt', 'desc']] }, enabled);
}
export const useBoughtHistory = (enabled: boolean, fromIso: string) => useList<ShoppingItem>('shopping', { where: [['boughtAt', '>=', fromIso]], orderBy: [['boughtAt', 'desc']], limit: 400 }, enabled);
export const useShoppingItem = (id: string, enabled = true) => useDoc<ShoppingItem>('shopping/' + (id || '_'), enabled && !!id);
export type NewShopping = { title: string; qty: string; note: string; link: string; category: ShoppingCategory; urgent: boolean };
export async function addShopping(actor: Actor, data: NewShopping) {
  const now = nowIso();
  const id = newId('shopping');
  await write.set('shopping', id, { ...data, title: data.title.trim(), qty: data.qty.trim(), link: data.link.trim(), createdBy: actor, createdAt: now, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now });
  logActivity(actor, 'shopping', id, 'added', `${data.title.trim()}${data.qty ? ' · ' + data.qty.trim() : ''} (${CATEGORY_LABELS[data.category]})`);
  return id;
}
export async function editShopping(actor: Actor, item: ShoppingItem, data: Partial<NewShopping>) {
  await write.update('shopping', item.id, { ...data, updatedAt: nowIso() });
  if (data.urgent !== undefined && data.urgent !== item.urgent && Object.keys(data).length === 1) { logActivity(actor, 'shopping', item.id, 'edited', `${data.urgent ? 'סימן/ה דחוף: ' : 'הורד הדחוף: '}${item.title}${item.qty ? ' · ' + item.qty : ''}`); return; }
  logActivity(actor, 'shopping', item.id, 'edited', data.title ?? item.title);
}
export async function setBought(actor: Actor, item: ShoppingItem, bought: boolean) {
  const now = nowIso();
  await write.update('shopping', item.id, bought
    ? { bought: true, boughtBy: actor, boughtAt: now, expireAt: new Date(Date.now() + 24 * 3600_000).toISOString(), updatedAt: now }
    : { bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now });
  logActivity(actor, 'shopping', item.id, bought ? (item.category === 'giveaway' ? 'found' : 'bought') : 'unbought', `${item.title}${item.qty ? ' · ' + item.qty : ''}`);
}
export async function deleteShopping(actor: Actor, item: ShoppingItem) {
  await write.remove('shopping', item.id);
  logActivity(actor, 'shopping', item.id, 'deleted', item.title);
}
export const restoreShopping = (item: ShoppingItem) => { const { id, ...rest } = item; return write.set('shopping', id, rest); };

// ---------- places ----------
export const usePlaces = (enabled: boolean) => useList<Place>('places', { orderBy: [['name', 'asc']] }, enabled);
export const usePlace = (id: string, enabled = true) => useDoc<Place>('places/' + (id || '_'), enabled && !!id);
export async function addPlace(actor: Actor, name: string, lat: number, lng: number) {
  const id = newId('places');
  await write.set('places', id, { name: name.trim(), lat, lng, createdBy: actor, createdAt: nowIso() });
  logActivity(actor, 'place', id, 'created', name.trim());
  return id;
}
export const updatePlace = (id: string, data: Partial<Pick<Place, 'name' | 'lat' | 'lng'>>) => write.update('places', id, data);
export const deletePlace = (id: string) => write.remove('places', id);

// ---------- helpers ----------
export async function compressPhoto(file: File, maxDim = 1280, maxChars = 380_000): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('בחרו תמונה');
  const bitmap = await createImageBitmap(file).catch(() => { throw Error('לא הצלחנו לקרוא את התמונה'); });
  try {
    for (const dim of [maxDim, 960, 720, 540, 400]) {
      const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const type of ['image/webp', 'image/jpeg']) {
        const url = canvas.toDataURL(type, 0.78);
        if (url.startsWith(`data:${type};`) && url.length <= maxChars) return url; // Safari answers PNG when asked for WebP
      }
    }
    throw Error('התמונה גדולה מדי גם אחרי דחיסה');
  } finally { bitmap.close(); }
}

export function getPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(Error('אין גישה למיקום במכשיר הזה'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
      () => reject(Error('לא הצלחנו לקבל מיקום. בדקו שהרשאת מיקום פתוחה.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

export const useOnline = () => useSyncExternalStore(
  (l) => { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; },
  () => navigator.onLine,
);
