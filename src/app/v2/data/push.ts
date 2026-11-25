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
import { useDoc } from '../../db';
import { nowIso } from '../../clock';
import { getDemo } from '../../demo/store';
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

export const usePushConfig = (): PushConfig => {
  const r = useDoc<PushConfig & Record<string, unknown>>('settings/push');
  const c = r.item;
  return c && (c.mode === 'webpush' || c.mode === 'fcm') ? { mode: c.mode, vapidPublicKey: c.vapidPublicKey, fcmVapidKey: c.fcmVapidKey, updatedAt: c.updatedAt } : { mode: 'off' };
};

/** The phone's state for push, live. In demo it follows the demo profile only. */
export function usePush(profile: Profile) {
  const config = usePushConfig();
  const prefs = (profile as Profile & { push?: PushPrefs }).push;
  const demo = getDemo().on;
  const mine = (prefs?.devices || []).find((d) => d.id === deviceId());
  const [perm, setPerm] = useState<NotificationPermission | 'none'>(() => (pushCapable() ? Notification.permission : 'none'));
  useEffect(() => {
    if (!pushCapable() || !('permissions' in navigator)) return;
    let st: PermissionStatus | null = null;
    navigator.permissions.query({ name: 'notifications' as PermissionName }).then((s) => { st = s; s.onchange = () => setPerm(Notification.permission); }).catch(() => {});
    return () => { if (st) st.onchange = null; };
  }, []);
  let state: PushState;
  if (demo) state = prefs?.enabled ? 'on' : 'ask';
  else if (!pushCapable()) state = isIos() && !standalone() ? 'needs-install' : 'unsupported';
  else if (config.mode === 'off') state = 'off';
  else if (perm === 'denied') state = 'denied';
  else if (perm === 'granted' && prefs?.enabled && mine && mine.kind === config.mode) state = 'on';
  else state = 'ask';
  return { state, config, prefs, kinds: kindsOf(prefs), enabled: !!prefs?.enabled, refresh: () => setPerm(pushCapable() ? Notification.permission : 'none') };
}

// ---------- subscribe / unsubscribe ----------
const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const ua = () => {
  const u = navigator.userAgent;
  const os = /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'other';
  const br = /CriOS|Chrome/.test(u) && !/Edg/.test(u) ? 'Chrome' : /Edg/.test(u) ? 'Edge' : /Firefox|FxiOS/.test(u) ? 'Firefox' : /Safari/.test(u) ? 'Safari' : 'browser';
  return `${os} · ${br}${standalone() ? ' · app' : ''}`;
};

/** Saves (or replaces) this browser's entry and turns the person's push on. Other devices are kept as they are. */
async function saveDevice(profile: Profile, device: PushDevice | null, patch: Partial<PushPrefs>) {
  const prefs = (profile as Profile & { push?: PushPrefs }).push || { enabled: false };
  const others = (prefs.devices || []).filter((d) => d.id !== deviceId());
  const devices = device ? [...others, device].slice(-6) : others;
  const next: PushPrefs = { enabled: prefs.enabled, ...(prefs.kinds ? { kinds: prefs.kinds } : {}), ...patch, devices, updatedAt: nowIso() };
  await saveAccountChange(profile.uid, 'push_changed', { push: next, updatedAt: nowIso() });
}

/** Must run inside a tap (iOS asks only from a user gesture). Resolves to the new state. */
export async function enablePush(profile: Profile, config: PushConfig): Promise<PushState> {
  if (getDemo().on) { await saveDevice(profile, null, { enabled: true }); return 'on'; }
  if (!pushCapable()) return isIos() && !standalone() ? 'needs-install' : 'unsupported';
  if (config.mode === 'off') return 'off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ask';
  const reg = await navigator.serviceWorker.ready;
  const createdAt = nowIso();
  let device: PushDevice;
  if (config.mode === 'webpush') {
    if (!config.vapidPublicKey) throw new Error('חסר מפתח לשליחה');
    const key = b64ToBytes(config.vapidPublicKey);
    let sub = await reg.pushManager.getSubscription();
    // a subscription made with another key (FCM before, or a rotated VAPID key) must be replaced
    const same = sub && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).every((b, i) => b === key[i]);
    if (sub && !same) { await sub.unsubscribe().catch(() => false); sub = null; }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('המכשיר לא החזיר מינוי');
    device = { id: deviceId(), kind: 'webpush', endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, ua: ua(), createdAt };
  } else {
    if (!config.fcmVapidKey) throw new Error('חסר מפתח לשליחה');
    const old = await reg.pushManager.getSubscription();
    // FCM subscribes with its own key; drop a plain Web Push subscription first
    if (old && old.options.applicationServerKey && config.vapidPublicKey) {
      const k = b64ToBytes(config.vapidPublicKey);
      if (new Uint8Array(old.options.applicationServerKey).every((b, i) => b === k[i])) await old.unsubscribe().catch(() => false);
    }
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return 'unsupported';
    const { app } = await import('../../firebase');
    const token = await getToken(getMessaging(app), { vapidKey: config.fcmVapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error('המכשיר לא החזיר מינוי');
    device = { id: deviceId(), kind: 'fcm', token, ua: ua(), createdAt };
  }
  await saveDevice(profile, device, { enabled: true });
  return 'on';
}

/** Turns push off for the person (all devices stop receiving) and removes this browser's subscription. */
export async function disablePush(profile: Profile) {
  if (!getDemo().on) await dropSubscription();
  await saveDevice(profile, null, { enabled: false });
}

/** Sign-out (system area): this browser stops receiving for this person; the person's other phones keep theirs. */
export async function revokeThisDevice(profile: Profile) {
  if (getDemo().on) return;
  await dropSubscription();
  const prefs = (profile as Profile & { push?: PushPrefs }).push;
  if (prefs?.devices?.some((d) => d.id === deviceId())) await saveDevice(profile, null, {});
}

async function dropSubscription() {
  if (!pushCapable()) return;
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* nothing to drop */ }
}

/** C1 "מה לקבל": which kinds reach the lock screen. */
export async function setPushKinds(profile: Profile, kinds: PushKind[]) {
  const prefs = (profile as Profile & { push?: PushPrefs }).push || { enabled: false };
  await saveAccountChange(profile.uid, 'push_changed', { push: { ...prefs, kinds, updatedAt: nowIso() }, updatedAt: nowIso() });
}
