// v2 kit components. Each one reproduces a recurring pattern of design/html/*.html; KIT.md lists the ids.
// Rules: real <button>/<a>/<input>+<label>; className and style pass through; RTL only; no emoji.
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icons';
import { useSwipe, swipeList, type SwipeActions } from './swipe';

export const cx = (...parts: unknown[]) => parts.filter(Boolean).join(' ');

type Base = { className?: string; style?: CSSProperties };

/** Where a control goes: an href renders <a>, otherwise a <button type="button">. Both may be given (SPA links). */
export type Target = { href?: string; onClick?: MouseEventHandler<HTMLElement> };

function Press({
  href,
  onClick,
  className,
  style,
  children,
  label,
  extra,
}: Target & Base & { children?: ReactNode; label?: string; extra?: Record<string, unknown> }) {
  if (href !== undefined) {
    return (
      <a href={href} onClick={onClick} className={className} style={style} aria-label={label} {...extra}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style} aria-label={label} {...extra}>
      {children}
    </button>
  );
}

/* ═════════════ Layout ═════════════ */

export type ScreenVariant = 'root' | 'detail' | 'form' | 'plain';

export interface ScreenProps extends Base {
  /** root: header screens (padding-top 18, gap 12). detail: TopBar screens (top 6, gap 12). form: FormHeader screens (top 10, gap 14). */
  variant?: ScreenVariant;
  /** Vertical gap between body children in px (design uses 10, 12, 14 or 16). */
  gap?: number;
  /** Pinned above the scrolling body: DemoStrip, offline Strip. */
  top?: ReactNode;
  /** Pinned below the body, in order: Toast, CaptureBar, BottomNav or BottomBar. */
  bottom?: ReactNode;
  /** Natural page height instead of a 100dvh frame with a scrolling body. */
  auto?: boolean;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  children?: ReactNode;
}

/** The page frame of every screen: optional top strip, scrolling body (padding 16 sides), pinned bottom areas. */
export function Screen({ variant = 'root', gap, top, bottom, auto, className, style, bodyClassName, bodyStyle, children }: ScreenProps) {
  return (
    <div className={cx('v2 k-screen', `k-screen--${variant}`, auto && 'k-screen--auto', className)} dir="rtl" style={style}>
      {top && <div className="k-screen__top">{top}</div>}
      <main className={cx('k-screen__body', bodyClassName)} style={gap !== undefined ? { gap, ...bodyStyle } : bodyStyle}>
        {children}
      </main>
      {bottom && <div className="k-screen__bottom">{bottom}</div>}
    </div>
  );
}

export interface StackProps extends Base, Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> {
  gap?: number;
  align?: CSSProperties['alignItems'];
  as?: 'div' | 'section' | 'ul' | 'header' | 'footer';
  children?: ReactNode;
}
/** Vertical flex column with a gap (px). */
export function Stack({ gap = 10, align, as = 'div', className, style, children, ...rest }: StackProps) {
  const Tag = as as 'div';
  return (
    <Tag className={cx('k-stack', className)} style={{ gap, alignItems: align, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export interface InlineProps extends Base, Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  gap?: number;
  justify?: CSSProperties['justifyContent'];
  align?: CSSProperties['alignItems'];
  wrap?: boolean;
  children?: ReactNode;
}
/** Horizontal flex row (items centred) with a gap (px). */
export function Inline({ gap = 8, justify, align, wrap, className, style, children, ...rest }: InlineProps) {
  return (
    <div className={cx('k-inline', wrap && 'k-inline--wrap', className)} style={{ gap, justifyContent: justify, alignItems: align, ...style }} {...rest}>
      {children}
    </div>
  );
}

/** Text for screen readers only. */
export function VisuallyHidden({ children, as: Tag = 'span' }: { children: ReactNode; as?: 'span' | 'label' | 'h2' }) {
  return <Tag className="k-sr">{children}</Tag>;
}

/* ═════════════ Headers ═════════════ */

export interface RootHeaderProps extends Base {
  /** Small soft line above the title, e.g. "חמישי · 19.11" or "6 פריטים פתוחים". */
  overline?: ReactNode;
  title: ReactNode;
  /** Unread notifications; 0 hides the red badge. */
  unread?: number;
  /** Initials in the avatar circle, e.g. "יפ" (see initials()). */
  avatar?: string;
  avatarSrc?: string;
  searchHref?: string;
  onSearch?: MouseEventHandler<HTMLElement>;
  bellHref?: string;
  onBell?: MouseEventHandler<HTMLElement>;
  avatarHref?: string;
  onAvatar?: MouseEventHandler<HTMLElement>;
  hideSearch?: boolean;
  hideBell?: boolean;
  searchLabel?: string;
  avatarLabel?: string;
}

/** Root-screen header: overline + h1 30/700 on the start side; search, bell (red badge), avatar 44 on the end side. T1, S1, F1, M1, D3. */
export function RootHeader({
  overline,
  title,
  unread = 0,
  avatar,
  avatarSrc,
  searchHref,
  onSearch,
  bellHref,
  onBell,
  avatarHref,
  onAvatar,
  hideSearch,
  hideBell,
  searchLabel = 'חיפוש',
  avatarLabel = 'אני: הפרטים וההגדרות שלי',
  className,
  style,
}: RootHeaderProps) {
  const bellLabel = unread > 0 ? `התראות, ${unread} חדשות` : 'התראות';
  return (
    <header className={cx('k-rootheader', className)} style={style}>
      <div className="k-rootheader__titles">
        {overline !== undefined && <span className="k-rootheader__overline">{overline}</span>}
        <h1 className="k-h1">{title}</h1>
      </div>
      <div className="k-rootheader__actions">
        {!hideSearch && (
          <Press href={searchHref} onClick={onSearch} className="k-headbtn" label={searchLabel}>
            <Icon name="search" size={22} />
          </Press>
        )}
        {!hideBell && (
          <Press href={bellHref} onClick={onBell} className="k-headbtn" label={bellLabel}>
            <Icon name="bell" size={22} />
            {unread > 0 && (
              <span className="k-headbtn__badge" aria-hidden="true">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Press>
        )}
        {avatar !== undefined && (
          <Press href={avatarHref} onClick={onAvatar} className="k-avatar k-avatar--outline" style={{ width: 44, height: 44, fontSize: 15 }} label={avatarLabel}>
            {avatarSrc ? <img className="k-avatar__img" src={avatarSrc} alt="" /> : avatar}
          </Press>
        )}
      </div>
    </header>
  );
}

export interface BackLinkProps extends Target, Base {
  /** Named destination: "משימות", "אירועים", or "חזרה" for screens opened from anywhere. */
  label: string;
}
/** Pine back link with the RTL back chevron, min-height 44. */
export function BackLink({ label, href, onClick, className, style }: BackLinkProps) {
  return (
    <Press href={href} onClick={onClick} className={cx('k-backlink', className)} style={style}>
      <Icon name="back" size={20} />
      {label}
    </Press>
  );
}

export interface TopBarProps extends Base {
  back: BackLinkProps;
  /** One action on the end side, e.g. <Button variant="outline" icon="edit" iconSize={16}>עריכה</Button>. */
  end?: ReactNode;
}
/** Detail-screen top bar: named back link on the start side, one action on the end side. T3, B2, M4, Y1. */
export function TopBar({ back, end, className, style }: TopBarProps) {
  return (
    <div className={cx('k-topbar', className)} style={style}>
      <BackLink {...back} />
      {end && <div className="k-topbar__end">{end}</div>}
    </div>
  );
}

export interface PageTitleProps extends Base {
  children: ReactNode;
  /** root 30/700 (default, also detail screens like B2), detail 26/700 (T3, D4), form 22/700. */
  size?: 'root' | 'detail' | 'form';
  id?: string;
}
/** The h1 of a detail screen, below the TopBar. */
export function PageTitle({ children, size = 'root', id, className, style }: PageTitleProps) {
  return (
    <h1 id={id} className={cx('k-h1', size === 'detail' && 'k-h1--detail', size === 'form' && 'k-h1--form', className)} style={style}>
      {children}
    </h1>
  );
}

export interface FormHeaderProps extends Base {
  title: ReactNode;
  cancelLabel?: string;
  cancelHref?: string;
  onCancel?: MouseEventHandler<HTMLElement>;
  /** Replace the cancel link (e.g. "הפסקה" in S6) or pass null to hide it. */
  end?: ReactNode;
}
/** Form and sheet header: title 22/700 and a quiet pine "ביטול". T5, N11, C13, S5. */
export function FormHeader({ title, cancelLabel = 'ביטול', cancelHref, onCancel, end, className, style }: FormHeaderProps) {
  return (
    <header className={cx('k-formheader', className)} style={style}>
      <h1 className="k-h1 k-h1--form">{title}</h1>
      {end !== undefined ? end : (
        <Press href={cancelHref} onClick={onCancel} className="k-quietlink">
          {cancelLabel}
        </Press>
      )}
    </header>
  );
}

/** Soft 14/600 title above a group of cards (outside cards), e.g. "קרובים", "מה קרה עד עכשיו". M3, T3. */
export function SectionTitle({ children, spaced, className, style, as: Tag = 'h2' }: Base & { children: ReactNode; spaced?: boolean; as?: 'h2' | 'h3' | 'span' }) {
  return (
    <Tag className={cx('k-sectiontitle', spaced && 'k-sectiontitle--spaced', className)} style={style}>
      {children}
    </Tag>
  );
}

/** Pine 13/600 overline, e.g. "הבא בתור". T1, F1, P1. */
export function Overline({ children, className, style }: Base & { children: ReactNode }) {
  return <span className={cx('k-overline', className)} style={style}>{children}</span>;
}

/* ═════════════ Bottom areas ═════════════ */

export interface BottomBarProps extends Base {
  /** Buttons: primary <Button size="bar" grow>, optional secondary <Button variant="secondary" size="bar">. */
  children: ReactNode;
  /** Stack vertically: primary on top, quiet link below ("הוספה, ועוד אחת" in T5). */
  column?: boolean;
}
/** White bar pinned under forms and detail screens: padding 12 16 20, 1px top line. T3, T5, N11. */
export function BottomBar({ children, column, className, style }: BottomBarProps) {
  return <div className={cx('k-bottombar', column && 'k-bottombar--column', className)} style={style}>{children}</div>;
}

export interface NavItem extends Target {
  key: string;
  label: string;
  icon: IconName;
  active?: boolean;
  /** Small red count on the icon. */
  badge?: number;
}
export interface BottomNavProps extends Base {
  /** 2 to 5 items: vendor 2, staff 3, manager 4, plus "אירוע" on event days. */
  items: NavItem[];
  label?: string;
}
/** Bottom navigation, 66 high; active = 3px ink top border, bold ink label, aria-current="page". T1, M1. */
export function BottomNav({ items, label = 'ניווט ראשי', className, style }: BottomNavProps) {
  return (
    <nav aria-label={label} className={cx('k-nav', className)} style={style}>
      {items.map((it) => (
        <Press
          key={it.key}
          href={it.href}
          onClick={it.onClick}
          className="k-nav__item"
          extra={it.active ? { 'aria-current': 'page' } : undefined}
        >
          <span className="k-nav__icon">
            <Icon name={it.icon} size={24} />
            {!!it.badge && <span className="k-nav__badge" aria-hidden="true">{it.badge > 99 ? '99+' : it.badge}</span>}
          </span>
          {it.label}
          {!!it.badge && <span className="k-sr">, {it.badge} חדשים</span>}
        </Press>
      ))}
    </nav>
  );
}

export interface CaptureBarProps extends Base {
  value?: string;
  onChange?: (value: string) => void;
  /** Enter key or plus: add the typed text. */
  onSubmit?: (value: string) => void;
  onCamera?: () => void;
  onMic?: () => void;
  placeholder?: string;
  id?: string;
  cameraLabel?: string;
  micLabel?: string;
}
/** Global capture bar above the nav on every root: plus, input, camera, mic. T1, S1 ("להוסיף לסופר"). */
export function CaptureBar({
  value,
  onChange,
  onSubmit,
  onCamera,
  onMic,
  placeholder = 'משימה או קנייה חדשה',
  id,
  cameraLabel = 'צילום',
  micLabel = 'הקלטה',
  className,
  style,
}: CaptureBarProps) {
  const auto = useId();
  const inputId = id ?? `cap-${auto}`;
  return (
    <form
      className={cx('k-capture', className)}
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        if (onSubmit && value && value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="k-capture__box">
        <span className="k-capture__plus" aria-hidden="true"><Icon name="plus" size={20} /></span>
        <label htmlFor={inputId} className="k-sr">{placeholder}</label>
        <input
          id={inputId}
          className="k-capture__input"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          enterKeyHint="send"
          autoComplete="off"
        />
        <button type="button" className="k-capture__btn" aria-label={cameraLabel} onClick={onCamera}><Icon name="camera" size={24} /></button>
        <button type="button" className="k-capture__btn" aria-label={micLabel} onClick={onMic}><Icon name="mic" size={24} /></button>
      </div>
    </form>
  );
}

/* ═════════════ Cards and rows ═════════════ */

export interface CardProps extends Base, Target {
  /** none (default, for lists use ListCard), sm 10/12, md 12/14, lg 14/16/16 (T1 next-up), xl 28/16. */
  pad?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** col: column with gap 8 (B2 message cards, P1 project cards). row: row with gap 14 (M3 event cards). */
  layout?: 'col' | 'row';
  as?: 'section' | 'div' | 'article';
  'aria-label'?: string;
  children?: ReactNode;
}
/** White card: 1px line border, radius 8. With href it renders an <a> (whole card is the link). */
export function Card({ pad = 'none', layout, as: Tag = 'div', href, onClick, className, style, children, ...rest }: CardProps) {
  const cls = cx('k-card', pad !== 'none' && `k-card--pad-${pad}`, layout && `k-card--${layout}`, className);
  if (href !== undefined) {
    return <a href={href} onClick={onClick} className={cls} style={style} aria-label={rest['aria-label']}>{children}</a>;
  }
  return <Tag className={cls} style={style} onClick={onClick} aria-label={rest['aria-label']}>{children}</Tag>;
}

export interface SectionHeaderProps extends Base {
  title: ReactNode;
  /** With an icon (place groups, T1) the count shows soft at the end; otherwise it is appended as "title · count". */
  count?: number;
  /** Leading soft icon, 18px: "pin" for place groups in T1. */
  icon?: IconName;
  /** strong: 16/700 (C1 "חדש · 3"). quiet: 14/600 soft, 38 high (S1 "לקנות · 4"). */
  tone?: 'strong' | 'quiet';
  /** End slot, usually <TextLink>: "היסטוריה", "לנסות עכשיו". */
  end?: ReactNode;
  headingLevel?: 2 | 3;
}
/** Header row inside a list card. */
export function SectionHeader({ title, count, icon, tone = 'strong', end, headingLevel = 2, className, style }: SectionHeaderProps) {
  const H = headingLevel === 3 ? 'h3' : 'h2';
  if (icon) {
    return (
      <div className={cx('k-cardhead k-cardhead--place', className)} style={style}>
        <span className="k-cardhead__icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
        <H className="k-cardhead__title">{title}</H>
        {count !== undefined && <span className="k-cardhead__count">{count}</span>}
        {end}
      </div>
    );
  }
  return (
    <div className={cx('k-cardhead', tone === 'quiet' && 'k-cardhead--quiet', className)} style={style}>
      <H className="k-cardhead__title">
        {title}
        {count !== undefined && <> · <span className="k-num">{count}</span></>}
      </H>
      {end}
    </div>
  );
}

export interface ListCardProps extends Base {
  /** Header props (or a custom node via `header`). Without a header the first row's line hides under the card border. */
  title?: ReactNode;
  count?: number;
  icon?: IconName;
  tone?: 'strong' | 'quiet';
  end?: ReactNode;
  header?: ReactNode;
  'aria-label'?: string;
  /** <Row> elements (or any <li>). */
  children: ReactNode;
  /** Content after the list inside the card (e.g. a bar chart). */
  footer?: ReactNode;
}
/** Card holding rows separated by 1px lines. T1, C1, S1, D3, M5. */
export function ListCard({ title, count, icon, tone, end, header, children, footer, className, style, ...rest }: ListCardProps) {
  const head = header ?? (title !== undefined ? <SectionHeader title={title} count={count} icon={icon} tone={tone} end={end} /> : null);
  return (
    <section className={cx('k-card k-card--list', className)} style={style} aria-label={rest['aria-label']}>
      {head}
      <ul className={cx('k-list', !head && 'k-list--flush')}>{children}</ul>
      {footer}
    </section>
  );
}

export interface RowProps extends Base, Target {
  title?: ReactNode;
  /** At most one status tag after the title (rule 4). Several are cut to the first. */
  tags?: ReactNode;
  meta?: ReactNode;
  /** Checkbox slot, outside the link: switches to the task-row layout (gap 8, title 16/500). */
  check?: ReactNode;
  /** Inside the link, before the body: IconTile, Avatar, DateBox. */
  leading?: ReactNode;
  /** Inside the link, after the body: a value or a small tag. */
  trailing?: ReactNode;
  /** Bold tabular text at the end, e.g. "6 קרטונים", "200 ₪". */
  value?: ReactNode;
  /** Red unread dot before the chevron. */
  unread?: boolean;
  /** Soft chevron at the end; default true when the row has href or onClick. */
  chevron?: boolean;
  /** Rule 4: ONE control outside the link, at the end: a single Button ("לקחת"), IconButton (WhatsApp) or Toggle.
   *  A row with a control has no chevron. Anything more belongs in the detail screen or a row sheet (ActionSheet, Q11);
   *  a fragment or array of several controls is cut to the first and logged as an error. */
  actions?: ReactElement | null | false;
  /** Struck-through soft title (done tasks, bought items). */
  done?: boolean;
  /** Dimmed (opacity .65), e.g. people already away. */
  muted?: boolean;
  /** Row min-height in px: 50, 54 (default), 56, 58, 60, 64. */
  minHeight?: number;
  /** Replaces title/meta when you need custom body content. */
  children?: ReactNode;
  /** Swipe to reveal: a sideways drag slides the row part way and shows one button (`right` = dragging right).
   *  Nothing runs until the button is pressed. The check, the link and every action keep working as taps. */
  swipe?: SwipeActions;
  'aria-label'?: string;
}
/** Rule 4 guard: a fragment or array holding several elements keeps only the first one. */
function oneOf(node: ReactElement | null | false | undefined, what: string): ReactElement | null {
  if (!node) return null;
  const kids = isValidElement(node) && node.type === Fragment ? Children.toArray((node.props as { children?: ReactNode }).children) : Array.isArray(node) ? Children.toArray(node) : null;
  if (!kids) return node;
  const els = kids.filter(isValidElement);
  if (els.length > 1) console.error(`Row: only one element in "${what}" (RULES.md rule 4); ${els.length} given, the rest is not shown.`);
  return (els[0] as ReactElement) ?? null;
}
/**
 * One list row (<li>). Order: check | [link: leading, body (title + tags, meta), trailing, value, unread, chevron] | actions.
 * T1 task rows, S1 shopping rows, C1 notification rows, M5 guest rows.
 */
export function Row({
  title,
  tags,
  meta,
  check,
  leading,
  trailing,
  value,
  unread,
  chevron,
  actions,
  done,
  muted,
  minHeight,
  href,
  onClick,
  children,
  className,
  style,
  swipe,
  ...rest
}: RowProps) {
  const sw = useSwipe(swipe);
  const interactive = href !== undefined || onClick !== undefined;
  const action = oneOf(actions, 'actions');
  tags = oneOf(tags as ReactElement | null | undefined, 'tags');
  actions = action;
  const showChevron = !action && (chevron ?? interactive);
  const body = (
    <>
      {leading}
      <div className="k-row__body">
        {children ?? (
          <>
            {(title !== undefined || tags) && (
              <span className="k-row__title">
                {title}
                {tags}
              </span>
            )}
            {meta !== undefined && <span className="k-row__meta">{meta}</span>}
          </>
        )}
      </div>
      {trailing}
      {value !== undefined && <span className="k-row__value">{value}</span>}
      {unread && <span className="k-row__dot" role="img" aria-label="חדש" />}
      {showChevron && <span className="k-row__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>}
    </>
  );
  const mh = minHeight ?? (check ? undefined : 54);
  const rowCls = cx('k-row', check && 'k-row--check', interactive && 'k-row--hit', done && 'k-row--done', muted && 'k-row--muted');
  const inner = (
    <>
      {check}
      {interactive ? (
        <Press href={href} onClick={onClick} className="k-row__hit" style={check ? { minHeight: minHeight ?? 54 } : { minHeight: mh }} label={rest['aria-label']}>
          {body}
        </Press>
      ) : (
        body
      )}
      {actions && <div className="k-row__trail">{actions}</div>}
    </>
  );
  if (sw && swipe) {
    const side = sw.offset > 0 ? 'right' : sw.offset < 0 ? 'left' : null;
    const list = side ? swipeList(swipe[side]) : [];
    const open = Math.abs(sw.offset) >= sw.width - 1 && !sw.dragging;
    // laid out left to right: on the left edge (dragging right) the first button is outermost; on the right edge, reversed
    const shown = side === 'left' ? [...list].reverse() : list;
    return (
      <li className={cx('k-swipe', sw.dragging && 'k-swipe--drag', className)} style={style}>
        {shown.length > 0 && (
          <div className={cx('k-swipe__under', `k-swipe__under--${side}`)} style={{ width: Math.max(sw.width, Math.abs(sw.offset)) }}>
            {shown.map((a) => (
              <button key={a.label} type="button" className={cx('k-swipe__btn', `k-swipe__btn--${a.tone}`)} tabIndex={open ? 0 : -1} aria-hidden={!open}
                onClick={() => sw.run(a)}>
                {a.icon && <Icon name={a.icon} size={22} />}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
        <div ref={sw.front} className={cx(rowCls, 'k-swipe__front')} style={{ minHeight: mh, transform: sw.offset ? `translateX(${sw.offset}px)` : undefined }} {...sw.handlers}>
          {inner}
        </div>
      </li>
    );
  }
  return (
    <li className={cx(rowCls, className)} style={{ minHeight: mh, ...style }}>
      {inner}
    </li>
  );
}

/** 36px rounded square with a pine icon on bg, used as a row's leading mark. C1, D3, C8. tone red for urgent. */
export function IconTile({ icon, tone, className, style }: Base & { icon: IconName; tone?: 'pine' | 'red' | 'ink' }) {
  return (
    <span className={cx('k-icontile', tone === 'red' && 'k-icontile--red', tone === 'ink' && 'k-icontile--ink', className)} style={style} aria-hidden="true">
      <Icon name={icon} size={20} />
    </span>
  );
}

/** Key/value card (<dl>): rows min 52, term column 64 wide. T3, S4, C12, Y3. */
export function DetailList({ children, className, style }: Base & { children: ReactNode }) {
  return <dl className={cx('k-dl', className)} style={style}>{children}</dl>;
}
export interface DetailRowProps extends Base {
  term: ReactNode;
  children: ReactNode;
  /** Optional control at the end: outline Button, Stepper. */
  action?: ReactNode;
  /** Regular weight value (notes). */
  plain?: boolean;
}
export function DetailRow({ term, children, action, plain, className, style }: DetailRowProps) {
  return (
    <div className={cx('k-dl__row', className)} style={style}>
      <dt className="k-dl__dt">{term}</dt>
      <dd className={cx('k-dl__dd', plain && 'k-dl__dd--plain')}>{children}</dd>
      {action}
    </div>
  );
}

export interface NextUpCardProps extends Base {
  overline?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  metaIcon?: IconName | null;
  /** Usually <Button size="big" grow icon="check">בוצע</Button> + <Button variant="secondary" size="lg" icon="camera">צילום</Button>. */
  actions?: ReactNode;
  'aria-label'?: string;
}
/** The "הבא בתור" card on root screens: overline, h2 20/700, meta with pin, action row. T1, T4, P1, B4. */
export function NextUpCard({ overline = 'הבא בתור', title, meta, metaIcon = 'pin', actions, className, style, ...rest }: NextUpCardProps) {
  return (
    <section className={cx('k-card k-card--pad-lg k-nextup', className)} style={style} aria-label={rest['aria-label'] ?? (typeof overline === 'string' ? overline : undefined)}>
      {overline && <span className="k-overline">{overline}</span>}
      <h2 className="k-nextup__title">{title}</h2>
      {meta !== undefined && (
        <span className="k-nextup__meta">
          {metaIcon && <Icon name={metaIcon} size={16} />}
          {meta}
        </span>
      )}
      {actions && <div className="k-nextup__actions">{actions}</div>}
    </section>
  );
}

/** White quoted message card (16, line-height 1.5). D1, D9, N2. */
export function Quote({ children, className, style }: Base & { children: ReactNode }) {
  return <blockquote className={cx('k-quote', className)} style={style}>{children}</blockquote>;
}

/** Plain 14px history lines ("אתמול 08:15 · בני יצר את המשימה"), under a SectionTitle. T3, S4. */
export function History({ items, className, style }: Base & { items: ReactNode[] }) {
  return (
    <ul className={cx('k-history', className)} style={style}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

/** 52px date square: day number + month. tone bg (M3) or warm (D4, D5: white 26px numeral). */
export function DateBox({ day, month, tone = 'bg', className, style }: Base & { day: ReactNode; month?: ReactNode; tone?: 'bg' | 'warm' }) {
  return (
    <span className={cx('k-datebox', tone === 'warm' && 'k-datebox--warm', className)} style={style}>
      <b className="k-datebox__day">{day}</b>
      {month !== undefined && <span className="k-datebox__month">{month}</span>}
    </span>
  );
}

/** Red count pill: 22 (tiles) or 18 (sm). */
export function CountBadge({ count, size = 'md', label, className, style }: Base & { count: number; size?: 'md' | 'sm'; label?: string }) {
  return (
    <span className={cx('k-countbadge', size === 'sm' && 'k-countbadge--sm', className)} style={style} aria-label={label}>
      {count}
    </span>
  );
}

export interface TileProps extends Base, Target {
  icon: IconName;
  title: ReactNode;
  meta?: ReactNode;
  /** Red count on the end of the icon row. */
  badge?: number;
  badgeLabel?: string;
}
/** Management grid tile: radius 10, min 88 high, pine icon 24, title 17/700, meta 14. M1, Z4. */
export function Tile({ icon, title, meta, badge, badgeLabel, href, onClick, className, style }: TileProps) {
  return (
    <Press href={href} onClick={onClick} className={cx('k-tile', className)} style={style}>
      <span className="k-tile__top">
        <span className="k-tile__icon" aria-hidden="true"><Icon name={icon} size={24} /></span>
        {!!badge && <CountBadge count={badge} label={badgeLabel ?? `${badge} מחכים`} />}
      </span>
      <b className="k-tile__title">{title}</b>
      {meta !== undefined && <span className="k-tile__meta">{meta}</span>}
    </Press>
  );
}
/** Two-column grid, gap 8 (tiles, stat tiles, D6 quick actions). */
export function TileGrid({ children, className, style }: Base & { children: ReactNode }) {
  return <div className={cx('k-grid2', className)} style={style}>{children}</div>;
}

/* ═════════════ Hero ═════════════ */

export interface HeroProps extends Base, Target {
  /** tight: padding 14 16 (Y1). */
  tight?: boolean;
  /** With href/onClick the hero becomes a row link with a trailing chevron (M1, D3). */
  chevron?: boolean;
  'aria-label'?: string;
  children: ReactNode;
}
/** Warm #4E433D block, white text, radius 12, padding 16. At most one per screen. M1, D3, Y1, M6, F1, B3. */
export function Hero({ tight, chevron, href, onClick, className, style, children, ...rest }: HeroProps) {
  const link = href !== undefined || onClick !== undefined;
  const cls = cx('k-hero', tight && 'k-hero--tight', link && 'k-hero--link', className);
  if (!link) return <section className={cls} style={style} aria-label={rest['aria-label']}>{children}</section>;
  return (
    <Press href={href} onClick={onClick} className={cls} style={style} label={rest['aria-label']}>
      {children}
      {(chevron ?? true) && <Icon name="chevron" size={24} />}
    </Press>
  );
}
/** Big tabular hero number: 48 (default) or 60 (xl, Y1). */
export function HeroNumber({ children, size = 'md', className, style }: Base & { children: ReactNode; size?: 'md' | 'xl' }) {
  return <b className={cx('k-hero__number', size === 'xl' && 'k-hero__number--xl', className)} style={style}>{children}</b>;
}

/* ═════════════ Buttons ═════════════ */

export type ButtonVariant = 'primary' | 'outline' | 'secondary' | 'neutral' | 'dashed' | 'quiet' | 'link' | 'danger' | 'onhero' | 'onhero-solid';
export type ButtonSize = 'md' | 'tall' | 'lg' | 'big' | 'bar';

type ButtonOwn = {
  variant?: ButtonVariant;
  /** md 44 · tall 48 · lg 52 · big 52 with 18/600 (T1 next-up "בוצע") · bar 56 with 18/600 (bottom bars). Font 15/600 unless noted. */
  size?: ButtonSize;
  icon?: IconName;
  /** Default: 22 for primary at bar/big, 20 for bar/big/lg/tall otherwise, 18 at md. Design: edit 16, nav 16, plus 18. */
  iconSize?: number;
  /** Full width (display flex, width 100%). */
  block?: boolean;
  /** flex: 1 inside a row (bottom bar primary, next-up primary). */
  grow?: boolean;
  children?: ReactNode;
};
export type ButtonProps = ButtonOwn & Base &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'style' | 'children'>)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children'>)
  );

/**
 * Button or link-styled-as-button. primary = pine fill; outline = 1.5px pine; secondary = 1.5px ink (16/500, "צילום" T1, "מחיקה" S4);
 * neutral = 1.5px line (T5 "תמונה/הערה/דחוף"); dashed = 1.5px dashed #8A9099 ("הוספת תמונה למשימה" T3);
 * quiet = soft text ("אחר כך", "מחיקת החשבון"); link = pine text ("הוספה, ועוד אחת" T5); danger = red text;
 * onhero = white outline on a hero (F1); onhero-solid = white fill warm text (B4 "קראתי").
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', icon, iconSize, block, grow, className, style, children, ...rest } = props;
  const big = size === 'bar' || size === 'big';
  const isz = iconSize ?? (big ? (variant === 'primary' ? 22 : 20) : size === 'md' ? 18 : 20);
  const cls = cx('k-btn', `k-btn--${variant}`, `k-btn--${size}`, block && 'k-btn--block', grow && 'k-btn--grow', className);
  const inner = (
    <>
      {icon && <Icon name={icon} size={isz} />}
      {children}
    </>
  );
  if (rest.href !== undefined) {
    const a = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return <a {...a} className={cls} style={style}>{inner}</a>;
  }
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type="button" {...b} className={cls} style={style}>{inner}</button>;
}

export interface IconButtonProps extends Base, Target {
  icon: IconName;
  /** Required accessible name. */
  label: string;
  /** ghost (header icons), outline (pine square, Y1 megaphone), bordered (1px line square, F2 arrows), solid (pine circle, D1),
      dashed (dashed circle, P5), quiet (soft, G1 remove), secondary (1.5px ink square, S6 plus). */
  variant?: 'ghost' | 'outline' | 'bordered' | 'solid' | 'dashed' | 'quiet' | 'secondary';
  /** md 44 (default) or lg 56. */
  size?: 'md' | 'lg';
  iconSize?: number;
  round?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}
/** Square or round 44px icon-only control with an aria-label. */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', iconSize, round, disabled, pressed, href, onClick, className, style }: IconButtonProps) {
  const cls = cx('k-iconbtn', variant !== 'ghost' && `k-iconbtn--${variant}`, size === 'lg' && 'k-iconbtn--lg', round && 'k-iconbtn--round', className);
  const ic = <Icon name={icon} size={iconSize ?? (size === 'lg' ? 24 : 20)} />;
  if (href !== undefined) return <a href={href} onClick={onClick} className={cls} style={style} aria-label={label}>{ic}</a>;
  return (
    <button type="button" onClick={onClick} className={cls} style={style} aria-label={label} disabled={disabled} aria-pressed={pressed}>
      {ic}
    </button>
  );
}

/** Pine 15/600 text link, padding 10 0 (card header links "היסטוריה", "לשלוח שוב", "עוד 6"). */
export function TextLink({ children, href, onClick, className, style }: Base & Target & { children: ReactNode }) {
  return <Press href={href} onClick={onClick} className={cx('k-textlink', className)} style={style}>{children}</Press>;
}

/* ═════════════ Chips, segmented, tabs, toggle ═════════════ */

export interface ChipProps extends Base {
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}
/** Filter pill: radius 22, h44, 1px line; selected = warm fill, 600, aria-pressed. C2, M2, E9, F5. */
export function Chip({ selected, onClick, children, className, style }: ChipProps) {
  return (
    <button type="button" aria-pressed={!!selected} onClick={onClick} className={cx('k-chip', className)} style={style}>
      {children}
    </button>
  );
}
/** Horizontal chip row, gap 8, scrolls sideways edge to edge. wrap = wrapping row. */
export function ChipRow({ children, wrap, label, className, style }: Base & { children: ReactNode; wrap?: boolean; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cx('k-chips', wrap && 'k-chips--wrap', className)} style={style}>
      {children}
    </div>
  );
}

export interface ChoiceChipProps extends ChipProps {
  /** Fill the row equally (flex 1, F4 time slots). */
  fill?: boolean;
  /** 48 high, 16/600 (L2 weekdays, D9 rating). */
  tall?: boolean;
  /** Use role="radio" + aria-checked instead of aria-pressed (inside a radiogroup). */
  radio?: boolean;
}
/** Choice inside forms: radius 8, h44, 1.5px line; selected = warm fill. T5 "איפה/על מי/מתי", B1, S5. */
export function ChoiceChip({ selected, onClick, children, fill, tall, radio, className, style }: ChoiceChipProps) {
  const a11y = radio ? { role: 'radio', 'aria-checked': !!selected } : { 'aria-pressed': !!selected };
  return (
    <button type="button" {...a11y} onClick={onClick} className={cx('k-choice', fill && 'k-choice--fill', tall && 'k-choice--tall', className)} style={style}>
      {children}
    </button>
  );
}

export interface Option<T extends string> { value: T; label: ReactNode; disabled?: boolean }

export interface ChoiceGroupProps<T extends string> extends Base {
  /** Soft 14/600 caption above the chips ("איפה"). */
  label?: ReactNode;
  options: Option<T>[];
  value: T | T[] | null | undefined;
  onChange: (value: T) => void;
  fill?: boolean;
  tall?: boolean;
}
/** Label + wrapping ChoiceChips (single or multi: pass an array value and toggle in onChange). T5, B1, C11. */
export function ChoiceGroup<T extends string>({ label, options, value, onChange, fill, tall, className, style }: ChoiceGroupProps<T>) {
  const id = useId();
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div className={cx('k-group', className)} style={style}>
      {label !== undefined && <span className="k-group__label" id={id}>{label}</span>}
      <div className="k-chips k-chips--wrap" role="group" aria-labelledby={label !== undefined ? id : undefined} style={fill ? { flexWrap: 'nowrap' } : undefined}>
        {options.map((o) => (
          <ChoiceChip key={o.value} selected={isOn(o.value)} onClick={() => onChange(o.value)} fill={fill} tall={tall}>
            {o.label}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}

export interface AddChipProps extends Base {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  icon?: IconName | null;
}
/** Dashed suggestion chip with a plus: radius 8, h44, 15/500. S1 "ביצים / לחם". */
export function AddChip({ onClick, children, icon = 'plus', className, style }: AddChipProps) {
  return (
    <button type="button" onClick={onClick} className={cx('k-addchip', className)} style={style}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export interface SegmentedProps<T extends string> extends Base {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group ("תצוגה"). */
  label: string;
  /** pressed: role=group + aria-pressed (T1, T5). radio: radiogroup + role=radio (Z3). tabs: tablist + role=tab, 14px (M4 event tabs). */
  mode?: 'pressed' | 'radio' | 'tabs';
  /** md: 40 high, 15/600. lg: 48 high, 16/600 (T5 "משימה / קנייה"). */
  size?: 'md' | 'lg';
}
/** White track with 4px padding; selected segment warm. */
export function Segmented<T extends string>({ options, value, onChange, label, mode = 'pressed', size = 'md', className, style }: SegmentedProps<T>) {
  const role = mode === 'radio' ? 'radiogroup' : mode === 'tabs' ? 'tablist' : 'group';
  return (
    <div role={role} aria-label={label} className={cx('k-seg', size === 'lg' && 'k-seg--lg', mode === 'tabs' && 'k-seg--tabs', className)} style={style}>
      {options.map((o) => {
        const on = o.value === value;
        const a11y =
          mode === 'radio' ? { role: 'radio', 'aria-checked': on } : mode === 'tabs' ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on };
        return (
          <button key={o.value} type="button" className="k-seg__btn" disabled={o.disabled} onClick={() => onChange(o.value)} {...a11y}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabsProps<T extends string> extends Base {
  options: Array<Option<T> & { count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}
/** Underlined tabs (h46, selected = 3px ink underline, bold). S1 list tabs "סופר 4 · בניין 2 ...". */
export function Tabs<T extends string>({ options, value, onChange, label, className, style }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cx('k-tabs', className)} style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className="k-tabs__tab" onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <> <span className="k-num">{o.count}</span></>}
        </button>
      ))}
    </div>
  );
}

export interface ToggleProps extends Base {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (usually the row title). */
  label: string;
  disabled?: boolean;
}
/** Switch 52x32: on = pine, knob at the end; off = #B6BCC4. role="switch". N11, C11, D10. */
export function Toggle({ checked, onChange, label, disabled, className, style }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('k-toggle', className)}
      style={style}
    >
      <span className="k-toggle__knob" />
    </button>
  );
}

/* ═════════════ Checkbox, radio ═════════════ */

export interface CheckButtonProps extends Base {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name, e.g. "סימון בוצע: להחליף את הדגל" or "נקנה: חלב 3%". */
  label: string;
  /** md: 44 hit area with a 24 box (T1, S1). lg: 52 hit area with a 28 box (S6 trip). */
  size?: 'md' | 'lg';
  disabled?: boolean;
}
/** The row checkbox: 44px button, 24px box with 2px ink border; checked = warm fill with a white check. role="checkbox". */
export function CheckButton({ checked, onChange, label, size = 'md', disabled, className, style }: CheckButtonProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('k-checkbtn', size === 'lg' && 'k-checkbtn--lg', className)}
      style={style}
    >
      <CheckboxBox checked={checked} size={size} />
    </button>
  );
}

/** The bare 24/28 box, for custom compositions. */
export function CheckboxBox({ checked, size = 'md' }: { checked: boolean; size?: 'md' | 'lg' }) {
  return (
    <span className={cx('k-checkbox__box', checked && 'k-checkbox__box--on')} style={size === 'lg' ? { width: 28, height: 28 } : undefined} aria-hidden="true">
      {checked && <Icon name="check" size={size === 'lg' ? 18 : 16} />}
    </span>
  );
}

export interface CheckboxProps extends Base, Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style' | 'type' | 'size' | 'onChange'> {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: 'md' | 'lg';
}
/** Native checkbox + label (for forms), drawn with the same box. */
export function Checkbox({ label, checked, onChange, size = 'md', className, style, ...rest }: CheckboxProps) {
  return (
    <label className={cx('k-checkbox', size === 'lg' && 'k-checkbox--lg', className)} style={style}>
      <input type="checkbox" className="k-checkbox__input" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
      <CheckboxBox checked={checked} size={size} />
      <span className="k-checkbox__label">{label}</span>
    </label>
  );
}

/** The 24px radio circle (2px #8A9099; on = warm ring with a 12px dot). Decorative; RadioRow carries the role. */
export function RadioMark({ checked }: { checked: boolean }) {
  return <span className={cx('k-radio', checked && 'k-radio--on')} aria-hidden="true" />;
}

export interface RadioRowProps extends Base {
  checked: boolean;
  onSelect: () => void;
  title: ReactNode;
  meta?: ReactNode;
  /** Avatar or icon before the text. */
  leading?: ReactNode;
  /** 50 high instead of 58 (Z3). */
  compact?: boolean;
  disabled?: boolean;
}
/** Full-width radio row (role="radio"), radio circle at the end. A1, C4, Z1, Z3. Put inside <RadioList>. */
export function RadioRow({ checked, onSelect, title, meta, leading, compact, disabled, className, style }: RadioRowProps) {
  return (
    <li className="k-radioitem">
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className={cx('k-radiorow', compact && 'k-radiorow--compact', className)}
        style={style}
      >
        {leading}
        <span className="k-radiorow__body">
          <span className="k-radiorow__title">{title}</span>
          {meta !== undefined && <span className="k-row__meta">{meta}</span>}
        </span>
        <RadioMark checked={checked} />
      </button>
    </li>
  );
}
/** Card with role="radiogroup" holding RadioRows. */
export function RadioList({ label, children, className, style }: Base & { label: string; children: ReactNode }) {
  return (
    <section role="radiogroup" aria-label={label} className={cx('k-card k-card--list', className)} style={style}>
      <ul className="k-list k-list--flush">{children}</ul>
    </section>
  );
}

/* ═════════════ Tags, avatars, dots ═════════════ */

export type TagTone = 'urgent' | 'paid' | 'waiting' | 'neutral' | 'warm' | 'outline' | 'onhero';
/** 13/600 radius 4: urgent red ("דחוף"), paid green ("שולם", "נכנס"), waiting amber ("200 ₪", "ישלם אחר כך"),
    neutral bg ("טיוטה"), warm ("בעלים", "בעוד 9 ימים"), outline ("שלך"), onhero (white on a hero, D3). */
export function Tag({ tone = 'neutral', children, className, style }: Base & { tone?: TagTone; children: ReactNode }) {
  return <span className={cx('k-tag', tone !== 'neutral' && `k-tag--${tone}`, className)} style={style}>{children}</span>;
}

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
/** Two initials from a name: "יואב פרץ" -> "יפ", "בני גוטמן" -> "בג", "רז" -> "רז". Final letters become regular forms. */
export function initials(name: string): string {
  const words = name.trim().replace(/[()"'״׳]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = (w: string) => { const c = Array.from(w)[0] ?? ''; return FINALS[c] ?? c; };
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).map((c, i) => (i === 0 ? FINALS[c] ?? c : c)).join('');
  return first(words[0]) + first(words[words.length - 1]);
}

export interface AvatarProps extends Base, Target {
  /** Full name: initials are derived with initials(). */
  name?: string;
  /** Explicit initials (overrides name). */
  initials?: string;
  /** 28, 32 (default), 36, 44, 48, 56 or 64. */
  size?: 28 | 32 | 36 | 40 | 44 | 48 | 56 | 64;
  /** default bg circle; me = warm fill white text; ondark = translucent white on a hero; onhero-me = white fill warm text; outline = white with line (header). */
  tone?: 'default' | 'me' | 'ondark' | 'onhero-me' | 'outline';
  src?: string;
  /** Accessible name when it is a link; otherwise the avatar is decorative. */
  label?: string;
}
/** Initials circle. Font 13/600 up to 56, 15 at 44 outline, 16 at 48, 20 at 64. */
export function Avatar({ name, initials: ini, size = 32, tone = 'default', src, label, href, onClick, className, style }: AvatarProps) {
  const text = ini ?? (name ? initials(name) : '');
  const fontSize = size === 64 ? 20 : size === 48 ? 16 : tone === 'outline' && size === 44 ? 15 : 13;
  const cls = cx('k-avatar', tone !== 'default' && `k-avatar--${tone}`, className);
  const st: CSSProperties = { width: size, height: size, fontSize, ...style };
  const content = src ? <img className="k-avatar__img" src={src} alt="" /> : text;
  if (href !== undefined || onClick !== undefined) {
    return <Press href={href} onClick={onClick} className={cls} style={st} label={label ?? name}>{content}</Press>;
  }
  return <span className={cls} style={st} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>{content}</span>;
}

/** Overlapping avatars with a 2px white ring, -8px overlap (P1). onHero = warm ring (P3). */
export function AvatarStack({ children, onHero, label, className, style }: Base & { children: ReactNode; onHero?: boolean; label?: string }) {
  return (
    <span className={cx('k-avatars', onHero && 'k-avatars--onhero', className)} style={style} role={label ? 'img' : undefined} aria-label={label}>
      {Children.map(children, (c) => <span className="k-avatars__item">{c}</span>)}
    </span>
  );
}

/** Small status dot: red (default, unread), green, amber, pine. 10px or 8px (sm). */
export function Dot({ tone = 'red', size = 'md', label, className, style }: Base & { tone?: 'red' | 'green' | 'amber' | 'pine'; size?: 'md' | 'sm'; label?: string }) {
  return (
    <span
      className={cx('k-dot', size === 'sm' && 'k-dot--sm', tone !== 'red' && `k-dot--${tone}`, className)}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Dot + 14/600 text with role="status", e.g. the "חי · 17:20" live marker in Y1. */
export function LiveStatus({ children, tone = 'green', className, style }: Base & { children: ReactNode; tone?: 'green' | 'amber' | 'red' }) {
  return (
    <span role="status" className={cx('k-live', className)} style={style}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

/* ═════════════ Fields ═════════════ */

type FieldOwn = {
  label: ReactNode;
  /** Keep the label for screen readers only. */
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** dir="ltr", right-aligned: phones, hours, amounts, e-mail. */
  ltr?: boolean;
  /** sm: 44 high, padding 12, 500 weight (G1 inline rows). */
  size?: 'md' | 'sm';
  /** 18/500 tabular numerals (F4 hours). */
  numeric?: boolean;
  center?: boolean;
  /** Grow inside a FieldRow (flex 1). */
  grow?: boolean;
  inputClassName?: string;
  inputStyle?: CSSProperties;
};
export type FieldProps = FieldOwn & Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style' | 'size'>;

/** Label 14/600 soft above a 48px input (1.5px line, radius 8, padding 14, 16px). N11, C13, C9, F4. */
export function Field({ label, labelHidden, hint, error, ltr, size = 'md', numeric, center, grow, inputClassName, inputStyle, className, style, id, type = 'text', ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? `f-${auto}`;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className={cx('k-field', grow && 'k-field--grow', className)} style={style}>
      <label htmlFor={fid} className={labelHidden ? 'k-sr' : 'k-field__label'}>{label}</label>
      <input
        id={fid}
        type={type}
        dir={ltr ? 'ltr' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hintId, errId) || undefined}
        className={cx('k-input', size === 'sm' && 'k-input--sm', numeric && 'k-input--num', center && 'k-input--center', inputClassName)}
        style={inputStyle}
        {...rest}
      />
      {hint && <span id={hintId} className="k-field__hint">{hint}</span>}
      {error && <span id={errId} className="k-field__error" role="alert">{error}</span>}
    </div>
  );
}

export type TextAreaFieldProps = Omit<FieldOwn, 'size' | 'numeric' | 'center' | 'ltr'> & Base &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style'> & { height?: number };
/** Label + textarea (1.5px line, radius 8, padding 12 14, 84 high by default; D9 uses 76). D2, D9. */
export function TextAreaField({ label, labelHidden, hint, error, grow, inputClassName, inputStyle, height, className, style, id, ...rest }: TextAreaFieldProps) {
  const auto = useId();
  const fid = id ?? `t-${auto}`;
  const hintId = hint ? `${fid}-hint` : undefined;
  return (
    <div className={cx('k-field', grow && 'k-field--grow', className)} style={style}>
      <label htmlFor={fid} className={labelHidden ? 'k-sr' : 'k-field__label'}>{label}</label>
      <textarea
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        className={cx('k-textarea', inputClassName)}
        style={height ? { height, ...inputStyle } : inputStyle}
        {...rest}
      />
      {hint && <span id={hintId} className="k-field__hint">{hint}</span>}
      {error && <span className="k-field__error" role="alert">{error}</span>}
    </div>
  );
}

/** Side-by-side fields, gap 10 (N11 "משעה / עד שעה"). end = gap 16 aligned to the bottom (field + stepper). */
export function FieldRow({ children, end, className, style }: Base & { children: ReactNode; end?: boolean }) {
  return <div className={cx('k-fieldrow', end && 'k-fieldrow--end', className)} style={style}>{children}</div>;
}

export type BigTextInputProps = Base & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style'> & {
  /** Screen-reader label ("מה צריך לעשות"). */
  label: string;
  /** lg: 104 high, 18px (B1 compose). */
  size?: 'md' | 'lg';
};
/** The big text box at the top of add forms: 84 high, 2px pine border, 20/500. T5, S5, B1. */
export function BigTextInput({ label, size = 'md', className, style, id, rows = 2, ...rest }: BigTextInputProps) {
  const auto = useId();
  const fid = id ?? `b-${auto}`;
  return (
    <div className="k-field" style={{ gap: 0 }}>
      <label htmlFor={fid} className="k-sr">{label}</label>
      <textarea id={fid} rows={rows} className={cx('k-bigtext', size === 'lg' && 'k-bigtext--lg', className)} style={style} {...rest} />
    </div>
  );
}

export type SearchFieldProps = Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style' | 'size' | 'type'> & {
  /** Screen-reader label; also the default placeholder. */
  label: string;
  /** Draw the ink border as if focused (C2 shows the active search). */
  active?: boolean;
  /** sm: 16px text (T6, S8). */
  size?: 'md' | 'sm';
};
/** Search box 52 high: soft magnifier, 17px input; 1.5px line, ink when focused. C2, C4, M5, E6. */
export function SearchField({ label, active, size = 'md', className, style, id, placeholder, ...rest }: SearchFieldProps) {
  const auto = useId();
  const fid = id ?? `s-${auto}`;
  return (
    <div className={cx('k-search', active && 'k-search--active', size === 'sm' && 'k-search--sm', className)} style={style}>
      <span className="k-search__icon" aria-hidden="true"><Icon name="search" size={20} /></span>
      <label htmlFor={fid} className="k-sr">{label}</label>
      <input id={fid} type="search" className="k-search__input" placeholder={placeholder ?? label} {...rest} />
    </div>
  );
}

export interface StepperProps extends Base {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** md 44 buttons, gap 4 (S4); lg 48 buttons, gap 6, shows the value between (N11). */
  size?: 'md' | 'lg';
  /** Show the number between the buttons (default true for lg). */
  showValue?: boolean;
  decLabel?: string;
  incLabel?: string;
}
/** Quantity minus/plus pair. */
export function Stepper({ value, onChange, min = 0, max = Infinity, step = 1, size = 'md', showValue, decLabel = 'פחות', incLabel = 'יותר', className, style }: StepperProps) {
  const show = showValue ?? size === 'lg';
  return (
    <div className={cx('k-stepper', size === 'lg' && 'k-stepper--lg', className)} style={style}>
      <button type="button" className="k-stepper__btn" aria-label={decLabel} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      {show && <b className="k-stepper__value" aria-live="polite">{value}</b>}
      <button type="button" className="k-stepper__btn" aria-label={incLabel} disabled={value + step > max} onClick={() => onChange(Math.min(max, value + step))}>
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}

/* ═════════════ Strips, toasts, sheet ═════════════ */

export interface ToastAction { label: string; onClick: () => void }
export interface ToastProps extends Base {
  /** info: dark warm, role="status", underlined actions ("צילום", "ביטול") (T4). alert: red, role="alert", "הבנתי" (X1). */
  tone?: 'info' | 'alert';
  icon?: IconName | null;
  /** Message. For alert, start with <b>לא נשמר.</b> as in X1. */
  children: ReactNode;
  actions?: ToastAction[];
}
/** Toast pinned above the capture bar: put it first in Screen `bottom`. Spacing to the bar below is automatic. T4, X1. */
export function Toast({ tone = 'info', icon, children, actions = [], className, style }: ToastProps) {
  const alert = tone === 'alert';
  const ic = icon === undefined ? (alert ? null : 'check') : icon;
  return (
    <div role={alert ? 'alert' : 'status'} className={cx('k-toast', alert && 'k-toast--alert', className)} style={style}>
      <span className="k-toast__text">
        {ic && <Icon name={ic} size={18} />}
        {alert ? <span>{children}</span> : children}
      </span>
      {actions.map((a) => (
        <button key={a.label} type="button" className="k-toast__action" onClick={a.onClick}>{a.label}</button>
      ))}
    </div>
  );
}

export interface StripProps extends Base {
  /** ink (C8 offline, default), warm, red, amber, green. */
  tone?: 'ink' | 'warm' | 'red' | 'amber' | 'green';
  icon?: IconName;
  children: ReactNode;
  action?: ToastAction;
  /** status (default) or alert. */
  role?: 'status' | 'alert';
}
/** Full-width strip at the top of the screen: padding 10 16, 15/600, icon 20. C8 "אין קליטה. 3 פעולות שמורות בטלפון". */
export function Strip({ tone = 'ink', icon, children, action, role = 'status', className, style }: StripProps) {
  return (
    <div role={role} className={cx('k-strip', tone !== 'ink' && `k-strip--${tone}`, className)} style={style}>
      {icon && <Icon name={icon} size={20} />}
      <span className="k-strip__text">{children}</span>
      {action && <button type="button" className="k-strip__action" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export interface DemoStripProps extends Base {
  /** The demo persona's role, bold: "מתנדב", "בעלים", "בעל דוכן". */
  roleName: string;
  /** Day scenario: "יום רגיל", "יום אירוע", "אחרי אירוע". */
  day: string;
  onSwitch?: () => void;
  onExit?: () => void;
  /** aria-expanded on the switch button while the sheet is open. */
  expanded?: boolean;
  label?: string;
  exitLabel?: string;
}
/** 28px warm demo strip (pure presentation). Start: "נתוני דמו · מחובר כ<b>role</b> · day" + chevron opens the switch sheet. End: "יציאה". Z2-Z5. */
export function DemoStrip({ roleName, day, onSwitch, onExit, expanded, label = 'נתוני דמו', exitLabel = 'יציאה', className, style }: DemoStripProps) {
  return (
    <div role="status" aria-label="מצב הדגמה" className={cx('k-demo', className)} style={style}>
      <button type="button" aria-haspopup="dialog" aria-expanded={expanded} className="k-demo__switch" onClick={onSwitch}>
        <b>{label}</b>
        <span className="k-demo__dim">· מחובר כ<b>{roleName}</b> · {day}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      <button type="button" className="k-demo__exit" onClick={onExit}>
        <span>{exitLabel}</span>
        <Icon name="exit" size={15} />
      </button>
    </div>
  );
}

export interface SheetProps extends Base {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Soft text at the end of the title row ("נתונים לא אמיתיים"). */
  aside?: ReactNode;
  /** One soft 15px line under the title (Q8 "180 ₪ · מיכל ברק. ...", Q11 "לא ענה · הוזמן ב־10.11"). */
  sub?: ReactNode;
  children?: ReactNode;
  /** Position inside the nearest positioned ancestor instead of the viewport (gallery, previews). */
  contained?: boolean;
}
/** Bottom sheet: backdrop rgba(20,23,27,.45), bg panel, radius 16 top, grabber 40x4, title 20/700. Escape and backdrop close it. Z3. */
export function Sheet({ open, onClose, title, aside, sub, children, contained, className, style }: SheetProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!contained) prev?.focus?.();
    };
  }, [open, onClose, contained]);
  if (!open) return null;
  return (
    <div className={cx('v2 k-sheet', contained && 'k-sheet--contained')} dir="rtl">
      <button type="button" className="k-sheet__backdrop" aria-label="סגירה" tabIndex={-1} onClick={onClose} />
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('k-sheet__panel', className)} style={style}>
        <span className="k-sheet__grab" aria-hidden="true" />
        <div className={cx('k-sheet__head', sub !== undefined && 'k-sheet__head--sub')}>
          <h2 id={titleId} className="k-sheet__title">{title}</h2>
          {aside !== undefined && <span className="k-sheet__aside">{aside}</span>}
          {sub !== undefined && <span className="k-sheet__sub">{sub}</span>}
        </div>
        {children}
      </section>
    </div>
  );
}

export interface ConfirmSheetProps extends Base {
  open: boolean;
  onClose: () => void;
  /** The question: "למחוק את התרומה?" */
  title: ReactNode;
  /** One line: what is deleted, and that it is logged and cannot be undone ("180 ₪ · מיכל ברק. המחיקה נרשמת בפעילות, ואי אפשר לבטל אותה."). */
  text?: ReactNode;
  /** The red button. Default "מחיקה" ("הסרה" for taking something off a list). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Runs once per press; both buttons wait while it runs. */
  onConfirm: () => unknown;
}
/** Q8, the one delete confirmation: the question, one soft line, a red filled "מחיקה" with a bin and an outlined "ביטול". */
export function ConfirmSheet({ open, onClose, title, text, confirmLabel = 'מחיקה', cancelLabel = 'ביטול', onConfirm, className, style }: ConfirmSheetProps) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setBusy(false); }, [open]);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title} sub={text} className={cx('k-confirm', className)} style={style}>
      <div className="k-confirm__actions">
        <button type="button" className="k-confirm__go" disabled={busy} onClick={go}><Icon name="trash" size={20} />{confirmLabel}</button>
        <button type="button" className="k-confirm__cancel" disabled={busy} onClick={onClose}>{cancelLabel}</button>
      </div>
    </Sheet>
  );
}

/* ═════════════ Progress and numbers ═════════════ */

export interface ProgressSegmentsProps extends Base {
  total: number;
  done: number;
  /** ink segments, gap 4 (T1 "3 מתוך 5 שלך בוצעו"); warm segments, gap 3 (P1 project steps). */
  tone?: 'ink' | 'warm';
  /** 14/500 caption under the segments; also the default aria-label. */
  caption?: ReactNode;
  label?: string;
}
/** Segmented progress (8px segments, radius 2), role="img". T1, L5, P1. */
export function ProgressSegments({ total, done, tone = 'ink', caption, label, className, style }: ProgressSegmentsProps) {
  const aria = label ?? (typeof caption === 'string' ? caption : `${done} מתוך ${total}`);
  const segs = (
    <span className="k-progress__segs">
      {Array.from({ length: total }, (_, i) => <span key={i} className={cx('k-progress__seg', i < done && 'k-progress__seg--on')} />)}
    </span>
  );
  if (caption === undefined) {
    return <span role="img" aria-label={aria} className={cx('k-progress', tone === 'warm' && 'k-progress--warm', className)} style={style}>{segs}</span>;
  }
  return (
    <div role="img" aria-label={aria} className={cx('k-progress', tone === 'warm' && 'k-progress--warm', className)} style={style}>
      {segs}
      <span className="k-progress__caption">{caption}</span>
    </div>
  );
}

export interface BarProps extends Base {
  /** 0..1 */
  value: number;
  /** default: 6px warm on bg (B2 read bar). hero: 8px white on translucent (Y1, M6). chart: 10px, flex 1 (M7 rows). */
  tone?: 'default' | 'hero' | 'chart';
  label?: string;
}
/** Horizontal progress bar, role="img". */
export function Bar({ value, tone = 'default', label, className, style }: BarProps) {
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  return (
    <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cx('k-bar', tone !== 'default' && `k-bar--${tone}`, className)} style={style}>
      <span className="k-bar__fill" style={{ width: pct }} />
    </span>
  );
}

export interface BarListProps extends Base {
  items: Array<{ label: ReactNode; value: number }>;
  /** Value that fills the bar; default the largest value. */
  max?: number;
}
/** Ranked bars: label 96px, 10px bar, bold tabular value. Put inside a Card with a SectionHeader. M7, C7, M10. */
export function BarList({ items, max, className, style }: BarListProps) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cx('k-barlist', className)} style={style}>
      {items.map((it, i) => (
        <li key={i} className="k-barrow">
          <span className="k-barrow__label">{it.label}</span>
          <Bar tone="chart" value={it.value / top} />
          <b className="k-barrow__value">{it.value}</b>
        </li>
      ))}
    </ul>
  );
}

export interface StatTileProps extends Base {
  value: ReactNode;
  label: ReactNode;
  /** 21px value for long amounts ("1,240 ₪"), M6. */
  small?: boolean;
}
/** White tile: number 26/700 tabular + 14 soft label. M5, M6, M7, C12, Y4. Put several in <StatRow>. */
export function StatTile({ value, label, small, className, style }: StatTileProps) {
  return (
    <div className={cx('k-stat', className)} style={style}>
      <b className={cx('k-stat__value', small && 'k-stat__value--sm')}>{value}</b>
      <span className="k-stat__label">{label}</span>
    </div>
  );
}
/** Row of stat tiles, gap 8; grid = two columns (M7). */
export function StatRow({ children, grid, className, style }: Base & { children: ReactNode; grid?: boolean }) {
  return <div className={cx('k-stats', grid && 'k-stats--grid', className)} style={style}>{children}</div>;
}

/* ═════════════ Empty states ═════════════ */

export interface EmptyStateProps extends Base {
  /** fill: centred in the remaining space, 40px icon #8A9099 (S3). card: inside a white card (D10). done: warm 72 circle with a check (L5).
      blocked: 88 white ring with a red icon (X2). */
  variant?: 'fill' | 'card' | 'done' | 'blocked';
  icon?: IconName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}
export function EmptyState({ variant = 'fill', icon, title, text, action, className, style }: EmptyStateProps) {
  const ic =
    variant === 'done' ? (
      <span className="k-empty__badge" aria-hidden="true"><Icon name={icon ?? 'check'} size={38} /></span>
    ) : variant === 'blocked' ? (
      <span className="k-empty__ring" aria-hidden="true"><Icon name={icon ?? 'blocked'} size={44} /></span>
    ) : icon ? (
      <span className="k-empty__icon" aria-hidden="true"><Icon name={icon} size={40} /></span>
    ) : null;
  const Tag = variant === 'card' ? 'section' : 'div';
  return (
    <Tag className={cx('k-empty', `k-empty--${variant === 'blocked' ? 'done' : variant}`, className)} style={style}>
      {ic}
      <b className="k-empty__title">{title}</b>
      {text !== undefined && <span className="k-empty__text">{text}</span>}
      {action}
    </Tag>
  );
}

/* ═════════════ Gate ═════════════ */

export interface GateButtonProps extends Base {
  /** solid: white with the screen colour as text, h72 24/700 (E3 "הבא", E5). dark: ink fill h76 (E4 "שולם, להכניס").
      outline: 2px current colour h58 18/700. link: underlined text h48. light: bg fill h68 20/700 (E2 search). */
  variant?: 'solid' | 'dark' | 'outline' | 'link' | 'light';
  icon?: IconName;
  iconSize?: number;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}
export function GateButton({ variant = 'solid', icon, iconSize, onClick, children, className, style }: GateButtonProps) {
  return (
    <button type="button" onClick={onClick} className={cx('k-gatebtn', `k-gatebtn--${variant}`, className)} style={style}>
      {icon && <Icon name={icon} size={iconSize ?? (variant === 'dark' ? 28 : 24)} />}
      {children}
    </button>
  );
}

export interface GateResultProps extends Base {
  /** ok green (E3), pay amber (E4), bad red (E5). */
  tone: 'ok' | 'pay' | 'bad';
  /** Header text, 15/600: "שער · פסטיבל הסתיו". */
  place: ReactNode;
  headerEnd?: ReactNode;
  /** White 104 circle with a 64 icon at stroke 3; default check for ok, close for bad, none for pay. null hides it. */
  mark?: IconName | null;
  /** Line above the amount, 28/700 ("נשאר לשלם", E4). */
  prelude?: ReactNode;
  /** Huge word: 76/700 ("מאושר"); size md = 60 ("כרטיס בוטל"). */
  headline?: ReactNode;
  headlineSize?: 'lg' | 'md';
  /** Huge tabular amount 108/700 ("50 ₪", E4) instead of a mark. */
  amount?: ReactNode;
  /** Guest name 32/600. */
  name?: ReactNode;
  /** 19px detail ("כרטיס 2 מתוך 3 · כניסה ראשונה"). */
  detail?: ReactNode;
  /** 17/600 line with a 2px top rule (payment methods, E4). */
  extra?: ReactNode;
  /** GateButtons, stacked with gap 10. */
  actions?: ReactNode;
  /** Centered 16px note under the actions ("חוזר לסריקה בעוד 3 שניות"). */
  note?: ReactNode;
  children?: ReactNode;
}
/** Full-bleed gate result screen. Wrap nothing around it: it is its own page (min-height 100dvh). E3, E4, E5. */
export function GateResult({ tone, place, headerEnd, mark, prelude, headline, headlineSize = 'lg', amount, name, detail, extra, actions, note, children, className, style }: GateResultProps) {
  const m = mark === undefined ? (tone === 'ok' ? 'check' : tone === 'bad' ? 'close' : null) : mark;
  return (
    <div className={cx('v2 k-gate', `k-gate--${tone}`, className)} dir="rtl" style={style}>
      <header className="k-gate__head">
        <span className="k-gate__place">{place}</span>
        {headerEnd}
      </header>
      <main className="k-gate__main" role={tone === 'ok' ? 'status' : 'alert'} style={tone === 'pay' ? { gap: 4 } : undefined}>
        {m && <span className="k-gate__mark"><Icon name={m} size={tone === 'bad' ? 60 : 64} strokeWidth={3} /></span>}
        {prelude !== undefined && <span className="k-gate__prelude">{prelude}</span>}
        {amount !== undefined && <span className="k-gate__amount">{amount}</span>}
        {headline !== undefined && <span className={cx('k-gate__headline', headlineSize === 'md' && 'k-gate__headline--md')}>{headline}</span>}
        {name !== undefined && <span className="k-gate__name">{name}</span>}
        {detail !== undefined && <span className="k-gate__detail">{detail}</span>}
        {extra !== undefined && <span className="k-gate__extra">{extra}</span>}
        {children}
      </main>
      {(actions || note) && (
        <div className="k-gate__actions">
          {actions}
          {note !== undefined && <span className="k-gate__note">{note}</span>}
        </div>
      )}
    </div>
  );
}

export interface GateCameraProps extends Base {
  place: ReactNode;
  onExit?: () => void;
  exitLabel?: string;
  /** Hint inside the frame; "\n" breaks the line. Hidden when children (the video) are given unless showHint. */
  hint?: string;
  showHint?: boolean;
  /** The live camera <video> (absolutely filled, object-fit cover) or a canvas. */
  children?: ReactNode;
  /** Previous scan line: check icon colour by tone. */
  lastScan?: { text: ReactNode; time?: ReactNode; tone?: 'ok' | 'pay' | 'bad' };
  searchLabel?: string;
  onSearch?: () => void;
}
/** Dark gate camera shell (#0E1114): header with exit, viewfinder with corner brackets, last scan, big search button. E2. */
export function GateCamera({ place, onExit, exitLabel = 'יציאה מהשער', hint = 'תצוגת מצלמה\nברקוד בתוך הריבוע', showHint, children, lastScan, searchLabel = 'חיפוש בשם או טלפון', onSearch, className, style }: GateCameraProps) {
  return (
    <div className={cx('v2 k-gate k-gate--camera', className)} dir="rtl" style={style}>
      <header className="k-gate__head">
        <span className="k-gate__place">{place}</span>
        {onExit && <button type="button" className="k-gate__exit" onClick={onExit}>{exitLabel}</button>}
      </header>
      <div className="k-gate__cambody">
        <div className="k-viewfinder" role="img" aria-label="תצוגת המצלמה">
          {children}
          <div className="k-viewfinder__frame">
            <span className="k-viewfinder__corner k-viewfinder__corner--ts" />
            <span className="k-viewfinder__corner k-viewfinder__corner--te" />
            <span className="k-viewfinder__corner k-viewfinder__corner--bs" />
            <span className="k-viewfinder__corner k-viewfinder__corner--be" />
            {(showHint || !children) && <span className="k-viewfinder__hint">{hint}</span>}
          </div>
        </div>
        {lastScan && (
          <div className="k-lastscan" role="status">
            <span className={cx('k-lastscan__icon', lastScan.tone === 'bad' && 'k-lastscan__icon--bad', lastScan.tone === 'pay' && 'k-lastscan__icon--pay')}>
              <Icon name={lastScan.tone === 'bad' ? 'close' : 'check'} size={20} />
            </span>
            <span className="k-lastscan__text">{lastScan.text}</span>
            {lastScan.time !== undefined && <span className="k-lastscan__time">{lastScan.time}</span>}
          </div>
        )}
        {onSearch && <GateButton variant="light" icon="search" onClick={onSearch}>{searchLabel}</GateButton>}
      </div>
    </div>
  );
}
