// The rebuilt interface kit. Small on purpose: words instead of icons, real forms, one check mark, one row per kind of thing.
import { Component, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { A, Icon } from './ui';
import { back } from './router';

// ---------- header ----------
export function Head({ title, over, end, backTo, backLabel = 'חזרה', small }: { title: ReactNode; over?: ReactNode; end?: ReactNode; backTo?: string; backLabel?: string; small?: boolean }) {
  return (
    <>
      {backTo !== undefined && <div className="r-crumb"><button type="button" className="r-back" onClick={() => back(backTo)}><Icon name="back" />{backLabel}</button>{end && <div className="r-end" style={{ paddingInlineEnd: 12 }}>{end}</div>}</div>}
      <header className={'r-head' + (small || backTo !== undefined ? ' small' : '')}>
        <div style={{ minWidth: 0 }}>{over && <div className="r-over">{over}</div>}<h1>{title}</h1></div>
        {backTo === undefined && end && <div className="r-end">{end}</div>}
      </header>
    </>
  );
}

export const Sect = ({ title, n, more, to, onMore, tone, children }: { title: ReactNode; n?: number | string; more?: string; to?: string; onMore?: () => void; tone?: 'late'; children?: ReactNode }) => (
  <div className={'r-sect' + (tone ? ' ' + tone : '')}>
    <h2>{title}</h2>{n !== undefined && <span className="r-count">{n}</span>}{children}
    {more && (to ? <A className="r-more" to={to}>{more}</A> : <button type="button" className="r-more" onClick={onMore}>{more}</button>)}
  </div>
);

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; n?: number }[]; label: string }) {
  return (
    <div className="r-tabs" role="tablist" aria-label={label}>
      {items.map((i) => <button key={i.id} type="button" role="tab" aria-selected={i.id === value} onClick={() => onChange(i.id)}>{i.label}{i.n !== undefined && <b>{i.n}</b>}</button>)}
    </div>
  );
}

// ---------- the one check mark ----------
/** Round for tasks, square for shopping. The mark answers at once; the caller decides what happens after. */
export const Check = ({ on, onChange, label, box, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; box?: boolean; disabled?: boolean }) => (
  <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} className={'r-check' + (box ? ' box' : '')} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
    <i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" /></svg></i>
  </button>
);
/** Ticking shows the mark and the strike first, and only then lets the list change. If the screen closes meanwhile the action still runs. */
export function useLeaving(ms = 520) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const pending = useRef(new Map<string, { run: () => void; timer: ReturnType<typeof setTimeout> }>());
  useEffect(() => () => { pending.current.forEach((p) => { clearTimeout(p.timer); p.run(); }); pending.current.clear(); }, []);
  const leave = (id: string, run: () => void) => {
    if (pending.current.has(id)) return;
    setIds((s) => new Set(s).add(id));
    const done = () => { pending.current.delete(id); run(); setTimeout(() => setIds((s) => { const n = new Set(s); n.delete(id); return n; }), 400); };
    pending.current.set(id, { run, timer: setTimeout(done, ms) });
  };
  return { leaving: ids, leave };
}

// ---------- buttons ----------
type BtnProps = { kind?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'gold'; small?: boolean; block?: boolean; to?: string; fit?: boolean; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Btn({ kind = 'primary', small, block, to, fit, children, className = '', type = 'button', ...rest }: BtnProps) {
  const cls = ['r-btn', kind === 'primary' ? '' : kind, small ? 'sm' : '', block ? 'block' : '', fit ? 'fit' : '', className].filter(Boolean).join(' ');
  if (to) return <A to={to} className={cls}>{children}</A>;
  return <button type={type} className={cls} {...rest}>{children}</button>;
}

// ---------- forms ----------
/** A real form: Enter submits, the button shows it is working, a refusal is written next to it. */
export function Form({ onSubmit, children, className = 'r-form' }: { onSubmit: () => Promise<unknown> | void; children: ReactNode; className?: string }) {
  const submit = (e: FormEvent) => { e.preventDefault(); void onSubmit(); };
  return <form className={className} onSubmit={submit} noValidate>{children}</form>;
}
/** One labelled control. The label points at the control by id, so tapping the label never presses a neighbouring button. */
export function Field({ label, help, children }: { label: string; help?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="r-field"><label htmlFor={id}>{label}</label>{children(id)}{help && <span className="r-help">{help}</span>}</div>;
}
/** One choice out of a few, as radio buttons that look like a bar. */
export function Seg<T extends string>({ label, value, onChange, options, hideLabel }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hideLabel?: boolean }) {
  const name = useId();
  return (
    <fieldset className="r-field">
      <legend className={hideLabel ? 'sr-only' : ''}>{label}</legend>
      <div className="r-seg">{options.map((o) => <label key={o.value}><input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />{o.label}</label>)}</div>
    </fieldset>
  );
}
export const Tick = ({ on, onChange, children, help }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; help?: ReactNode }) => (
  <label className="r-tick"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span>{children}{help && <small>{help}</small>}</span></label>
);

/** Session-scoped state: a tab or a filter survives opening a row and coming back. */
export function useSticky<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = sessionStorage.getItem('r:' + key); return s === null ? initial : (JSON.parse(s) as T); } catch { return initial; } });
  return [v, (next: T) => { setV(next); try { sessionStorage.setItem('r:' + key, JSON.stringify(next)); } catch { /* private mode */ } }];
}

/** Opens the phone's own picker (camera or gallery, the phone asks) and returns the chosen file. Must be called from a tap. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// ---------- delete with a real undo ----------
// The record disappears from the lists at once, but is deleted only when the undo window closes. Undo then never has to
// re-create someone else's record (which the rules rightly refuse), and it works without reception.
const hidden = new Map<string, { run: () => void; timer: ReturnType<typeof setTimeout> }>();
const hiddenListeners = new Set<() => void>();
let hiddenVersion = 0;
const hiddenChanged = () => { hiddenVersion++; hiddenListeners.forEach((l) => l()); };
const flush = (id: string) => { const h = hidden.get(id); if (!h) return; clearTimeout(h.timer); hidden.delete(id); h.run(); hiddenChanged(); };
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => [...hidden.keys()].forEach(flush));
/** Returns the undo function. */
export function deferDelete(id: string, run: () => void, ms = 6000) {
  hidden.set(id, { run, timer: setTimeout(() => flush(id), ms) });
  hiddenChanged();
  return () => { const h = hidden.get(id); if (!h) return; clearTimeout(h.timer); hidden.delete(id); hiddenChanged(); };
}
/** Re-renders when the set of records waiting to be deleted changes; use `isHidden` to filter lists. */
export const useHiddenVersion = () => useSyncExternalStore((l) => { hiddenListeners.add(l); return () => hiddenListeners.delete(l); }, () => hiddenVersion);
export const isHidden = (id: string) => hidden.has(id);

// ---------- the row that was just added ----------
// After "הוספה" the list shows the new row in gold for a moment, so the eye finds it.
let fresh: { id: string; at: number } | null = null;
export const markFresh = (id: string) => { fresh = { id, at: Date.now() }; };
export const isFresh = (id: string) => !!fresh && fresh.id === id && Date.now() - fresh.at < 4000;

// ---------- a sheet from the bottom, instead of the browser's prompt() ----------
/** In the app's own language, with big buttons. Esc and the backdrop close it. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('textarea,input,button')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  // rendered on <body> so the styles of whatever list opened it (old .links, .row) never leak into the sheet
  return createPortal(
    <div className="r-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
/** Pick one short reason, or write one. Returns the text through onChange. */
export function Reasons({ options, value, onChange, label = 'למה? (לא חובה)' }: { options: string[]; value: string; onChange: (v: string) => void; label?: string }) {
  const picked = options.includes(value) ? value : value ? 'אחר' : '';
  return (
    <div className="r-field">
      <span className="r-label">{label}</span>
      <div className="r-pick" role="group" aria-label={label}>{[...options, 'אחר'].map((o) => <button key={o} type="button" aria-pressed={picked === o} onClick={() => onChange(o === 'אחר' ? ' ' : o)}>{o}</button>)}</div>
      {picked === 'אחר' && <textarea className="r-input" value={value.trim() ? value : ''} onChange={(e) => onChange(e.target.value || ' ')} maxLength={300} placeholder="כמה מילים" aria-label="סיבה" />}
    </div>
  );
}

type Ask = { title: string; text?: ReactNode; reasons: string[]; confirm: string; danger?: boolean; label?: string };
/** Replaces prompt(): `const reason = await ask({...})` gives the reason (possibly '') or null when cancelled. Render `sheet` once in the screen. */
export function useReasonSheet(): [ReactNode, (o: Ask) => Promise<string | null>] {
  const [req, setReq] = useState<(Ask & { resolve: (v: string | null) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const ask = (o: Ask) => new Promise<string | null>((resolve) => { setReason(''); setReq({ ...o, resolve }); });
  const close = (v: string | null) => { req?.resolve(v); setReq(null); };
  const sheet = (
    <Sheet open={!!req} title={req?.title} onClose={() => close(null)}>
      {req && <>
        {req.text && <p className="r-sheet-text">{req.text}</p>}
        <Reasons options={req.reasons} value={reason} onChange={setReason} label={req.label} />
        <div className="r-sheet-acts">
          <Btn block className={req.danger ? 'rust' : ''} onClick={() => close(reason.trim())}>{req.confirm}</Btn>
          <Btn block kind="ghost" onClick={() => close(null)}>חזרה</Btn>
        </div>
      </>}
    </Sheet>
  );
  return [sheet, ask];
}

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="r-empty"><b>{title}</b>{children}</div>;

// ---------- a screen that broke must not take the whole app with it ----------
export class Guard extends Component<{ children: ReactNode; resetKey: string }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.broken) this.setState({ broken: false }); }
  componentDidCatch(error: unknown) { console.error('screen crashed', error); }
  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="r-crash" role="alert">
        <h1>המסך הזה נתקע</h1>
        <p>שאר האפליקציה עובדת. אפשר לחזור אחורה או לטעון מחדש.</p>
        <div style={{ display: 'flex', gap: 10 }}><Btn onClick={() => back('/')}>חזרה</Btn><Btn kind="ghost" onClick={() => location.reload()}>טעינה מחדש</Btn></div>
      </div>
    );
  }
}
