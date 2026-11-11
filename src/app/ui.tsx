import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- icons (stroke, inherit color) ----------
const paths: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>,
  check: <path d="m5 12.5 4.5 4.5L19 7"/>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  cart: <><path d="M3 4h2l2.4 11h11.2L21 7H6.2"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></>,
  more: <><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></>,
  people: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 5.5 2 5.5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  x: <path d="M6 6l12 12M18 6 6 18"/>,
  back: <path d="m9 6 6 6-6 6"/>,
  chev: <path d="m15 6-6 6 6 6"/>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>,
  camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></>,
  pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  repeat: <><path d="M4 11a6 6 0 0 1 6-6h9"/><path d="m16 2 3 3-3 3"/><path d="M20 13a6 6 0 0 1-6 6H5"/><path d="m8 22-3-3 3-3"/></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v5h5"/><path d="M12 8v4.5l3 1.5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/></>,
  key: <><circle cx="8" cy="14" r="4"/><path d="m11 11 9-9M16 4l3 3M13 7l3 3"/></>,
  wifiOff: <><path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5.5 12a11 11 0 0 1 13 0"/><path d="M9 15.5a5.5 5.5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/><path d="m3 3 18 18"/></>,
  nav: <path d="m3 11 18-8-8 18-2-8z"/>,
  logout: <><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>,
  download: <><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></>,
};
export const Icon = ({ name, size = 22, className = '' }: { name: string; size?: number; className?: string }) => (
  <svg className={'ic ' + className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
);

// ---------- toast ----------
type ToastItem = { id: number; text: string; action?: { label: string; onClick: () => void }; kind?: 'ok' | 'error' };
const ToastCtx = createContext<(t: Omit<ToastItem, 'id'>, ms?: number) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: Omit<ToastItem, 'id'>, ms = 5000) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind || '')}>
            <span>{t.text}</span>
            {t.action && <button type="button" onClick={() => { t.action!.onClick(); setItems((s) => s.filter((i) => i.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- sheet (bottom dialog) ----------
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { d.showModal(); setTimeout(() => d.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 50); }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    const onClick = (e: MouseEvent) => { if (e.target === d) onClose(); };
    d.addEventListener('cancel', onCancel); d.addEventListener('click', onClick);
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('click', onClick); };
  }, [onClose]);
  return (
    <dialog ref={ref} className={'sheet ' + (wide ? 'wide' : '')}>
      <div className="sheet-inner">
        <div className="sheet-grip" aria-hidden="true" />
        {title && <header className="sheet-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה"><Icon name="x" /></button></header>}
        <div className="sheet-body">{open && children}</div>
      </div>
    </dialog>
  );
}

// ---------- primitives ----------
export const Button = ({ kind = 'primary', children, className = '', ...rest }: { kind?: 'primary' | 'secondary' | 'quiet' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...rest} className={`btn ${kind} ${className}`}>{children}</button>
);

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={'checkbox ' + (checked ? 'on' : '')} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
      <Icon name="check" size={18} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [value]);
  return (
    <div className={'segmented ' + (options.length > 3 ? 'scroll' : '')} role="tablist" ref={ref}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count ? <span className="count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ title, text, icon = 'sparkle' }: { title: string; text?: string; icon?: string }) => (
  <div className="empty"><Icon name={icon} size={30} /><strong>{title}</strong>{text && <p>{text}</p>}</div>
);

export const Avatar = ({ name, size = 30 }: { name: string; size?: number }) => {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('');
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: `oklch(0.9 0.05 ${h})`, color: `oklch(0.35 0.07 ${h})` }} aria-hidden="true">{initials}</span>;
};

// ---------- formatting ----------
export const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '';
export const fmtDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' }) : '';
export const fmtDayLong = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
export function relTime(iso?: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'עכשיו';
  if (diff < 60) return `לפני ${Math.round(diff)} דק׳`;
  if (diff < 24 * 60) return `לפני ${Math.round(diff / 60)} שע׳`;
  return fmtDate(iso);
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
