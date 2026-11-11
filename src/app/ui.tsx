// Primitives of the "farm ledger" language: rows, 40px check squares, number strips, pills, buttons, fields, page headers.
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { href, navigate, back as goBack } from './router';

// ---------- icons (stroke, inherit color) ----------
const paths: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>,
  check: <path d="m5 12.5 4.5 4.5L19 7"/>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  cart: <><path d="M3 4h2l2.4 11h11.2L21 7H6.2"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></>,
  more: <><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></>,
  people: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 5.5 2 5.5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  x: <path d="M6 6l12 12M18 6 6 18"/>,
  back: <path d="m9 6 6 6-6 6"/>,
  chev: <path d="m15 6-6 6 6 6"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>,
  whatsapp: <><path d="M4 20l1.3-3.8A8.5 8.5 0 1 1 8.6 19z"/><path d="M9.5 9.5c0 3 2 5 5 5l1.2-1.3-1.8-1-.9.8a3.5 3.5 0 0 1-2-2l.8-.9-1-1.8z"/></>,
  camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></>,
  qr: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/></>,
  pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  repeat: <><path d="M4 11a6 6 0 0 1 6-6h9"/><path d="m16 2 3 3-3 3"/><path d="M20 13a6 6 0 0 1-6 6H5"/><path d="m8 22-3-3 3-3"/></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v5h5"/><path d="M12 8v4.5l3 1.5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/></>,
  wifiOff: <><path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5.5 12a11 11 0 0 1 13 0"/><path d="M9 15.5a5.5 5.5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/><path d="m3 3 18 18"/></>,
  nav: <path d="m3 11 18-8-8 18-2-8z"/>,
  logout: <><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
  download: <><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></>,
  upload: <><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></>,
  share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></>,
  ticket: <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/>,
  heart: <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  chart: <><path d="M4 20h16"/><path d="M7 16v-6M12 16V5M17 16v-3"/></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></>,
  store: <><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 12v8h14v-8"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="M3 3l18 18"/><path d="M10.6 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A16 16 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
  drag: <><circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/></>,
  flag: <><path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  print: <><path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  external: <><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v6H4V6h6"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  tree: <><path d="M12 22v-5"/><path d="M7 17h10l-3-4h2l-4-6-4 6h2z"/></>,
};
export const Icon = ({ name, size, className = '' }: { name: string; size?: number; className?: string }) => (
  <svg className={'ic ' + className} style={size ? { width: size, height: size } : undefined} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
);

// ---------- link that uses the in-app router ----------
export function A({ to, children, className, replace, ...rest }: { to: string; children?: ReactNode; className?: string; replace?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a {...rest} className={className} href={href(to)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button === 1) return; e.preventDefault(); navigate(to, replace); }}>{children}</a>;
}

// ---------- media ----------
export const useMedia = (q: string) => useSyncExternalStore((l) => { const m = matchMedia(q); m.addEventListener('change', l); return () => m.removeEventListener('change', l); }, () => matchMedia(q).matches);
export const useDesktop = () => useMedia('(min-width: 1024px)');

// ---------- page header ----------
export function Top({ title, date, sub, end, back, backTo, backLabel, tight, serif }: { title: ReactNode; date?: ReactNode; sub?: ReactNode; end?: ReactNode; back?: boolean; backTo?: string; backLabel?: string; tight?: boolean; serif?: boolean }) {
  return (
    <>
      {(back || backTo) && <div className="crumb"><Back to={backTo} label={backLabel} />{end && <div className="end">{end}</div>}</div>}
      <header className={'top' + (tight || back || backTo ? ' tight' : '')}>
        <div style={{ minWidth: 0 }}>{date && <div className="date">{date}</div>}<h1 className={serif ? 'serif' : ''}>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        {!(back || backTo) && end && <div className="end">{end}</div>}
      </header>
    </>
  );
}
export const Back = ({ to, label = 'חזרה' }: { to?: string; label?: string }) => (
  <button type="button" className="back" onClick={() => (to ? navigate(to) : goBack('/'))}><Icon name="back" />{label}</button>
);

// ---------- numbers strip ----------
export const Ledger = ({ items, small }: { items: { n: ReactNode; label: string; tone?: 'rust' | 'ochre'; to?: string }[]; small?: boolean }) => (
  <div className={'ledger' + (small ? ' sm' : '')}>{items.map((i, k) => i.to ? <A key={k} to={i.to}><b className={i.tone || ''}>{i.n}</b><span>{i.label}</span></A> : <div key={k}><b className={i.tone || ''}>{i.n}</b><span>{i.label}</span></div>)}</div>
);

// ---------- section header (optionally collapsible) ----------
export function Sec({ title, n, link, linkTo, onLink, children, open, onToggle }: { title: ReactNode; n?: number | string; link?: string; linkTo?: string; onLink?: () => void; children?: ReactNode; open?: boolean; onToggle?: () => void }) {
  return (
    <div className="sec">
      {onToggle ? <button type="button" className={'tog' + (open ? '' : ' closed')} onClick={onToggle} aria-expanded={open}><Icon name="down" />{title}{n !== undefined && <span className="n">· {n}</span>}</button>
        : <span>{title}{n !== undefined && <span className="n">· {n}</span>}</span>}
      {children}
      {link && (linkTo ? <A to={linkTo}>{link}</A> : <button type="button" className="lnk" onClick={onLink}>{link}</button>)}
    </div>
  );
}
export function useOpenSections(keys: string[], storageKey: string) {
  const [state, setState] = useState<Record<string, boolean>>(() => { try { return { ...Object.fromEntries(keys.map((k) => [k, true])), ...JSON.parse(localStorage.getItem('farm-sec-' + storageKey) || '{}') }; } catch { return Object.fromEntries(keys.map((k) => [k, true])); } });
  const toggle = (k: string) => setState((s) => { const n = { ...s, [k]: !s[k] }; try { localStorage.setItem('farm-sec-' + storageKey, JSON.stringify(n)); } catch {} return n; });
  return { isOpen: (k: string) => state[k] !== false, toggle };
}

// ---------- rows ----------
export function Row({ to, onClick, title, meta, start, end, done, thumb, chev, className = '', center }: { to?: string; onClick?: () => void; title: ReactNode; meta?: ReactNode; start?: ReactNode; end?: ReactNode; done?: boolean; thumb?: string; chev?: boolean; className?: string; center?: boolean }) {
  const cls = `row ${done ? 'done' : ''} ${center ? 'center' : ''} ${className}`;
  const body = <>{thumb && <img className="thumb" src={thumb} alt="" />}<div className="main"><div className="title">{title}</div>{meta && <div className="meta">{meta}</div>}</div>{end && <div className="end">{end}</div>}{chev && <Icon name="chev" className="chev" size={18} />}</>;
  if (start) {
    // the start control (a check square) is its own button; the rest of the row is the link
    return <div className={cls}>{start}{to ? <A to={to} className="main lnk" style={{ display: 'flex', gap: 14, flex: 1, minWidth: 0 }}>{body}</A> : onClick ? <button type="button" className="main lnk" style={{ display: 'flex', gap: 14, flex: 1, minWidth: 0 }} onClick={onClick}>{body}</button> : <div className="main" style={{ display: 'flex', gap: 14, flex: 1, minWidth: 0 }}>{body}</div>}</div>;
  }
  if (to) return <A to={to} className={cls}>{body}</A>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
export const Chk = ({ on, onChange, label, rust, small }: { on: boolean; onChange: (v: boolean) => void; label: string; rust?: boolean; small?: boolean }) => (
  <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={`chk ${on ? 'on' : ''} ${rust && !on ? 'rust' : ''} ${small ? 'sm' : ''}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}><Icon name="check" size={small ? 16 : 22} /></button>
);
export const Pill = ({ tone, children }: { tone?: 'rust' | 'ochre' | 'ok' | 'gold' | 'green'; children: ReactNode }) => <span className={'pill ' + (tone || '')}>{children}</span>;
export const Dot = () => <span aria-hidden="true">·</span>;

// ---------- buttons ----------
type BtnProps = { kind?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'gold' | 'rustfill' | 'google'; size?: 'big' | 'sm' | 'xs'; block?: boolean; icon?: string; to?: string; children?: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Btn({ kind = 'primary', size, block, icon, to, children, className = '', ...rest }: BtnProps) {
  const cls = `btn ${kind} ${size || ''} ${block ? 'block' : ''} ${className}`;
  if (to) return <A to={to} className={cls}>{icon && <Icon name={icon} size={20} />}{children}</A>;
  return <button type="button" {...rest} className={cls}>{icon && <Icon name={icon} size={20} />}{children}</button>;
}
export const IconBtn = ({ icon, label, onClick, to, ghost, href: ext }: { icon: string; label: string; onClick?: () => void; to?: string; ghost?: boolean; href?: string }) =>
  to ? <A to={to} className={'iconbtn ' + (ghost ? 'ghost' : '')} aria-label={label}><Icon name={icon} /></A>
    : ext ? <a href={ext} target="_blank" rel="noopener" className={'iconbtn ' + (ghost ? 'ghost' : '')} aria-label={label}><Icon name={icon} /></a>
      : <button type="button" className={'iconbtn ' + (ghost ? 'ghost' : '')} aria-label={label} onClick={onClick}><Icon name={icon} /></button>;
export const Fab = ({ items }: { items: { icon: string; label: string; to?: string; onClick?: () => void }[] }) => (
  <div className="fab">{items.map((i) => i.to ? <A key={i.label} to={i.to} aria-label={i.label} title={i.label}><Icon name={i.icon} /></A> : <button key={i.label} type="button" aria-label={i.label} title={i.label} onClick={i.onClick}><Icon name={i.icon} /></button>)}</div>
);

// ---------- forms ----------
export const Field = ({ label, hint, children, className = '' }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) => (
  <label className={'field ' + className}>{label && <span>{label}</span>}{children}{hint && <span className="hint">{hint}</span>}</label>
);
export const Input = ({ big, className = '', ...rest }: { big?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => <input {...rest} className={`input ${big ? 'big' : ''} ${className}`} />;
export const Textarea = (rest: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...rest} className="input" />;
export const Select = ({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...rest} className="input">{children}</select>;
export function Chips<T extends string>({ value, onChange, options, scroll, rust }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; n?: number }[]; scroll?: boolean; rust?: boolean }) {
  return <div className={'chips' + (scroll ? ' scroll' : '')} role="tablist">{options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={`chip ${value === o.value ? 'on' : ''} ${rust ? 'rust' : ''}`} onClick={() => onChange(o.value)}>{o.label}{o.n !== undefined && <span className="n">· {o.n}</span>}</button>)}</div>;
}
export const Chip = ({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) => <button type="button" className={'chip ' + (on ? 'on' : '')} aria-pressed={on} onClick={onClick}>{children}</button>;
export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch ' + (on ? 'on' : '')} onClick={() => onChange(!on)} />;
export const SwitchRow = ({ on, onChange, title, meta }: { on: boolean; onChange: (v: boolean) => void; title: string; meta?: ReactNode }) => (
  <div className="switchrow"><div className="main"><div className="title">{title}</div>{meta && <div className="meta">{meta}</div>}</div><Switch on={on} onChange={onChange} label={title} /></div>
);
export const Stepper = ({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
  <div className="stepper"><button type="button" aria-label="פחות" disabled={value <= min} onClick={() => onChange(value - 1)}><Icon name="minus" /></button><b>{value}</b><button type="button" aria-label="עוד" disabled={value >= max} onClick={() => onChange(value + 1)}><Icon name="plus" /></button></div>
);
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const Days = ({ value, onChange, disabled = [] }: { value: number[]; onChange: (v: number[]) => void; disabled?: number[] }) => (
  <div className="days">{DAY_SHORT.map((d, i) => <button key={i} type="button" className={(value.includes(i) ? 'on' : '') + (disabled.includes(i) ? ' off' : '')} aria-pressed={value.includes(i)} onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>{d}</button>)}</div>
);

// ---------- people ----------
export const Avatar = ({ name, size, light }: { name: string; size?: 'sm' | 'lg'; light?: boolean }) => {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('');
  return <span className={`avatar ${size || ''} ${light ? 'light' : ''}`} aria-hidden="true">{initials}</span>;
};

// ---------- empty / loading ----------
export const Empty = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) => <div className="empty"><b>{title}</b>{text}{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>;
export const Loading = () => <div style={{ padding: '20px 20px' }}><div className="skeleton" style={{ width: '70%' }} /><div className="skeleton" style={{ width: '45%', marginTop: 10 }} /><div className="skeleton" style={{ width: '60%', marginTop: 10 }} /></div>;

// ---------- toast (with undo) ----------
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
        {items.map((t) => <div key={t.id} className={'toast ' + (t.kind || '')}><span>{t.text}</span>{t.action && <button type="button" onClick={() => { t.action!.onClick(); setItems((s) => s.filter((i) => i.id !== t.id)); }}>{t.action.label}</button>}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
/** Delete with a 6-second undo instead of a confirm() dialog. */
export function useUndoable() {
  const toast = useToast();
  return async (text: string, doIt: () => Promise<unknown>, undo: () => Promise<unknown>) => {
    try { await doIt(); toast({ text, action: { label: 'ביטול', onClick: () => { undo().catch(() => {}); } } }, 6000); }
    catch { toast({ text: 'לא הצלחנו. נסו שוב.', kind: 'error' }); }
  };
}

// ---------- bottom sheet (only for short confirmations and pickers) ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    const onClick = (e: MouseEvent) => { if (e.target === d) onClose(); };
    d.addEventListener('cancel', onCancel); d.addEventListener('click', onClick);
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('click', onClick); };
  }, [onClose]);
  return <dialog ref={ref} className="sheet"><div className="sheet-inner"><div className="sheet-grip" aria-hidden="true" />{title && <header className="sheet-head"><h2>{title}</h2><button type="button" className="iconbtn" onClick={onClose} aria-label="סגירה"><Icon name="x" /></button></header>}{open && children}</div></dialog>;
}

// ---------- desktop table helpers ----------
export function useSort<T>(initial: string, dir: 'asc' | 'desc' = 'asc') {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: initial, dir });
  const toggle = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const apply = (rows: T[], get: (r: T, key: string) => string | number | null | undefined) => [...rows].sort((a, b) => { const x = get(a, sort.key) ?? '', y = get(b, sort.key) ?? ''; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he'); return sort.dir === 'asc' ? c : -c; });
  return { sort, toggle, apply };
}
export const Th = ({ k, sort, onSort, children, end }: { k?: string; sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (k: string) => void; children?: ReactNode; end?: boolean }) => (
  <th className={sort && k === sort.key ? 'sort' : ''} style={end ? { textAlign: 'end' } : undefined}>{k && onSort ? <button type="button" onClick={() => onSort(k)}>{children}{sort?.key === k && (sort.dir === 'asc' ? ' ↑' : ' ↓')}</button> : children}</th>
);

// ---------- formatting ----------
const TZ = 'Asia/Jerusalem';
const asDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
export const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '';
export const fmtDate = (iso?: string | null) => iso ? asDate(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: TZ }) : '';
export const fmtDateShort = (iso?: string | null) => iso ? asDate(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', timeZone: TZ }) : '';
export const fmtDayLong = (iso: string) => asDate(iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
export const fmtDayShort = (iso: string) => asDate(iso).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: TZ }).replace('יום ', '');
export const fmtMonthYear = (iso: string) => asDate(iso).toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: TZ });
export const fmtWeekday = (iso: string) => asDate(iso).toLocaleDateString('he-IL', { weekday: 'long', timeZone: TZ }).replace('יום ', '');
export const fmtRange = (a: string, b: string) => `${fmtTime(a)}–${fmtTime(b)}`;
export const money = (n: number) => `${n.toLocaleString('he-IL')} ₪`;
export const todayISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
export const dateKey = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
export const addDays = (key: string, n: number) => { const d = asDate(key); d.setDate(d.getDate() + n); return dateKey(d); };
export function relTime(iso?: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'עכשיו';
  if (diff < 60) return `לפני ${Math.round(diff)} דק׳`;
  if (diff < 24 * 60) return `לפני ${Math.round(diff / 60)} שע׳`;
  if (diff < 48 * 60) return 'אתמול';
  if (diff < 7 * 24 * 60) return `לפני ${Math.round(diff / 1440)} ימים`;
  return fmtDate(iso);
}
/** "היום · 10:12" / "אתמול · 18:20" / "5.11 · 11:20" */
export function whenText(iso: string) {
  const d = dateKey(new Date(iso)), t = todayISO();
  return `${d === t ? 'היום' : d === addDays(t, -1) ? 'אתמול' : fmtDate(iso)} · ${fmtTime(iso)}`;
}
export function dayLabel(key: string) {
  const t = todayISO();
  if (key === t) return 'היום'; if (key === addDays(t, 1)) return 'מחר'; if (key === addDays(t, -1)) return 'אתמול';
  return fmtDayShort(key);
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב'; };
export const daysUntil = (iso: string) => Math.ceil((asDate(iso).getTime() - Date.now()) / 86400_000);
export function inText(iso: string) { const d = daysUntil(iso); return d <= 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`; }
