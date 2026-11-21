// Shell services shared by every v2 screen: the screen context, toasts (info with actions, refused-write alert),
// links that leave the app (WhatsApp, phone, maps: in demo they show "בהדגמה לא נשלח" instead), and the unread count.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

/** Navigate helper for screens: go(path) / go(path, true) to replace. */
export const go = (path: string, replace = false) => navigate(path, replace);
