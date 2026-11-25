// Phone push, client side (docs/push-design.md, docs/push-setup.md). Owned by the broadcast area.
//
// One switch: the Worker's PUSH_MODE ("off" | "webpush" | "fcm"). The Worker publishes it, with the public keys only,
// to settings/push on every cron run, so the app follows the switch without a rebuild:
//   settings/push = { mode, vapidPublicKey, fcmVapidKey, updatedAt }
// A device subscribes in the mode that is on and is saved in users/{uid}.push.devices (one entry per browser):
//   webpush: { id, kind: 'webpush', endpoint, keys: { p256dh, auth }, ua, createdAt }
//   fcm:     { id, kind: 'fcm', token, ua, createdAt }
// users/{uid}.push.enabled is the person's master switch, push.kinds what they want on the lock screen (C1 "מה לקבל").
// The in-app notifications (C1) never depend on any of this.
// Demo: nothing real happens (no permission prompt, no subscription); the choice is stored in the demo profile only.
import { saveAccountChange } from '../../account-activity';
import { useEffect, useState } from 'react';
import { newId, transact, useDoc } from '../../db';
import { nowIso } from '../../clock';
import { getDemo, getDemoStates } from '../../demo/store';
import type { Profile } from '../../types';

export type PushMode = 'off' | 'webpush' | 'fcm';
export type PushConfig = { mode: PushMode; vapidPublicKey?: string; fcmVapidKey?: string; updatedAt?: string };
export type PushDevice =
  | { id: string; kind: 'webpush'; endpoint: string; keys: { p256dh: string; auth: string }; ua: string; createdAt: string }
  | { id: string; kind: 'fcm'; token: string; ua: string; createdAt: string };
export type PushPrefs = { enabled: boolean; kinds?: string[]; updatedAt?: string; devices?: PushDevice[] };

/** What a person can choose to receive (C1 "מה לקבל", L6/C12 "3 מתוך 5 פעילות"). The Worker maps job kinds onto these. */
export const PUSH_KINDS = [
  { key: 'broadcast', label: 'הודעות לצוות' },
  { key: 'task', label: 'משימה חדשה עליי' },
  { key: 'urgent', label: 'דחוף לכולם' },
  { key: 'trip', label: 'יציאה לקניות' },
  { key: 'event', label: 'אירועים ותזכורות' },
] as const;
export type PushKind = (typeof PUSH_KINDS)[number]['key'];
export const ALL_KINDS: PushKind[] = PUSH_KINDS.map((k) => k.key);
/** Job kind -> preference key ('vendor' requests go to managers under events; 'system' always comes). */
export const prefOf = (jobKind: string): PushKind | null => (jobKind === 'vendor' ? 'event' : (ALL_KINDS as string[]).includes(jobKind) ? (jobKind as PushKind) : null);
export const kindsOf = (p: PushPrefs | undefined): PushKind[] => (p?.kinds ? (p.kinds.filter((k) => (ALL_KINDS as string[]).includes(k)) as PushKind[]) : ALL_KINDS);

// ---------- what this phone can do ----------
export type PushState =
  | 'checking'      // reading the farm's settings or the device registration
  | 'unavailable'   // the settings could not be read
  | 'unsupported'   // no service worker / PushManager (old browser, in-app browser)
  | 'needs-install' // iPhone/iPad Safari tab: Web Push needs the app on the home screen (iOS 16.4+)
  | 'off'           // the farm has not turned push on yet (PUSH_MODE off)
  | 'denied'        // blocked in the browser or phone settings
  | 'ask'           // can ask (on a tap)
  | 'on';           // this device is subscribed and saved
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
export const pushCapable = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const DEVICE_KEY = 'farm-push-device';
/** A random id for this browser, kept in localStorage: one device entry per browser, replaced on resubscribe. */
export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return 'nostore'; }
}

export const usePushConfig = (): PushConfig & { loading: boolean; error?: string } => {
  const r = useDoc<PushConfig & Record<string, unknown>>('settings/push');
  const c = r.item;
  return { ...(c && (c.mode === 'webpush' || c.mode === 'fcm') ? { mode: c.mode, vapidPublicKey: c.vapidPublicKey, fcmVapidKey: c.fcmVapidKey } : { mode: 'off' as const }), loading: r.loading, error: r.error };
};

/** The phone's state for push, live. In demo it follows the demo profile only. */
export function usePush(profile: Profile) {
  const config = usePushConfig();
  const prefs = (profile as Profile & { push?: PushPrefs }).push;
  const demo = getDemo().on;
  const mine = (prefs?.devices || []).find((d) => d.id === deviceId());
  const [perm, setPerm] = useState<NotificationPermission | 'none'>(() => (pushCapable() ? Notification.permission : 'none'));
  const [endpoint, setEndpoint] = useState<string | null>();
  const [revision, setRevision] = useState(0);
  const refresh = () => {
    setPerm(pushCapable() ? Notification.permission : 'none');
    setRevision((v) => v + 1);
  };
  useEffect(() => {
    if (demo || !pushCapable()) return;
    let cancelled = false;
    let permission: PermissionStatus | undefined;
    const changed = () => { if (document.visibilityState === 'visible') refresh(); };
    navigator.permissions?.query({ name: 'notifications' }).then((status) => {
      if (!cancelled) { permission = status; permission.addEventListener('change', changed); }
    }).catch(() => {});
    document.addEventListener('visibilitychange', changed);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', changed);
      permission?.removeEventListener('change', changed);
    };
  }, [demo]);
  const checkWeb = !demo && config.mode === 'webpush' && perm === 'granted' && mine?.kind === 'webpush';
  useEffect(() => {
    if (!checkWeb) return;
    let cancelled = false;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (!cancelled) setEndpoint(sub && subKeyMatches(sub, config.vapidPublicKey) ? sub.endpoint : null);
    }).catch(() => { if (!cancelled) setEndpoint(null); });
    return () => { cancelled = true; };
  }, [checkWeb, config.vapidPublicKey, revision]);
  let state: PushState;
  if (demo) state = prefs?.enabled ? 'on' : 'ask';
  else if (isIos() && !standalone()) state = 'needs-install';
  else if (!pushCapable()) state = 'unsupported';
  else if (config.loading) state = 'checking';
  else if (config.error) state = 'unavailable';
  else if (config.mode === 'off') state = 'off';
  else if (perm === 'denied') state = 'denied';
  else if (checkWeb && endpoint === undefined) state = 'checking';
  else if (perm === 'granted' && prefs?.enabled && mine &&
    (config.mode === 'webpush' ? mine.kind === 'webpush' && mine.endpoint === endpoint : mine.kind === 'fcm')) state = 'on';
  else state = 'ask';
  return { state, config, prefs, kinds: kindsOf(prefs), enabled: !!prefs?.enabled, refresh };
}

// ---------- subscribe / unsubscribe ----------
const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
function subKeyMatches(sub: PushSubscription, vapidPublicKey?: string) {
  if (!sub.options.applicationServerKey || !vapidPublicKey) return false;
  const expected = b64ToBytes(vapidPublicKey);
  const actual = new Uint8Array(sub.options.applicationServerKey);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
async function readyRegistration() {
  const serviceWorker = navigator.serviceWorker;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('הדפדפן עדיין מכין התראות. אפשר לנסות שוב.')), 8000);
  });
  return Promise.race([serviceWorker.register('/sw.js').then(() => serviceWorker.ready), deadline]).finally(() => clearTimeout(timer));
}
const ua = () => {
  const u = navigator.userAgent;
  const os = /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'other';
  const br = /CriOS|Chrome/.test(u) && !/Edg/.test(u) ? 'Chrome' : /Edg/.test(u) ? 'Edge' : /Firefox|FxiOS/.test(u) ? 'Firefox' : /Safari/.test(u) ? 'Safari' : 'browser';
  return `${os} · ${br}${standalone() ? ' · app' : ''}`;
};

const requireConnection = () => {
  if (!getDemo().on && (!navigator.onLine || getDemoStates().offline)) throw new Error('כדי לשמור התראות צריך חיבור לאינטרנט.');
};

/** Change this device against the current profile so another phone's registration is kept. */
async function saveDevice(profile: Profile, device: PushDevice | null, turnOn?: boolean) {
  requireConnection();
  const id = deviceId();
  const logId = newId('account_activity');
  await transact(async (tx) => {
    const person = await tx.get('users', profile.uid);
    if (!person) throw new Error('לא הצלחנו למצוא את החשבון.');
    const prefs = person.push as PushPrefs | undefined;
    const others = (prefs?.devices || []).filter((item) => item.id !== id);
    const devices = device ? [...others, device].slice(-6) : others;
    const enabled = turnOn ?? (!!prefs?.enabled && devices.length > 0);
    if (turnOn === undefined && others.length === prefs?.devices?.length) return;
    const at = nowIso();
    tx.update('users', profile.uid, { push: { ...prefs, enabled, devices, updatedAt: at }, updatedAt: at });
    tx.set('account_activity', logId, { uid: profile.uid, action: 'push_changed', at });
  });
}

/** Must run inside a tap (iOS asks only from a user gesture). Resolves to the new state. */
export async function enablePush(profile: Profile, config: PushConfig): Promise<PushState> {
  if (getDemo().on) { await saveDevice(profile, null, true); return 'on'; }
  if (isIos() && !standalone()) return 'needs-install';
  if (!pushCapable()) return 'unsupported';
  if (config.mode === 'off') return 'off';
  requireConnection();
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ask';
  const reg = await readyRegistration();
  const createdAt = nowIso();
  let device: PushDevice;
  if (config.mode === 'webpush') {
    if (!config.vapidPublicKey) throw new Error('חסר מפתח לשליחה');
    const key = b64ToBytes(config.vapidPublicKey);
    let sub = await reg.pushManager.getSubscription();
    // a subscription made with another key (FCM before, or a rotated VAPID key) must be replaced
    if (sub && !subKeyMatches(sub, config.vapidPublicKey)) { await sub.unsubscribe(); sub = null; }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('המכשיר לא החזיר מינוי');
    device = { id: deviceId(), kind: 'webpush', endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, ua: ua(), createdAt };
  } else {
    if (!config.fcmVapidKey) throw new Error('חסר מפתח לשליחה');
    const old = await reg.pushManager.getSubscription();
    // FCM subscribes with its own key; drop a plain Web Push subscription first
    if (old && subKeyMatches(old, config.vapidPublicKey)) await old.unsubscribe();
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return 'unsupported';
    const { app } = await import('../../firebase');
    const token = await getToken(getMessaging(app), { vapidKey: config.fcmVapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error('המכשיר לא החזיר מינוי');
    device = { id: deviceId(), kind: 'fcm', token, ua: ua(), createdAt };
  }
  await saveDevice(profile, device, true);
  return 'on';
}

/** Turns push off on this device. Other registered devices keep receiving. */
export async function disablePush(profile: Profile) {
  if (getDemo().on) { await saveDevice(profile, null, false); return; }
  await saveDevice(profile, null);
  await dropSubscription();
}

/** Sign-out (system area): this browser stops receiving for this person; the person's other phones keep theirs. */
export async function revokeThisDevice(profile: Profile) {
  if (getDemo().on) return;
  await dropSubscription();
  const prefs = (profile as Profile & { push?: PushPrefs }).push;
  if (prefs?.devices?.some((d) => d.id === deviceId())) await saveDevice(profile, null);
}

async function dropSubscription() {
  if (!pushCapable()) return;
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* nothing to drop */ }
}

/** C1 "מה לקבל": which kinds reach the lock screen. */
export async function setPushKinds(profile: Profile, kinds: PushKind[]) {
  const at = nowIso();
  const prefs = (profile as Profile & { push?: PushPrefs }).push;
  const patch = getDemo().on ? { push: { ...prefs, kinds, updatedAt: at } } : { 'push.kinds': kinds, 'push.updatedAt': at };
  await saveAccountChange(profile.uid, 'push_changed', { ...patch, updatedAt: at });
}
