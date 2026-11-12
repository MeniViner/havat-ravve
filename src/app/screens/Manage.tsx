// Manager home ("ניהול") and the queue of things waiting for a decision. Every item in the queue carries its own action:
// the manager decides here, without opening the record first. Also the small pieces the other management screens share.
import { useMemo, useState, type ReactNode } from 'react';
import type { AppNotification, FarmEvent, Visit, Donation, CalendarItem, Profile, Tab, Ticket } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, useToast, fmtDayLong, fmtWeekday, firstName, relTime, todayISO, money, inText, dateKey } from '../ui';
import { Head, Sect, Tabs, Btn, Empty, useSticky } from '../kit';
import { useHandledNotifications, handleNotification, handleNotificationsFor, decideVisit, setDonation, setTabStatus, setOrderPayment, useVisits, useDonations, useOpenTabs, useOpenTickets, downloadCsv } from '../data';

// ---------- shared by the management screens ----------
/** A row that leads somewhere: a title, one line of facts, an optional word or number at the end. */
export function Line({ to, title, meta, end, num, sel, keep, href }: { to?: string; title: ReactNode; meta?: ReactNode; end?: ReactNode; num?: boolean; sel?: boolean; keep?: boolean; href?: string }) {
  const body = <><span><span className="r-t">{title}</span>{meta && <span className="r-m">{meta}</span>}</span><span className={'r-e' + (num ? ' num' : '')}>{end}</span><Icon name="chev" /></>;
  const cls = 'rm-line' + (sel ? ' sel' : '');
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener">{body}</a>;
  return <A className={cls} to={to || '/'} keep={keep}>{body}</A>;
}
export const St = ({ tone, children }: { tone?: 'rust' | 'ok' | 'gold' | 'soft'; children: ReactNode }) => <span className={'rm-st ' + (tone || '')}>{children}</span>;
export const Loading = () => <div className="r-empty">טוען…</div>;
/** Day of an ISO moment in Israel, and a full date with the year (exports and tables must not be ambiguous). */
export const dayOf = (iso: string) => dateKey(new Date(iso));
export const fullDate = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' }) : '');
/** Search that forgives dashes, spaces and letter case. */
export const norm = (s: string) => s.toLowerCase().replace(/[\s\-־.()]/g, '');
export const hit = (q: string, ...fields: (string | number | undefined | null)[]) => { const n = norm(q); return !n || fields.some((f) => norm(String(f ?? '')).includes(n)); };
/** Wraps a phone so Excel keeps the leading zero. */
export const asPhone = (v: string) => (v ? '\t' + v : '');
/** CSV for Excel: guest-typed text can never run as a formula. */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const safe = (v: string | number) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);
  downloadCsv(filename, headers, rows.map((r) => r.map(safe)));
}
/** Sorting for desktop tables, in Hebrew order. */
export function useSorted<T>(initial: string, dir: 'asc' | 'desc' = 'asc') {
  const [sort, setSort] = useState({ key: initial, dir });
  const toggle = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const apply = (rows: T[], get: (r: T, key: string) => string | number) => [...rows].sort((a, b) => { const x = get(a, sort.key), y = get(b, sort.key); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he'); return sort.dir === 'asc' ? c : -c; });
  return { sort, toggle, apply };
}
export const SortTh = ({ k, sort, onSort, children }: { k: string; sort: { key: string; dir: 'asc' | 'desc' }; onSort: (k: string) => void; children: ReactNode }) => (
  <th aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => onSort(k)}>{children}{sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
);
/** A table row that works without a mouse: Tab reaches it, Enter opens it. */
export const rowKeys = (open: () => void) => ({ tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && e.key === 'Enter') open(); } });
export const isPaid = (s: string) => s === 'paid' || s === 'paid_onsite';

// ---------- home ----------
type Props = { ctx: TeamCtx; inbox: AppNotification[]; events: FarmEvent[]; visits: Visit[]; donations: Donation[]; people: Profile[]; calendar: CalendarItem[]; templatesCount: number; placesCount: number; vendorsCount: number };
export function ManageHomeScreen({ ctx, inbox, events, visits, donations, people, calendar, templatesCount, placesCount, vendorsCount }: Props) {
  const today = todayISO(); const monthStart = today.slice(0, 8) + '01';
  const next = events.filter((e) => e.published && e.end >= new Date().toISOString()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const paidMonth = donations.filter((d) => dayOf(d.createdAt) >= monthStart && isPaid(d.paymentStatus)).reduce((s, d) => s + d.amount, 0);
  const pendingDon = donations.filter((d) => d.paymentStatus === 'claimed').length;
  const newVisits = visits.filter((v) => v.status === 'new').length;
  const team = people.filter((p) => p.role !== 'guest' && p.status === 'active').length;
  const todayCal = calendar.filter((c) => c.date === today);
  return (
    <>
      <Head over={fmtDayLong(today)} title="ניהול" end={<A className="r-textlink" to="/more">{firstName(ctx.profile.displayName)}</A>} />
      <Sect title="מחכה להחלטה שלך" n={inbox.length || undefined} more={inbox.length > 4 ? 'לכל התור' : 'מה שטופל'} to="/manage/inbox" />
      {inbox.length === 0 ? <Empty title="אין כלום שמחכה">בקשות ביקור, תרומות שהועברו וחשבונות דוכן יופיעו כאן.</Empty>
        : <Queue ctx={ctx} items={inbox.slice(0, 4)} all={inbox} visits={visits} donations={donations} />}
      <nav className="rm-areas" aria-label="תחומי הניהול" style={{ marginTop: 26 }}>
        <Line to="/manage/events" title="אירועים" meta={next ? `${next.title} · ${fmtWeekday(next.start)}, ${inText(next.start)}` : 'אין אירוע קרוב'} />
        <Line to="/events-staff" title="יום אירוע" meta="סריקה בשער ודוכן החווה" />
        <Line to="/manage/people" title="אנשים" meta={`${people.length} נרשמו · ${team} בצוות`} />
        <Line to="/manage/visits" title="ביקורים" meta={newVisits ? `${newVisits} בקשות חדשות` : 'אין בקשות חדשות'} end={newVisits ? <St tone="rust">{newVisits}</St> : undefined} />
        <Line to="/manage/donations" title="תרומות" meta={`${money(paidMonth)} החודש${pendingDon ? ` · ${pendingDon} מחכות לאישור` : ''}`} />
        <Line to="/manage/calendar" title="יומן" meta={todayCal.length ? `היום: ${todayCal.map((c) => `${c.title}${c.time ? ' ' + c.time : ''}`).join(', ')}` : 'היום אין כלום ביומן'} />
        <Line to="/manage/templates" title="משימות חוזרות" meta={`${templatesCount} פעילות`} />
        <Line to="/manage/places" title="מקומות בחווה" meta={`${placesCount} נקודות שמורות`} />
        <Line to="/manage/vendors" title="בעלי דוכנים" meta={`${vendorsCount} ברשימה`} />
        <Line to="/manage/reports" title="דוחות" meta="משימות, כסף, אנשים" />
        <Line to="/manage/activity" title="כל הפעילות" meta="מי עשה מה ומתי" />
        <Line to="/manage/settings" title="הגדרות" meta="תשלום, תרומות, שאלות, הודעות" />
        <Line href="/admin" title="עריכת האתר" meta="נפתח בחלון נפרד" />
      </nav>
    </>
  );
}

// ---------- queue ----------
type Sources = { visits: Visit[]; donations: Donation[]; tabs?: Tab[]; tickets?: Ticket[] };
/** What the manager can do about one item, right here. `null` action = nothing to decide, only to acknowledge. */
function useDecide(ctx: TeamCtx, all: AppNotification[], src: Sources) {
  const toast = useToast();
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  const reopen = (list: AppNotification[]) => list.forEach((n) => { handleNotification(n, ctx.actor, false).catch(fail); });
  return (n: AppNotification): { label: string; run: () => void; note?: string } | null => {
    if (n.type === 'visit') {
      const v = src.visits.find((x) => x.id === n.refId);
      if (!v || v.status !== 'new') return null;
      return {
        label: 'אישור ליומן', run: () => {
          const mine = all.filter((x) => x.refId === v.id);
          decideVisit(v, ctx.actor, 'approved', v.managerNote, '', all).then(() => toast({ text: `אושר ונכנס ליומן: ${v.name}`, actions: [{ label: 'ביטול', onClick: () => { decideVisit(v, ctx.actor, 'new', v.managerNote, '', mine).catch(fail); } }] }, 6000)).catch(fail);
        },
      };
    }
    if (n.type === 'donation' || n.type === 'receipt') {
      const d = src.donations.find((x) => x.id === n.refId);
      if (!d || d.paymentStatus === 'cancelled') return null;
      if (!isPaid(d.paymentStatus)) {
        if (n.type === 'receipt') return { label: '', run: () => {}, note: 'קודם מאשרים את התשלום, אחר כך שולחים קבלה' };
        const mine = all.filter((x) => x.refId === d.id && x.type !== 'receipt'); // the receipt request stays in the queue until the receipt is sent
        return { label: 'אישור תשלום', run: () => { setDonation(ctx.actor, d, { paymentStatus: 'paid' }).then(() => handleNotificationsFor(mine, d.id, ctx.actor)).then(() => toast({ text: `התשלום אושר: ${d.name}, ${money(d.amount)}`, actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { paymentStatus: d.paymentStatus }).catch(fail); reopen(mine); } }] }, 6000)).catch(fail); } };
      }
      if (n.type === 'receipt' && !d.receiptSent) return { label: 'הקבלה נשלחה', run: () => { setDonation(ctx.actor, d, { receiptSent: true }).then(() => handleNotification(n, ctx.actor)).then(() => toast({ text: `סומן: הקבלה נשלחה ל${d.receiptName || d.name}`, actions: [{ label: 'ביטול', onClick: () => { setDonation(ctx.actor, d, { receiptSent: false }).catch(fail); reopen([n]); } }] }, 6000)).catch(fail); } };
      return null;
    }
    if (n.type === 'tab') {
      const t = src.tabs?.find((x) => x.id === n.refId);
      if (!t) return null;
      const mine = all.filter((x) => x.refId === t.id);
      return { label: 'אישור תשלום', run: () => { setTabStatus(ctx.actor, t, 'paid').then(() => handleNotificationsFor(mine, t.id, ctx.actor)).then(() => toast({ text: `החשבון נסגר: ${t.guestName}, ${money(t.total)}`, actions: [{ label: 'ביטול', onClick: () => { setTabStatus(ctx.actor, t, t.status).catch(fail); reopen(mine); } }] }, 6000)).catch(fail); } };
    }
    if (n.type === 'claim') {
      const order = (src.tickets || []).filter((x) => x.orderId === n.refId && x.status === 'valid');
      if (!order.length) return null;
      const mine = all.filter((x) => x.refId === n.refId);
      const prev = order[0].paymentStatus;
      return { label: 'אישור תשלום', run: () => { setOrderPayment(ctx.actor, order, 'paid').then(() => handleNotificationsFor(mine, n.refId, ctx.actor)).then(() => toast({ text: `התשלום אושר: ${order[0].ownerName}, ${money(order.reduce((s, x) => s + x.price, 0))}`, actions: [{ label: 'ביטול', onClick: () => { setOrderPayment(ctx.actor, order, prev).catch(fail); reopen(mine); } }] }, 6000)).catch(fail); } };
    }
    return null;
  };
}
function Queue({ ctx, items, all, visits, donations }: { ctx: TeamCtx; items: AppNotification[]; all: AppNotification[]; visits: Visit[]; donations: Donation[] }) {
  const tabs = useOpenTabs(all.some((n) => n.type === 'tab')); const tickets = useOpenTickets(all.some((n) => n.type === 'claim'));
  const decide = useDecide(ctx, all, { visits, donations, tabs: tabs.items, tickets: tickets.items });
  const toast = useToast();
  const seen = (n: AppNotification) => { handleNotification(n, ctx.actor).then(() => toast({ text: 'ירד מהתור', actions: [{ label: 'ביטול', onClick: () => { handleNotification(n, ctx.actor, false).catch(() => {}); } }] }, 4000)).catch(() => toast({ text: 'לא נשמר', kind: 'error' })); };
  return (
    <div>
      {items.map((n) => {
        const act = decide(n);
        return (
          <div key={n.id} className="rm-q">
            <div><A to={n.link}><span className="r-t">{n.title}</span></A><span className="r-m">{n.text} · {relTime(n.createdAt)}</span>{act?.note && <span className="r-m">{act.note}</span>}</div>
            <div className="rm-do">
              {act && act.label && <Btn small onClick={act.run}>{act.label}</Btn>}
              <Btn small kind="ghost" to={n.link}>פרטים</Btn>
              {(!act || !act.label) && !act?.note && <Btn small kind="quiet" onClick={() => seen(n)}>ראיתי, להוריד</Btn>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type QTab = 'open' | 'visits' | 'money' | 'orders' | 'handled';
const inTab = (n: AppNotification, t: QTab) => t === 'open' || (t === 'visits' && n.type === 'visit') || (t === 'money' && ['donation', 'receipt', 'tab', 'claim'].includes(n.type)) || (t === 'orders' && (n.type === 'order' || n.type === 'join'));
export function InboxScreen({ ctx, inbox }: { ctx: TeamCtx; inbox: AppNotification[] }) {
  const desktop = useDesktop(); const toast = useToast();
  const [tab, setTab] = useSticky<QTab>('inbox-tab', 'open');
  const handled = useHandledNotifications(tab === 'handled');
  const visits = useVisits(true); const donations = useDonations(true);
  const list = useMemo(() => inbox.filter((n) => inTab(n, tab)), [inbox, tab]);
  const n = (t: QTab) => inbox.filter((x) => inTab(x, t)).length;
  // "recently handled" means by the time it was handled, not by the time the request arrived
  const done = useMemo(() => [...handled.items].sort((a, b) => (b.handledAt || '').localeCompare(a.handledAt || '')), [handled.items]);
  const back = (x: AppNotification) => { handleNotification(x, ctx.actor, false).then(() => toast({ text: 'חזר לתור' }, 2500)).catch(() => toast({ text: 'לא נשמר', kind: 'error' })); };
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="לטיפול" over={inbox.length ? `${inbox.length} מחכים להחלטה` : 'התור ריק'} />
      <Tabs label="מה להציג" value={tab} onChange={setTab} items={[{ id: 'open', label: 'הכל', n: n('open') }, { id: 'visits', label: 'ביקורים', n: n('visits') }, { id: 'money', label: 'כסף', n: n('money') }, { id: 'orders', label: 'הזמנות', n: n('orders') }, { id: 'handled', label: 'טופלו' }]} />
      {tab === 'handled' ? (
        handled.loading ? <Loading /> : done.length === 0 ? <Empty title="עוד לא טופל כלום" /> : <>
          <p className="rm-lead" style={{ paddingTop: 12 }}>100 האחרונים, לפי מתי טופלו.</p>
          {done.map((x) => <div key={x.id} className="rm-q handled"><div><A to={x.link}><span className="r-t">{x.title}</span></A><span className="r-m">{x.text} · טופל {relTime(x.handledAt)}{x.handledBy ? ` · ${firstName(x.handledBy.name)}` : ''}</span></div><Btn small kind="quiet" onClick={() => back(x)}>להחזיר לתור</Btn></div>)}
        </>
      ) : list.length === 0 ? <Empty title="אין כלום שמחכה">{tab === 'open' ? 'בקשות ביקור, תרומות שהועברו וחשבונות דוכן יופיעו כאן.' : 'בסוג הזה אין פריטים פתוחים.'}</Empty>
        : <Queue ctx={ctx} items={list} all={inbox} visits={visits.items} donations={donations.items} />}
    </>
  );
}
