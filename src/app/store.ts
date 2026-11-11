import { useEffect, useState, useSyncExternalStore } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, runTransaction, setDoc, updateDoc, deleteDoc,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { db, auth, authReady, ownerEmail, nowIso, todayKey, hoursAgoIso, isGoogleUser } from './firebase';
import { logActivity } from './activity';
import type { Profile, Task, Template, ShoppingItem, Place, RoleInvite, Actor, Role, Status, ShoppingCategory, TaskLocation } from './types';
import { CATEGORY_LABELS } from './types';

// ---------- auth ----------
export type AuthState = { loading: boolean; user: User | null };
let authState: AuthState = { loading: true, user: null };
const authListeners = new Set<() => void>();
authReady.then(() => onAuthStateChanged(auth, (user) => { authState = { loading: false, user: isGoogleUser(user) ? user : null }; authListeners.forEach((l) => l()); }));
export const useAuth = () => useSyncExternalStore((l) => { authListeners.add(l); return () => authListeners.delete(l); }, () => authState);

// ---------- generic subscription ----------
export function useCollection<T>(path: string, constraints: QueryConstraint[], enabled: boolean, key: string) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({ items: [], loading: enabled, error: '' });
  useEffect(() => {
    if (!enabled) { setState({ items: [], loading: false, error: '' }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    const q = query(collection(db, path), ...constraints);
    return onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      setState({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T), loading: false, error: '' });
    }, (e) => setState({ items: [], loading: false, error: e.message }));
  }, [path, enabled, key]);
  return state;
}

// ---------- profile ----------
export function useProfile(user: User | null) {
  const [state, setState] = useState<{ profile: Profile | null; loading: boolean; missing: boolean }>({ profile: null, loading: !!user, missing: false });
  useEffect(() => {
    if (!user) { setState({ profile: null, loading: false, missing: false }); return; }
    setState({ profile: null, loading: true, missing: false });
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setState({ profile: snap.exists() ? ({ ...(snap.data() as Profile), uid: snap.id }) : null, loading: false, missing: !snap.exists() });
    }, () => setState({ profile: null, loading: false, missing: true }));
  }, [user?.uid]);
  return state;
}

export const isOwnerEmail = (email?: string | null) => (email || '').toLowerCase() === ownerEmail.toLowerCase();
export const canManage = (p: Profile | null, email?: string | null) => isOwnerEmail(email) || (!!p && p.status === 'active' && (p.role === 'owner' || p.role === 'manager'));
export const isOwner = (p: Profile | null, email?: string | null) => isOwnerEmail(email) || (!!p && p.status === 'active' && p.role === 'owner');
export const isTeam = (p: Profile | null, email?: string | null) => canManage(p, email) || (!!p && p.status === 'active' && p.role === 'staff');
export const actorOf = (user: User, p: Profile | null): Actor => ({ uid: user.uid, name: p?.displayName || user.displayName || user.email || '' });

/** The role for a brand-new account: owner by bootstrap email, otherwise whatever a manager pre-assigned to this email, otherwise guest. */
export async function createProfile(user: User, data: { displayName: string; phone: string }) {
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

export async function updateOwnProfile(uid: string, data: { displayName: string; phone: string }) {
  await updateDoc(doc(db, 'users', uid), { displayName: data.displayName.trim(), phone: data.phone.trim(), updatedAt: nowIso() });
}

// ---------- people (managers) ----------
export const usePeople = (enabled: boolean) => useCollection<Profile>('users', [orderBy('displayName')], enabled, 'people');
export async function setUserRole(actor: Actor, p: Profile, role: Role, status: Status, notes = '') {
  const entry = { at: nowIso(), by: actor, text: role !== p.role ? `תפקיד: ${roleLabel(p.role)} ← ${roleLabel(role)}` : status !== p.status ? `מצב: ${status === 'blocked' ? 'נחסם' : 'שוחרר'}` : 'עודכן' };
  await updateDoc(doc(db, 'users', p.uid), { role, status, notes, updatedAt: nowIso(), log: [...(p.log || []).slice(-29), entry] });
  if (role !== p.role) logActivity(actor, 'user', p.uid, 'role', `${p.displayName}: ${roleLabel(p.role)} ← ${roleLabel(role)}`, { subjectUid: p.uid });
  if (status !== p.status) logActivity(actor, 'user', p.uid, status === 'blocked' ? 'blocked' : 'unblocked', `${p.displayName} ${status === 'blocked' ? 'נחסם/ה' : 'שוחרר/ה'}`, { subjectUid: p.uid });
}
const roleLabel = (r: Role) => ({ owner: 'בעלים', manager: 'מנהל/ת', staff: 'צוות', guest: 'אורח/ת' })[r];

export const useRoleInvites = (enabled: boolean) => useCollection<RoleInvite>('role_invites', [orderBy('createdAt', 'desc')], enabled, 'roleinv');
export async function inviteByEmail(actor: Actor, email: string, role: RoleInvite['role']) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e)) throw Error('כתובת מייל לא תקינה');
  await setDoc(doc(db, 'role_invites', e), { email: e, role, createdBy: actor, createdAt: nowIso() });
  logActivity(actor, 'user', e, 'invited', `${e} הוגדר/ה מראש כ${roleLabel(role)}`);
}
export const removeRoleInvite = (email: string) => deleteDoc(doc(db, 'role_invites', email));

// ---------- tasks ----------
export function useOpenTasks(enabled: boolean, manager: boolean) {
  const constraints = manager
    ? [where('done', '==', false), orderBy('createdAt', 'desc')]
    : [where('managersOnly', '==', false), where('done', '==', false), orderBy('createdAt', 'desc')];
  return useCollection<Task>('tasks', constraints, enabled, 'open' + manager);
}
export function useRecentDoneTasks(enabled: boolean, manager: boolean, hours = 24) {
  const [cutoff, setCutoff] = useState(hoursAgoIso(hours));
  useEffect(() => { const t = setInterval(() => setCutoff(hoursAgoIso(hours)), 10 * 60_000); return () => clearInterval(t); }, [hours]);
  const constraints = manager
    ? [where('doneAt', '>=', cutoff), orderBy('doneAt', 'desc')]
    : [where('managersOnly', '==', false), where('doneAt', '>=', cutoff), orderBy('doneAt', 'desc')];
  return useCollection<Task>('tasks', constraints, enabled, 'done' + manager + cutoff.slice(0, 13));
}
export function useHistoryTasks(enabled: boolean, manager: boolean, fromIso: string, toIso: string) {
  const constraints = manager
    ? [where('doneAt', '>=', fromIso), where('doneAt', '<=', toIso), orderBy('doneAt', 'desc'), limit(500)]
    : [where('managersOnly', '==', false), where('doneAt', '>=', fromIso), where('doneAt', '<=', toIso), orderBy('doneAt', 'desc'), limit(500)];
  return useCollection<Task>('tasks', constraints, enabled, 'hist' + manager + fromIso + toIso);
}

export type NewTask = { title: string; note: string; photo: string; location: TaskLocation | null; dueDate: string; managersOnly: boolean; assignee: Actor | null; urgent: boolean };
const taskText = (t: { title: string }) => t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title;
export async function addTask(actor: Actor, data: NewTask) {
  const now = nowIso();
  const ref = doc(collection(db, 'tasks'));
  await setDoc(ref, { ...data, title: data.title.trim(), templateId: null, dateKey: null, createdBy: actor, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', updatedAt: now });
  logActivity(actor, 'task', ref.id, 'created', taskText(data), { subjectUid: data.assignee?.uid });
  if (data.assignee && data.assignee.uid !== actor.uid) logActivity(actor, 'task', ref.id, 'assigned', `${taskText(data)} ← ${data.assignee.name}`, { subjectUid: data.assignee.uid });
  return ref.id;
}
export async function editTask(actor: Actor, task: Task, data: Partial<NewTask>) {
  const { id, ...rest } = task;
  await setDoc(doc(db, 'tasks', id), { ...rest, ...data, updatedAt: nowIso() });
  logActivity(actor, 'task', id, 'edited', taskText({ title: data.title ?? task.title }));
  if (data.assignee && data.assignee.uid !== task.assignee?.uid) logActivity(actor, 'task', id, 'assigned', `${taskText(task)} ← ${data.assignee.name}`, { subjectUid: data.assignee.uid });
}
export async function setTaskDone(actor: Actor, task: Task, done: boolean) {
  const { id, ...rest } = task;
  const now = nowIso();
  await setDoc(doc(db, 'tasks', id), done
    ? { ...rest, done: true, doneBy: actor, doneAt: now, updatedAt: now }
    : { ...rest, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', updatedAt: now });
  logActivity(actor, 'task', id, done ? 'done' : 'undone', taskText(task), { subjectUid: task.assignee?.uid });
}
export async function setTaskDoneDetails(actor: Actor, task: Task, data: { donePhoto?: string; doneNote?: string }) {
  const { id, ...rest } = task;
  await setDoc(doc(db, 'tasks', id), { ...rest, ...data, updatedAt: nowIso() });
  logActivity(actor, 'task', id, data.donePhoto !== undefined ? 'photo' : 'note', `${taskText(task)}${data.doneNote ? ': ' + data.doneNote : ''}`);
}
export async function deleteTask(actor: Actor, task: Task) {
  await deleteDoc(doc(db, 'tasks', task.id));
  logActivity(actor, 'task', task.id, 'deleted', taskText(task));
}

// ---------- templates (recurring) ----------
export const useTemplates = (enabled: boolean, manager: boolean) =>
  useCollection<Template>('task_templates', manager ? [orderBy('createdAt')] : [where('managersOnly', '==', false), orderBy('createdAt')], enabled, 'tpl' + manager);
export type NewTemplate = { title: string; note: string; days: number[]; time: string; active: boolean; managersOnly: boolean };
export async function saveTemplate(actor: Actor, data: NewTemplate, existing?: Template) {
  const now = nowIso();
  if (existing) {
    const { id, ...rest } = existing;
    await setDoc(doc(db, 'task_templates', id), { ...rest, ...data, title: data.title.trim(), updatedAt: now });
  } else {
    await setDoc(doc(collection(db, 'task_templates')), { ...data, title: data.title.trim(), createdBy: actor, createdAt: now, updatedAt: now });
  }
}
export const deleteTemplate = (id: string) => deleteDoc(doc(db, 'task_templates', id));

/** Creates today's instances of due recurring templates (idempotent: id = templateId_date). */
export async function materializeToday(templates: Template[], actor: Actor) {
  const key = todayKey();
  const weekday = new Date(key + 'T12:00:00').getDay();
  const due = templates.filter((t) => t.active && (t.days.length === 0 || t.days.includes(weekday)));
  for (const t of due) {
    const ref = doc(db, 'tasks', `${t.id}_${key}`);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) return;
        const now = nowIso();
        tx.set(ref, { title: t.title, note: t.note, photo: '', location: null, dueDate: key, managersOnly: t.managersOnly, templateId: t.id, dateKey: key, createdBy: actor, createdAt: now, done: false, doneBy: null, doneAt: null, donePhoto: '', doneNote: '', assignee: null, urgent: false, updatedAt: now });
      });
    } catch { /* another device created it first, or offline: ignore */ }
  }
}

// ---------- shopping ----------
export const useOpenShopping = (enabled: boolean) => useCollection<ShoppingItem>('shopping', [where('bought', '==', false), orderBy('createdAt', 'desc')], enabled, 'shop');
export function useRecentBought(enabled: boolean) {
  const [cutoff, setCutoff] = useState(hoursAgoIso(24));
  useEffect(() => { const t = setInterval(() => setCutoff(hoursAgoIso(24)), 10 * 60_000); return () => clearInterval(t); }, []);
  return useCollection<ShoppingItem>('shopping', [where('boughtAt', '>=', cutoff), orderBy('boughtAt', 'desc')], enabled, 'bought' + cutoff.slice(0, 13));
}
export const useBoughtHistory = (enabled: boolean, fromIso: string) => useCollection<ShoppingItem>('shopping', [where('boughtAt', '>=', fromIso), orderBy('boughtAt', 'desc'), limit(400)], enabled, 'boughthist' + fromIso);
export type NewShopping = { title: string; qty: string; note: string; link: string; category: ShoppingCategory; urgent: boolean };
export async function addShopping(actor: Actor, data: NewShopping) {
  const now = nowIso();
  const ref = doc(collection(db, 'shopping'));
  await setDoc(ref, { ...data, title: data.title.trim(), qty: data.qty.trim(), link: data.link.trim(), createdBy: actor, createdAt: now, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now });
  logActivity(actor, 'shopping', ref.id, 'added', `${data.title.trim()}${data.qty ? ' · ' + data.qty.trim() : ''} (${CATEGORY_LABELS[data.category]})`);
  return ref.id;
}
export async function editShopping(actor: Actor, item: ShoppingItem, data: Partial<NewShopping>) {
  const { id, ...rest } = item;
  await setDoc(doc(db, 'shopping', id), { ...rest, ...data, updatedAt: nowIso() });
  logActivity(actor, 'shopping', id, 'edited', data.title ?? item.title);
}
export async function setBought(actor: Actor, item: ShoppingItem, bought: boolean) {
  const { id, ...rest } = item;
  const now = nowIso();
  await setDoc(doc(db, 'shopping', id), bought
    ? { ...rest, bought: true, boughtBy: actor, boughtAt: now, expireAt: new Date(Date.now() + 24 * 3600_000).toISOString(), updatedAt: now }
    : { ...rest, bought: false, boughtBy: null, boughtAt: null, expireAt: null, updatedAt: now });
  logActivity(actor, 'shopping', id, bought ? (item.category === 'giveaway' ? 'found' : 'bought') : 'unbought', `${item.title}${item.qty ? ' · ' + item.qty : ''}`);
}
export async function deleteShopping(actor: Actor, item: ShoppingItem) {
  await deleteDoc(doc(db, 'shopping', item.id));
  logActivity(actor, 'shopping', item.id, 'deleted', item.title);
}
export async function restoreShopping(item: ShoppingItem) {
  const { id, ...rest } = item;
  await setDoc(doc(db, 'shopping', id), rest);
}

// ---------- places ----------
export const usePlaces = (enabled: boolean) => useCollection<Place>('places', [orderBy('name')], enabled, 'places');
export async function addPlace(actor: Actor, name: string, lat: number, lng: number) {
  const ref = doc(collection(db, 'places'));
  await setDoc(ref, { name: name.trim(), lat, lng, createdBy: actor, createdAt: nowIso() });
  logActivity(actor, 'place', ref.id, 'created', name.trim());
}
export const deletePlace = (id: string) => deleteDoc(doc(db, 'places', id));

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
      const url = canvas.toDataURL('image/webp', 0.78);
      if (url.startsWith('data:image/webp;') && url.length <= maxChars) return url;
    }
    throw Error('התמונה גדולה מדי גם אחרי דחיסה');
  } finally { bitmap.close(); }
}

export function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(Error('אין גישה למיקום במכשיר הזה'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => reject(Error('לא הצלחנו לקבל מיקום. בדקו שהרשאת מיקום פתוחה.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

export const useOnline = () => useSyncExternalStore(
  (l) => { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; },
  () => navigator.onLine,
);
