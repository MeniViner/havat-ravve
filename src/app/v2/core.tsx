// Shell services shared by every v2 screen: the screen context, toasts (info with actions, refused-write alert),
// links that leave the app (WhatsApp, phone, maps: in demo they show "בהדגמה לא נשלח" instead), and the unread count.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Screen, RootHeader, Toast, type ScreenProps } from './kit';
import { initials } from './format';
import { useDemo, getDemo } from '../demo/store';
import { useList } from '../db';
import { navigate } from '../router';
import type { V2Ctx } from './ctx';
import type { UserNotification } from '../types';

// ---------- context ----------
const Ctx = createContext<V2Ctx | null>(null);
export const V2Provider = ({ value, children }: { value: V2Ctx; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
/** The screen context anywhere below the shell (for components that do not get `ctx` as a prop). */
export function useV2(): V2Ctx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useV2 outside the v2 shell');
  return v;
}

// ---------- toasts ----------
export type ToastAction = { label: string; onClick: () => void };
export type ToastSpec = {
  text: string;
  /** 'info' = dark warm with optional underlined actions (T4 "בוצע: ... צילום · ביטול"); 'error' = red role=alert (X1 "לא נשמר. ..." with "הבנתי"). */
  tone?: 'info' | 'error';
  /** Leading check mark (T4). */
  check?: boolean;
  actions?: ToastAction[];
  /** ms; errors stay until dismissed when 0. Default 6000 (info), 0 (error). */
  duration?: number;
};
export type ToastItem = ToastSpec & { id: number };
type ToastApi = {
  show: (t: ToastSpec) => number;
  dismiss: (id: number) => void;
  /** X1: a write was refused (someone else was first, or the rules refused it). */
  refused: (text?: string) => void;
  items: ToastItem[];
};
const ToastCtx = createContext<ToastApi>({ show: () => 0, dismiss: () => {}, refused: () => {}, items: [] });
let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastSpec) => {
    const id = ++seq;
    const duration = t.duration ?? (t.tone === 'error' ? 0 : 6000);
    setItems((s) => [...s.filter((x) => x.tone !== t.tone).slice(-1), { ...t, id }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);
  const refused = useCallback((text = 'לא נשמר. מישהו אחר הקדים אותך.') => {
    show({ text, tone: 'error', actions: [{ label: 'הבנתי', onClick: () => {} }] });
  }, [show]);
  const api = useMemo(() => ({ show, dismiss, refused, items }), [show, dismiss, refused, items]);
  return <ToastCtx.Provider value={api}>{children}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);
/** A confirmed delete (ConfirmSheet's onConfirm): runs it, then `after` (usually back to the list) and a short "נמחק".
 *  A refusal shows the red X1 toast and stays put. Resolves true when it went through. */
export function useRemove() {
  const toast = useToast();
  return useCallback(async (fn: () => Promise<unknown>, o: { text?: string; after?: () => void } = {}) => {
    try { await fn(); } catch (e) {
      const m = (e as Error)?.message || '';
      toast.refused(m.startsWith('לא נשמר.') ? m : `לא נשמר. ${m}`.trim());
      return false;
    }
    o.after?.();
    toast.show({ text: o.text || 'נמחק', check: true, duration: 3000 });
    return true;
  }, [toast]);
}

// ---------- links that leave the app ----------
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');
/** wa.me needs the international form: 052-000-0471 -> 972520000471. */
export const intl = (phone: string) => { const d = digits(phone).replace(/^\+/, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };
export const waUrl = (phone: string, text = '') => `https://wa.me/${intl(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
export const telUrl = (phone: string) => `tel:${digits(phone)}`;
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
/** Opens WhatsApp / phone / maps / mail. In demo nothing leaves the browser: a small toast says so. */
export function useExternal() {
  const toast = useToast();
  return useCallback((url: string) => {
    if (getDemo().on) { toast.show({ text: 'בהדגמה לא נשלח', duration: 2500 }); return; }
    if (url.startsWith('tel:') || url.startsWith('mailto:')) location.href = url;
    else window.open(url, '_blank', 'noopener');
  }, [toast]);
}
/** Props for an <a> that leaves the app (keeps the real href for long-press / copy, intercepts in demo). */
export function useExternalLink() {
  const demo = useDemo(); const open = useExternal();
  return (url: string) => ({ href: url, target: url.startsWith('http') ? '_blank' : undefined, rel: 'noopener', onClick: (e: React.MouseEvent) => { if (demo.on) { e.preventDefault(); open(url); } } });
}

// ---------- notifications ----------
/** Unread personal notifications (C1 badge). */
export function useUnread(uid: string, enabled = true) {
  const r = useList<UserNotification>(`users/${uid || '_'}/notifications`, { where: [['readAt', '==', null]], limit: 100 }, enabled && !!uid);
  return r.items.length;
}

// ---------- the screen frame with the shell's chrome ----------
/** What the shell puts around every screen: strips on top (demo Z2, offline C8) and the bottom nav. */
export type Chrome = { top: ReactNode; nav: ReactNode };
const ChromeCtx = createContext<Chrome>({ top: null, nav: null });
export const ChromeProvider = ({ value, children }: { value: Chrome; children: ReactNode }) => <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
export const useChrome = () => useContext(ChromeCtx);

/** The current toasts rendered as kit Toasts (first in Screen bottom). */
export function ToastStack() {
  const toast = useToast();
  if (!toast.items.length) return null;
  return <>{toast.items.map((t) => (
    <Toast key={t.id} tone={t.tone === 'error' ? 'alert' : 'info'} icon={t.tone === 'error' ? null : t.check === false ? null : undefined}
      actions={(t.actions || []).map((a) => ({ label: a.label, onClick: () => { a.onClick(); toast.dismiss(t.id); } }))}>
      {t.tone === 'error' && t.text.startsWith('לא נשמר.') ? <><b>לא נשמר.</b>{t.text.slice('לא נשמר.'.length)}</> : t.text}
    </Toast>
  ))}</>;
}

export type AppScreenProps = Omit<ScreenProps, 'top' | 'bottom'> & {
  /** CaptureBar on root screens (sits above the nav). */
  capture?: ReactNode;
  /** BottomBar on detail and form screens. When set, it replaces the nav (the designs never show both). */
  bar?: ReactNode;
  /** Hide the bottom nav on this screen even if the route shows it. */
  noNav?: boolean;
  /** Extra content pinned above the body, under the strips. */
  top?: ReactNode;
};
/** Every v2 screen renders inside this: the kit Screen with the shell's strips on top and toast, capture bar, nav or bar at the bottom. */
export function AppScreen({ capture, bar, noNav, top, children, ...rest }: AppScreenProps) {
  const chrome = useChrome();
  const nav = bar ? null : noNav ? null : chrome.nav;
  const bottom = <><ToastStack />{capture}{bar}{nav}</>;
  return <Screen {...rest} top={chrome.top || top ? <>{chrome.top}{top}</> : undefined} bottom={bottom}>{children}</Screen>;
}

/** Root header with the shell's wiring: unread badge, the person's photo or initials, search, notifications, profile. */
export function RootHead({ overline, title, hideSearch, hideBell }: { overline?: ReactNode; title: ReactNode; hideSearch?: boolean; hideBell?: boolean }) {
  const ctx = useV2();
  const unread = useUnread(ctx.user.uid);
  const p = ctx.profile as { photo?: string; photoSource?: string; googlePhoto?: string; displayName?: string };
  const src = p.photoSource === 'none' ? undefined : p.photo || (p.photoSource !== 'custom' ? p.googlePhoto : undefined) || undefined;
  return (
    <RootHeader overline={overline} title={title} unread={unread} avatar={initials(p.displayName || ctx.actor.name || '')} avatarSrc={src}
      onSearch={() => navigate('/search')} onBell={() => navigate('/notifications')} onAvatar={() => navigate('/me')} hideSearch={hideSearch} hideBell={hideBell} />
  );
}

/** Navigate helper for screens: go(path) / go(path, true) to replace. */
export const go = (path: string, replace = false) => navigate(path, replace);
