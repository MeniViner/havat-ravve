// Shared placement patterns of the tidy round (havat-raveh-tidy/design, RULES.md). Each one is built once here and used
// everywhere, so a screen cannot grow its own variant:
//   MoreMenu / MoreButton / ActionSheet  Q5 (⋯ and its sheet), Q11 (a row's sheet)
//   SelectRow / PickerSheet / Dropdown   Q17 (choose one: a row that opens a picker), Q16 (two dropdowns), U3/U8 rows
//   MoreDetails                          Q3 (collapsible "עוד פרטים" card)
//   DragHandle / useReorder              Q21 (reorder by a handle at the row start; keyboard: arrows)
//   UnderlineLink                        Q18 ("עריכת פרטים")
//   DataTable                            Q9 (the table view's card)
//   PayConfirmSheet                      Q7 (after a payment is approved)
import { useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent, type CSSProperties } from 'react';
import { Icon, type IconName } from './icons';
import { Button, CheckboxBox, ConfirmSheet, IconButton, RadioList, RadioRow, Sheet, cx, type Target } from './components';

type Base = { className?: string; style?: CSSProperties };

/* ═════════════ ⋯ and action sheets (Q5, Q11) ═════════════ */

export type ActionItem = {
  /** Visible label, e.g. "צפייה בטבלה", "ייצוא לאקסל", "הדפסה", "היסטוריית שינויים", "מחיקה". */
  label: string;
  icon: IconName;
  /** Optional soft second line ("כל העמודות, כמו בקובץ"). */
  meta?: ReactNode;
  /** red: delete / remove. Red items always sit in their own group at the bottom (Q11). */
  tone?: 'danger';
  /** Hidden items are dropped (role checks: `hidden: !manager`). */
  hidden?: boolean;
  disabled?: boolean;
  /** Runs after the sheet closes. Ignored when `confirm` is set. */
  onSelect?: () => void;
  /** Delete (rule 6): the sheet closes and the Q8 confirmation opens; `onConfirm` runs on "מחיקה". */
  confirm?: { title: ReactNode; text?: ReactNode; confirmLabel?: string; onConfirm: () => unknown };
};

/** The 44px outlined ⋯ button at the end of a top bar (Q4, Q5). One per screen, never beside other controls. */
export function MoreButton({ onClick, label = 'עוד פעולות', className, style }: Base & { onClick: () => void; label?: string }) {
  return <IconButton icon="more" variant="outline" label={label} iconSize={22} onClick={onClick} className={cx('k-more', className)} style={style} />;
}

function ActionRow({ item, onPick }: { item: ActionItem; onPick: (i: ActionItem) => void }) {
  return (
    <li className="k-action">
      <button type="button" className={cx('k-action__btn', item.tone === 'danger' && 'k-action__btn--danger')} disabled={item.disabled} onClick={() => onPick(item)}>
        <span className="k-action__icon" aria-hidden="true"><Icon name={item.icon} size={20} /></span>
        <span className="k-action__body">
          <span className="k-action__label">{item.label}</span>
          {item.meta !== undefined && <span className="k-action__meta">{item.meta}</span>}
        </span>
      </button>
    </li>
  );
}

export interface ActionSheetProps extends Base {
  open: boolean;
  onClose: () => void;
  /** "תרומות · עוד פעולות" (Q5) or the row's name "דבש הגבעה · יאיר" (Q11). */
  title: ReactNode;
  /** One soft line under the title ("לא ענה · הוזמן ב־10.11"). */
  sub?: ReactNode;
  items: ActionItem[];
}
/**
 * Bottom sheet of actions: one card of rows (icon, label, optional meta), and red actions in a card of their own below.
 * Picking an item closes the sheet first; an item with `confirm` then opens the Q8 delete confirmation.
 */
export function ActionSheet({ open, onClose, title, sub, items, className, style }: ActionSheetProps) {
  const [ask, setAsk] = useState<ActionItem['confirm'] | null>(null);
  const shown = items.filter((i) => !i.hidden);
  const plain = shown.filter((i) => i.tone !== 'danger');
  const red = shown.filter((i) => i.tone === 'danger');
  const pick = (i: ActionItem) => {
    onClose();
    if (i.confirm) setAsk(i.confirm);
    else if (i.onSelect) setTimeout(i.onSelect, 0);
  };
  return (
    <>
      <Sheet open={open} onClose={onClose} title={title} sub={sub} className={cx('k-actionsheet', className)} style={style}>
        {plain.length > 0 && <section className="k-card k-card--list"><ul className="k-list k-list--flush">{plain.map((i) => <ActionRow key={i.label} item={i} onPick={pick} />)}</ul></section>}
        {red.length > 0 && <section className="k-card k-card--list"><ul className="k-list k-list--flush">{red.map((i) => <ActionRow key={i.label} item={i} onPick={pick} />)}</ul></section>}
      </Sheet>
      <ConfirmSheet open={!!ask} onClose={() => setAsk(null)} title={ask?.title ?? ''} text={ask?.text} confirmLabel={ask?.confirmLabel ?? 'מחיקה'}
        onConfirm={async () => { const a = ask; if (!a) return; await a.onConfirm(); setAsk(null); }} />
    </>
  );
}

export interface MoreMenuProps extends Base {
  /** The screen's name; the sheet is titled "{title} · עוד פעולות". */
  title: string;
  items: ActionItem[];
  label?: string;
}
/** ⋯ in the top bar plus its sheet (rule 5). Renders nothing when every item is hidden, so the top bar stays empty. */
export function MoreMenu({ title, items, label, className, style }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  if (!items.some((i) => !i.hidden)) return null;
  return (
    <>
      <MoreButton onClick={() => setOpen(true)} label={label} className={className} style={style} />
      <ActionSheet open={open} onClose={() => setOpen(false)} title={`${title} · עוד פעולות`} items={items} />
    </>
  );
}

/* ═════════════ Choosing one of many (Q16, Q17, U3, U8) ═════════════ */

export type PickOption<T extends string = string> = { value: T; label: ReactNode; meta?: ReactNode; leading?: ReactNode; disabled?: boolean };

export interface PickerSheetProps<T extends string> extends Base {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  options: PickOption<T>[];
  value: T | null | undefined;
  /** Called with the chosen value; the sheet closes. With `multiple`: called with the tapped value, the sheet stays open. */
  onChange: (v: T) => void;
  /** Shown above the list (a search field for long lists of people). */
  head?: ReactNode;
  /** Several can be chosen (Q31 "מי משתתף" past five people): check boxes instead of radios, `values` are the chosen ones,
   *  each tap toggles through `onChange`, and "סיום" closes. */
  multiple?: boolean;
  values?: T[];
}
/** A sheet with one radio list: the picker behind a SelectRow or a Dropdown (rule 9: never a grid of chips for more than five). */
export function PickerSheet<T extends string>({ open, onClose, title, sub, options, value, onChange, head, multiple, values = [], className, style }: PickerSheetProps<T>) {
  const label = typeof title === 'string' ? title : 'בחירה';
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub} className={cx('k-picker', className)} style={style}>
      {head}
      {multiple ? (
        <>
          <section role="group" aria-label={label} className="k-card k-card--list">
            <ul className="k-list k-list--flush">
              {options.map((o) => {
                const on = values.includes(o.value);
                return (
                  <li key={o.value} className="k-radioitem">
                    <button type="button" role="checkbox" aria-checked={on} disabled={o.disabled} onClick={() => onChange(o.value)} className="k-radiorow">
                      {o.leading}
                      <span className="k-radiorow__body">
                        <span className="k-radiorow__title">{o.label}</span>
                        {o.meta !== undefined && <span className="k-row__meta">{o.meta}</span>}
                      </span>
                      <CheckboxBox checked={on} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <Button size="bar" block onClick={onClose}>סיום</Button>
        </>
      ) : (
        <RadioList label={label}>
          {options.map((o) => (
            <RadioRow key={o.value} checked={o.value === value} disabled={o.disabled} leading={o.leading} title={o.label} meta={o.meta}
              onSelect={() => { onChange(o.value); onClose(); }} />
          ))}
        </RadioList>
      )}
    </Sheet>
  );
}

export interface SelectRowProps extends Base, Target {
  /** The question: "של מי", "לאן לשלוח אישור תשלום", "מתי תרצו לבוא". */
  label: ReactNode;
  /** The current choice, as the soft meta line ("אורלי לוי", "וואטסאפ"). */
  value?: ReactNode;
  /** Avatar of the chosen person (Q17). */
  leading?: ReactNode;
  /** A pine text link instead of the chevron ("החלפה", Q17). */
  linkLabel?: string;
  disabled?: boolean;
}
/** Single-select row in its own card: label, current value, chevron (U3, U8, Q3 rows) or a "החלפה" link (Q17). Opens a picker. */
export function SelectRow({ label, value, leading, linkLabel, href, onClick, disabled, className, style }: SelectRowProps) {
  const body = (
    <>
      {leading}
      <span className="k-row__body">
        <span className="k-row__title">{label}</span>
        {value !== undefined && <span className="k-row__meta">{value}</span>}
      </span>
      {linkLabel ? <span className="k-selectrow__link">{linkLabel}</span> : <span className="k-row__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>}
    </>
  );
  return (
    <section className={cx('k-card k-card--list k-selectrow', className)} style={style}>
      {href !== undefined
        ? <a href={href} onClick={onClick} className="k-selectrow__hit">{body}</a>
        : <button type="button" onClick={onClick} disabled={disabled} className="k-selectrow__hit">{body}</button>}
    </section>
  );
}

export interface DropdownProps<T extends string> extends Base {
  /** Accessible name and the picker's title: "סוג", "אדם". */
  label: string;
  options: PickOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Text on the button when the value has no option label. */
  placeholder?: string;
}
/** A 44px field-like button with a down chevron that opens a PickerSheet (Q16 "כל הסוגים" / "כל האנשים"). */
export function Dropdown<T extends string>({ label, options, value, onChange, placeholder, className, style }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <button type="button" aria-haspopup="listbox" aria-label={`${label}: ${typeof cur?.label === 'string' ? cur.label : placeholder || ''}`}
        className={cx('k-dropdown', className)} style={style} onClick={() => setOpen(true)}>
        <span className="k-dropdown__text">{cur?.label ?? placeholder}</span>
        <Icon name="chevron-down" size={18} />
      </button>
      <PickerSheet open={open} onClose={() => setOpen(false)} title={label} options={options} value={value} onChange={onChange} />
    </>
  );
}

/* ═════════════ Collapsible "עוד פרטים" (Q3) ═════════════ */

export interface MoreDetailsProps extends Base {
  title?: string;
  /** Open on first render when any field inside has a value (Q3). The person can still close it. */
  defaultOpen?: boolean;
  /** Rows (<Row>, <li>) shown when open. */
  children: ReactNode;
}
/** Card with a "עוד פרטים" header button and a chevron; collapsed by default, its rows below when open. */
export function MoreDetails({ title = 'עוד פרטים', defaultOpen = false, children, className, style }: MoreDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx('k-card k-card--list k-moredetails', open && 'k-moredetails--open', className)} style={style}>
      <button type="button" className="k-moredetails__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {title}
        <span className="k-moredetails__chev" aria-hidden="true"><Icon name="chevron-down" size={20} /></span>
      </button>
      {open && <ul className="k-list">{children}</ul>}
    </section>
  );
}

/* ═════════════ Reorder by a handle (Q21) ═════════════ */

/**
 * Drag-to-reorder list rows. `handle(i, name)` gives the props of the DragHandle button at row i; `rowStyle(i)` shifts rows
 * while a drag is going on; dropping commits through `onChange(next)`. Keyboard: the handle is a button, arrow up/down moves.
 */
export function useReorder<T>(items: T[], onChange: (next: T[]) => void) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const start = useRef<{ y: number; h: number; from: number } | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items]; const [x] = next.splice(from, 1); next.splice(to, 0, x); onChange(next);
  };
  const handle = (i: number, name: string) => ({
    name,
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      const li = e.currentTarget.closest('li') as HTMLElement | null;
      start.current = { y: e.clientY, h: li?.offsetHeight || 56, from: i };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: i, to: i, dy: 0 });
    },
    onPointerMove: (e: RPointerEvent<HTMLButtonElement>) => {
      const s = start.current; if (!s) return;
      const dy = e.clientY - s.y;
      const to = Math.max(0, Math.min(items.length - 1, s.from + Math.round(dy / s.h)));
      setDrag({ from: s.from, to, dy });
    },
    onPointerUp: () => {
      const s = start.current; start.current = null;
      if (s && drag) move(s.from, drag.to);
      setDrag(null);
    },
    onPointerCancel: () => { start.current = null; setDrag(null); },
    onKeyDown: (e: RKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
    },
  });
  const rowStyle = (i: number): CSSProperties | undefined => {
    if (!drag || !start.current) return undefined;
    const h = start.current.h;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 2, background: 'var(--surface)', boxShadow: '0 2px 10px rgba(20,23,27,.15)' };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-h}px)` };
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return { transform: `translateY(${h}px)` };
    return undefined;
  };
  return { handle, rowStyle, dragging: !!drag };
}

export type DragHandleProps = ReturnType<ReturnType<typeof useReorder>['handle']>;
/** The 32x44 grip button at the start of a reorderable row ("גרירה לשינוי הסדר: {name}"). */
export function DragHandle({ name, className, style, ...h }: DragHandleProps & Base) {
  return (
    <button type="button" aria-label={`גרירה לשינוי הסדר: ${name}`} className={cx('k-draghandle', className)} style={style} {...h}>
      <Icon name="drag" size={20} />
    </button>
  );
}

/* ═════════════ Underlined text link (Q18) ═════════════ */

/** Pine 16/600 underlined link with an optional icon: "עריכת פרטים" at the top end of the team profile and the guest account. */
export function UnderlineLink({ icon, children, href, onClick, className, style }: Base & Target & { icon?: IconName; children: ReactNode }) {
  const inner = <>{icon && <Icon name={icon} size={16} />}{children}</>;
  if (href !== undefined) return <a href={href} onClick={onClick} className={cx('k-ulink', className)} style={style}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cx('k-ulink', className)} style={style}>{inner}</button>;
}

/* ═════════════ Table view (Q9) ═════════════ */

export type TableCell = string | number;
/** Money ("1,076 ₪") sorts as a number and a date ("19.11.2026", with or without a time) by year, month, day. */
const sortKey = (c: TableCell): TableCell => {
  if (typeof c === 'number') return c;
  const m = /^(-?[\d,]+(?:\.\d+)?) ₪$/.exec(c);
  if (m) return Number(m[1].replace(/,/g, ''));
  const d = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(c);
  if (d) return Number(d[3]) * 1e8 + Number(d[2]) * 1e6 + Number(d[1]) * 1e4 + Number(d[4] || 0) * 100 + Number(d[5] || 0);
  return c;
};
/**
 * The table view's card: a header row of soft 13/600 headings, 15px cells, the first column bold, horizontal scroll inside
 * the card. Tapping a heading sorts by that column (again to reverse).
 */
export function DataTable({ headers, rows, label = 'טבלה', className, style }: Base & { headers: string[]; rows: TableCell[][]; label?: string }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const visible = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = sortKey(a[sort.col] ?? ''), y = sortKey(b[sort.col] ?? '');
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he', { numeric: true });
      return r * sort.dir;
    });
  }, [rows, sort]);
  const toggle = (col: number) => setSort((s) => (s && s.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  return (
    <section className={cx('k-card k-table', className)} style={style}>
      <div className="k-table__scroll" role="region" aria-label={label} tabIndex={0}>
        <table>
          <thead>
            <tr>{headers.map((h, c) => (
              <th key={c} scope="col" aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => toggle(c)}>{h}{sort?.col === c && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}</button>
              </th>
            ))}</tr>
          </thead>
          <tbody>{visible.map((r, i) => <tr key={i}>{r.map((v, c) => <td key={c}><bdi>{v}</bdi></td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

/* ═════════════ Payment confirmation (Q7) ═════════════ */

export type PayChannel = 'whatsapp' | 'email' | 'none';
export interface PayConfirmSheetProps extends Base {
  open: boolean;
  onClose: () => void;
  /** First name for "לשלוח ל{name} אישור שקיבלנו?". */
  name: string;
  /** Which channels exist for this person (no phone: no WhatsApp; no e-mail: no e-mail). "none" is always there. */
  channels: PayChannel[];
  /** Starts on the guest's preference. */
  initial: PayChannel;
  /** The message preview (the farm's template filled in). */
  preview: string;
  /** Runs with the chosen channel when the button is pressed; the sheet closes after it resolves. */
  onSend: (c: PayChannel) => unknown;
  title?: string;
}
const PAY_ROWS: Record<PayChannel, { icon: IconName; title: string; meta: string; button: string }> = {
  whatsapp: { icon: 'message', title: 'אישור בוואטסאפ', meta: 'נפתחת הודעה מוכנה, שולחים בעצמך', button: 'שליחה בוואטסאפ' },
  email: { icon: 'mail', title: 'אישור במייל', meta: 'נשלח לבד תוך כמה דקות', button: 'שליחה במייל' },
  none: { icon: 'check', title: 'בלי אישור', meta: 'רק לסמן ששולם', button: 'סגירה' },
};
/** "התשלום אושר": how to tell the person (WhatsApp / automatic e-mail / none), the message preview, one send button. */
export function PayConfirmSheet({ open, onClose, name, channels, initial, preview, onSend, title = 'התשלום אושר', className, style }: PayConfirmSheetProps) {
  const [pick, setPick] = useState<PayChannel>(initial);
  const [busy, setBusy] = useState(false);
  const list: PayChannel[] = (['whatsapp', 'email', 'none'] as PayChannel[]).filter((c) => c === 'none' || channels.includes(c));
  const cur = list.includes(pick) ? pick : list[0];
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSend(cur); onClose(); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title} sub={`לשלוח ל${name} אישור שקיבלנו?`} className={cx('k-payconfirm', className)} style={style}>
      <RadioList label="איך לשלוח אישור">
        {list.map((c) => (
          <RadioRow key={c} checked={c === cur} onSelect={() => setPick(c)} title={PAY_ROWS[c].title} meta={PAY_ROWS[c].meta}
            leading={<span className="k-icontile" aria-hidden="true"><Icon name={PAY_ROWS[c].icon} size={20} /></span>} />
        ))}
      </RadioList>
      {cur !== 'none' && <blockquote className="k-payconfirm__preview">{preview}</blockquote>}
      <Button size="bar" block icon={cur === 'none' ? undefined : PAY_ROWS[cur].icon} disabled={busy} onClick={go}>{PAY_ROWS[cur].button}</Button>
    </Sheet>
  );
}
