// The console on a computer: the parts every screen is built from (docs/console-desktop-plan.md). Sizes, colours and
// spacing are the designs' own (K1-K16); colours come from the v2 kit's tokens. Used only from 1024 px up (useWide).
import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { DIcon } from './icons';
import { fmt } from '../shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ───────── page ───────── */
/** The page: header (group, title, one soft sentence, at most two buttons or one chip group) and the content under it. */
export function Page({ group, title, sub, actions, children }: { group: string; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="d-head">
        <div className="d-head__titles">
          <span className="d-head__group">{group}</span>
          <h1 className="d-head__title">{title}</h1>
          {sub !== undefined && <span className="d-head__sub">{sub}</span>}
        </div>
        {actions && <div className="d-head__actions">{actions}</div>}
      </header>
      <div className="d-body">{children}</div>
    </>
  );
}
/** A row of columns that fills what is left of the page. */
export const Cols = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('d-cols', className)}>{children}</div>;
/** A column: `grow` takes the space; otherwise a fixed width (the side columns keep theirs at any window width). */
export const Col = ({ children, width, gap = 16, style }: { children: ReactNode; width?: number; gap?: number; style?: CSSProperties }) =>
  <div className="d-col" style={{ ...(width ? { flex: 'none', width } : { flex: 1, minWidth: 0 }), gap, ...style }}>{children}</div>;
/** A fixed row of things that keep their height (tiles, attention cards, the toolbar). */
export const Line = ({ children, gap = 12, between }: { children: ReactNode; gap?: number; between?: boolean }) => <div className={cx('d-line', between && 'd-line--between')} style={{ gap }}>{children}</div>;

/* ───────── buttons and controls ───────── */
export type BtnKind = 'neutral' | 'action' | 'primary' | 'danger';
/** 36 px. neutral: outlined; action: outlined green; primary: filled green; danger: outlined red (always last). */
export function Btn({ kind = 'neutral', icon, children, onClick, disabled, title, type = 'button' }: { kind?: BtnKind; icon?: string; children: ReactNode; onClick?: (e: MouseEvent) => void; disabled?: boolean; title?: string; type?: 'button' | 'submit' }) {
  return <button type={type} className={`d-btn d-btn--${kind}`} onClick={onClick} disabled={disabled} title={title}>{icon && <DIcon name={icon} size={16} />}{children}</button>;
}
/** A text action or link (13/600 green). */
export function Act({ children, onClick, href, danger, disabled }: { children: ReactNode; onClick?: (e: MouseEvent) => void; href?: string; danger?: boolean; disabled?: boolean }) {
  const c = cx('d-act', danger && 'd-act--danger');
  return href ? <a className={c} href={href} onClick={onClick}>{children}</a> : <button type="button" className={c} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>{children}</button>;
}
export function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return <div className="d-chips" role="group" aria-label={label}>{options.map((o) => <button key={o.value} type="button" className="d-chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="d-switch" disabled={disabled} onClick={(e) => { e.stopPropagation(); onChange(!on); }}><span /></button>;
}
export function Search({ value, onChange, placeholder, width = 320 }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number | string }) {
  return <label className="d-search" style={{ width }}><DIcon name="search" size={16} /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
export function Seg<T extends string>({ options, value, onChange, label, disabled }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return <div className="d-seg" role="radiogroup" aria-label={label}>{options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Select({ value, onChange, options, label, width, bare }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; width?: number | string; bare?: boolean }) {
  return <span className={cx('d-select', bare && 'd-select--bare')} style={width ? { width } : undefined}><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><DIcon name="down" size={bare ? 12 : 16} /></span>;
}
/** A labelled input, 36 px. */
export function Input({ label, value, onChange, placeholder, required, ltr, type = 'text', multiline, hint, error, labelHidden, disabled, list }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; ltr?: boolean; type?: string; multiline?: boolean; hint?: ReactNode; error?: string; labelHidden?: boolean; disabled?: boolean; list?: string }) {
  const id = useId();
  const p = { id, value, placeholder, disabled, 'aria-invalid': !!error || undefined, 'aria-label': labelHidden ? label : undefined, dir: ltr ? 'ltr' as const : undefined, className: 'd-input' };
  return (
    <div className="d-field">
      {!labelHidden && <label className="d-field__label" htmlFor={id}>{label}{required ? ' · חובה' : ''}</label>}
      {multiline ? <textarea {...p} rows={4} onChange={(e) => onChange(e.target.value)} /> : <input {...p} type={type} list={list} onChange={(e) => onChange(e.target.value)} />}
      {error ? <span className="d-field__err" role="alert">{error}</span> : hint ? <span className="d-field__hint">{hint}</span> : null}
    </div>
  );
}
/** A checklist line: box, name, and what it means at the end. */
export function Check({ on, onChange, label, aside, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; aside?: ReactNode; disabled?: boolean }) {
  return <div className="d-check"><button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}><span className="d-check__box">{on && <DIcon name="check" size={12} stroke={3} />}</span><span className="d-check__label">{label}</span></button>{aside !== undefined && <span className="d-check__aside">{aside}</span>}</div>;
}
/** Search, chips and other controls above a table; `end` sits at the other end. */
export const Toolbar = ({ children, end }: { children: ReactNode; end?: ReactNode }) => <div className="d-toolbar"><div className="d-toolbar__side">{children}</div>{end && <div className="d-toolbar__side">{end}</div>}</div>;

/* ───────── cards ───────── */
/** A card: title 15/700, an aside (soft text or an Act), content. `fill`: takes the height left; `tight`: ends with a table. */
export function DCard({ title, aside, children, fill, tight, style }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; fill?: boolean; tight?: boolean; style?: CSSProperties }) {
  return (
    <section className={cx('d-card', fill && 'd-card--fill', tight && 'd-card--tight')} style={style}>
      {title !== undefined && <div className="d-card__head"><h2>{title}</h2>{aside !== undefined && <span className="d-card__aside">{aside}</span>}</div>}
      {children}
    </section>
  );
}
/** A card that is only a table, to its edges; long tables scroll inside it. */
export const TableCard = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <section className="d-card d-card--table" style={style}>{children}</section>;
export const Tile = ({ value, label }: { value: ReactNode; label: ReactNode }) => <section className="d-tile"><Num value={value} label={label} /></section>;
export const Tiles = ({ items }: { items: { value: ReactNode; label: ReactNode }[] }) => <Line>{items.map((t, i) => <Tile key={i} {...t} />)}</Line>;
/** A number (28/700) over its soft label. */
export const Num = ({ value, label }: { value: ReactNode; label: ReactNode }) => <div className="d-num"><b>{value}</b><span>{label}</span></div>;
export const Nums = ({ items }: { items: { value: ReactNode; label: ReactNode }[] }) => <div className="d-nums">{items.map((t, i) => <Num key={i} {...t} />)}</div>;
/** A card with a coloured start edge: one line of what, one of detail, a link to the screen that fixes it. */
export const Attention = ({ tone, title, text, link, href }: { tone: 'red' | 'amber'; title: ReactNode; text: ReactNode; link: string; href: string }) =>
  <a className={`d-attn d-attn--${tone}`} href={href}><span className="d-attn__text"><b>{title}</b><span>{text}</span></span><span className="d-attn__go">{link}</span></a>;
/** A round mark with one line and a soft line (the last backup, the security summary). */
export const Summary = ({ icon, tone, title, text }: { icon: string; tone: 'green' | 'amber' | 'red'; title: ReactNode; text: ReactNode }) =>
  <section className="d-card d-summary"><span className={`d-summary__mark d-summary__mark--${tone}`}><DIcon name={icon} size={20} /></span><span className="d-summary__text"><b>{title}</b><span>{text}</span></span></section>;
export const Hero = ({ children }: { children: ReactNode }) => <section className="d-hero k-on-dark">{children}</section>;

export type TagTone = 'neutral' | 'green' | 'red' | 'amber' | 'warm';
export const DTag = ({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) => <span className={`d-tag d-tag--${tone}`}>{children}</span>;
export type DotTone = 'ok' | 'warn' | 'bad' | 'unknown';
export const DDot = ({ tone, size = 8, label }: { tone: DotTone; size?: number; label?: string }) => <span className={`d-dot d-dot--${tone}`} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
/** A record path, an operation key, a request line. */
export const Mono = ({ children }: { children: ReactNode }) => <span className="d-mono" dir="ltr">{children}</span>;
export const Ltr = ({ children }: { children: ReactNode }) => <span dir="ltr" className="d-ltr">{children}</span>;
/** A tinted line: warm (information) or red (a problem). */
export const Notice = ({ tone = 'warm', icon, children }: { tone?: 'warm' | 'red'; icon?: string; children: ReactNode }) => <div className={`d-notice d-notice--${tone}`}>{icon && <span className="d-notice__icon"><DIcon name={icon} size={16} /></span>}<span>{children}</span></div>;
export const Small = ({ children }: { children: ReactNode }) => <p className="d-small">{children}</p>;

/* ───────── label and value rows ───────── */
export const Fact = ({ label, children, labelWidth }: { label: ReactNode; children: ReactNode; labelWidth?: number }) => <div className="d-fact"><span className="d-fact__label" style={labelWidth ? { width: labelWidth } : undefined}>{label}</span><span className="d-fact__value">{children}</span></div>;
export const Facts = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div className="d-facts" style={style}>{children}</div>;
export const SubTitle = ({ children }: { children: ReactNode }) => <h3 className="d-sub">{children}</h3>;
/** A dated line of a history. */
export const Hist = ({ when, children, width }: { when: ReactNode; children: ReactNode; width?: number }) => <div className="d-hist"><span className="d-hist__when" style={width ? { width } : undefined}>{when}</span><span className="d-hist__what">{children}</span></div>;

/* ───────── table ───────── */
export type Column<T> = { key: string; head: ReactNode; cell: (row: T) => ReactNode; width?: number | string; align?: 'start' | 'center' | 'end'; strong?: boolean; soft?: boolean; wrap?: boolean };
/**
 * Every list of records. Rows are about 38 px. With `onSelect` the rows are selectable: a click, or the arrow keys
 * (Home, End), and Enter runs `onEnter` (the primary action) on the selected row.
 */
export function Table<T>({ columns, rows, rowKey, selected, onSelect, onEnter, label, loading, error, retry, empty, rowTone, inset, head = true, skeleton = 8 }: {
  columns: Column<T>[]; rows: T[] | null; rowKey: (r: T) => string; selected?: string | null; onSelect?: (key: string) => void; onEnter?: (r: T) => void; label: string;
  loading?: boolean; error?: string | null; retry?: () => void; empty: ReactNode; rowTone?: (r: T) => 'red' | undefined; inset?: boolean; head?: boolean; skeleton?: number;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const keys = (rows || []).map(rowKey);
  const at = selected ? keys.indexOf(selected) : -1;
  const focusRow = (i: number) => { const el = body.current?.querySelectorAll<HTMLElement>('tr[data-row]')[i]; el?.focus(); el?.scrollIntoView({ block: 'nearest' }); };
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number) => {
    if (e.target !== e.currentTarget) return;
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null;
    if (to !== null) { e.preventDefault(); if (to >= 0 && to < keys.length) { onSelect?.(keys[to]); focusRow(to); } return; }
    if (e.key === ' ') { e.preventDefault(); onSelect?.(keys[i]); }
    if (e.key === 'Enter') { e.preventDefault(); onSelect?.(keys[i]); onEnter?.(rows![i]); }
  };
  const pick = !!onSelect;
  return (
    <div className={cx('d-table', inset && 'd-table--inset')}>
      {!!error && !rows?.length ? <Failed text={error} retry={retry} /> : (
        <table aria-label={label} aria-busy={loading || undefined}>
          {head && <thead><tr>{columns.map((c) => <th key={c.key} scope="col" style={{ width: c.width ?? 'auto', textAlign: c.align || 'start' }}>{c.head}</th>)}</tr></thead>}
          <tbody ref={body}>
            {rows && rows.map((r, i) => {
              const k = keys[i];
              const on = k === selected;
              return (
                <tr key={k} data-row={k} className={cx(on && 'is-selected', rowTone?.(r) === 'red' && 'is-red', pick && 'is-pick')} aria-selected={pick ? on : undefined}
                  tabIndex={pick ? (on || (at < 0 && i === 0) ? 0 : -1) : undefined} onClick={pick ? () => onSelect!(k) : undefined} onKeyDown={pick ? (e) => onKey(e, i) : undefined}>
                  {columns.map((c) => <td key={c.key} className={cx(c.strong && 'is-strong', c.soft && 'is-soft', c.wrap && 'is-wrap')} style={{ textAlign: c.align || 'start' }}>{c.cell(r)}</td>)}
                </tr>
              );
            })}
            {!rows && Array.from({ length: skeleton }, (_, i) => <tr key={i} className="is-skeleton" aria-hidden="true">{columns.map((c, j) => <td key={c.key}><span className="d-skel" style={{ width: j === 0 ? '62%' : '48%' }} /></td>)}</tr>)}
          </tbody>
        </table>
      )}
      {rows && !rows.length && !error && <p className="d-empty">{empty}</p>}
      {!!error && !!rows?.length && <Failed text={error} retry={retry} />}
    </div>
  );
}
/** What failed, and a way to try again. */
export const Failed = ({ text, retry }: { text: ReactNode; retry?: () => void }) => <div className="d-failed" role="alert"><span>{retry && typeof text === 'string' ? text.replace(/[.,]?\s*ו?נסו שוב\.?$/, '') : text}</span>{retry && <Act onClick={retry}>לנסות שוב</Act>}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <p className="d-empty">{children}</p>;
/** Placeholder lines in the layout's own shape while a block loads. */
export const Skeleton = ({ lines = 3, height = 14 }: { lines?: number; height?: number }) => <div className="d-skels" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} className="d-skel" style={{ height, width: `${[92, 74, 84, 60][i % 4]}%` }} />)}</div>;
export const SkeletonTiles = ({ n }: { n: number }) => <Line>{Array.from({ length: n }, (_, i) => <section key={i} className="d-tile" aria-hidden="true"><Skeleton lines={2} height={18} /></section>)}</Line>;

/* ───────── detail panel ───────── */
/** 360 px beside the table: title, a soft line, the content, actions in a footer (primary first, destructive last). */
export function Panel({ title, sub, children, footer, width = 360, label, aside }: { title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; label?: string; aside?: ReactNode }) {
  return (
    <aside className="d-panel" style={{ width }} aria-label={label}>
      <div className="d-panel__head"><div className="d-panel__title"><h2>{title}</h2>{aside}</div>{sub !== undefined && <span>{sub}</span>}</div>
      <div className="d-panel__body">{children}</div>
      {footer && <div className="d-panel__foot">{footer}</div>}
    </aside>
  );
}
/** The panel before anything is selected. */
export const EmptyPanel = ({ children, width = 360 }: { children: ReactNode; width?: number }) => <aside className="d-panel" style={{ width }}><p className="d-empty">{children}</p></aside>;
export const LoadingPanel = ({ width = 360 }: { width?: number }) => <aside className="d-panel" style={{ width }} aria-busy="true"><div className="d-panel__head"><Skeleton lines={2} height={18} /></div><div className="d-panel__body"><Skeleton lines={7} /></div></aside>;

/* ───────── charts ───────── */
export type BarDatum = { key: string; value: number; label?: string; tip: string; on?: boolean };
/** Vertical bars, oldest on the left unless `rtl`; the current one (`on`) in pine. The card's aside says its numbers. */
export function VBars({ data, height = 150, label, gap = 4, rtl, max: cap = 44, onPick }: { data: BarDatum[]; height?: number; label: string; gap?: number; rtl?: boolean; max?: number; onPick?: (key: string) => void }) {
  const top = Math.max(1, ...data.map((d) => d.value));
  const room = height - 18;
  return (
    <div className="d-bars" role="group" aria-label={label} dir={rtl ? 'rtl' : 'ltr'} style={{ height, gap }}>
      {data.map((d) => (
        <button key={d.key} type="button" className="d-bars__col" title={d.tip} aria-label={d.tip} onMouseEnter={() => onPick?.(d.key)} onFocus={() => onPick?.(d.key)} onClick={() => onPick?.(d.key)}>
          <span className={cx('d-bars__bar', d.on && 'is-on')} style={{ height: d.value ? Math.max(2, Math.round((d.value / top) * room)) : 0, maxWidth: cap }} />
          <span className="d-bars__label">{d.label || ''}</span>
        </button>
      ))}
    </div>
  );
}
/** Horizontal bars with the value and, when given, the share. */
export function Ranking({ items, labelWidth = 128, total, valueWidth = 44, barHeight = 8, empty = 'אין עדיין מה להראות' }: { items: { key: string; label: ReactNode; value: number; text?: ReactNode }[]; labelWidth?: number; total?: number; valueWidth?: number; barHeight?: number; empty?: ReactNode }) {
  const top = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="d-empty d-empty--inline">{empty}</p>;
  return (
    <div className="d-rank">
      {items.map((i) => (
        <div key={i.key} className="d-rank__row">
          <span className="d-rank__label" style={{ width: labelWidth }}>{i.label}</span>
          <span className="d-rank__track" style={{ height: barHeight }}><span style={{ width: `${i.value ? Math.max(2, Math.round((i.value / top) * 100)) : 0}%`, height: barHeight }} /></span>
          <b className="d-rank__value" style={{ width: valueWidth }}>{i.text ?? fmt(i.value)}</b>
          {total !== undefined && <span className="d-rank__share">{total ? Math.round((i.value / total) * 100) : 0}%</span>}
        </div>
      ))}
    </div>
  );
}
/** One meter: a name, "used of limit", and a thin bar (amber from 70%, red from 90%). */
export function Meter({ label, value, of, pct }: { label: ReactNode; value: ReactNode; of?: ReactNode; pct: number }) {
  const p = Math.min(100, Math.max(value === 0 ? 0 : 1, Math.round(pct)));
  return (
    <div className="d-meter">
      <div className="d-meter__head"><span>{label}</span><span className="d-meter__nums"><b>{value}</b>{of !== undefined && <> מתוך {of}</>}</span></div>
      <span role="img" aria-label={`${p} אחוז`} className="d-meter__track"><span className={p >= 90 ? 'is-bad' : p >= 70 ? 'is-warn' : undefined} style={{ width: `${p}%` }} /></span>
    </div>
  );
}
export const Meters = ({ children }: { children: ReactNode }) => <div className="d-meters">{children}</div>;
/** A strip of cells, oldest on the left: green, red, or grey (not known). */
export function CellStrip({ cells, label, height = 18, gap = 2, onDark, radius = 1.5 }: { cells: { key: string; state: 'ok' | 'bad' | 'none'; tip: string }[]; label: string; height?: number; gap?: number; onDark?: boolean; radius?: number }) {
  return <div role="img" aria-label={label} dir="ltr" className={cx('d-strip', onDark && 'd-strip--dark')} style={{ gap }}>{cells.map((c) => <span key={c.key} title={c.tip} className={`is-${c.state}`} style={{ height, borderRadius: radius }} />)}</div>;
}

/* ───────── steps ───────── */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="d-steps">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className={cx('d-step', i < at && 'is-done', i === at && 'is-at')}>
          <span className="d-step__mark">{i < at ? <DIcon name="check" size={14} stroke={2.4} /> : i + 1}</span><span className="d-step__label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ───────── dialog ───────── */
/** A window in the middle for what does not fit the panel (versions of a record, the mail's template, a new key). */
export function Dialog({ open, onClose, title, sub, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const on = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.k-sheet')) close.current(); };
    document.addEventListener('keydown', on);
    return () => { document.removeEventListener('keydown', on); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="d-dialog"><button type="button" className="d-dialog__back" aria-label="סגירה" tabIndex={-1} onClick={onClose} />
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className="d-dialog__box" style={{ width }}>
        <div className="d-dialog__head"><div><h2 id={id}>{title}</h2>{sub !== undefined && <span>{sub}</span>}</div><button type="button" className="d-iconbtn" aria-label="סגירה" onClick={onClose}><DIcon name="close" size={18} /></button></div>
        <div className="d-dialog__body">{children}</div>
        {footer && <div className="d-panel__foot">{footer}</div>}
      </section>
    </div>
  );
}

/* ───────── files for Excel ───────── */
/** Saves rows as a CSV that Excel opens in Hebrew (UTF-8 BOM; a cell that would run as a formula is kept as text). */
export function saveCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const q = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const text = '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
