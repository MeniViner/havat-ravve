import { eventMillis } from './logic';
// M4-M7: one event, four stages chosen by ?tab (הכנה / נרשמים / יום האירוע / סיכום). Opens on the stage that fits the time.
// Top bar, one control (rule 5): the outlined "עריכה" on הכנה and יום האירוע (details keep it); ⋯ on נרשמים (table view,
// export) and on סיכום (Q15: export, print, history). Delete is in ⋯ on the event form (rule 6).
// The summary (Q15) shows its headline numbers and three drill-ins (?tab=summary&part=sold|money|compare, rule 10).
import { useMemo, useRef, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useRemove, useToast, useExternal, waUrl, telUrl } from '../../core';
import {
  TopBar, Segmented, ListCard, Row, Tag, Button, StatRow, StatTile, SearchField, ChipRow, Chip, CheckButton, Hero, HeroNumber, Bar,
  TextLink, Card, BarList, Sheet, Field, Stepper, Toggle, EmptyState, MoreMenu, ActionSheet, type ActionItem,
} from '../../kit';
import {
  contactPhoneOk, useEvent, useEventTickets, useEventTabs, useEventVendors, useProducts, useNotifications, useDonations, restoreOrder, setOrderPayment,
  cancelOrder, fillTemplate, downloadCsv, handleNotificationsFor, useAllEvents,
} from '../../../data';
import { useLegacyTicketActivity, userNumber } from '../../data/manage';
import { nowIso, nowMs, useClockVersion } from '../../../clock';
import { gw } from '../../gender';
import { money, num, hhmm, firstName, ddmm, dayName, keyOf } from '../../format';
import { useEventTasks, useStaffing, useFiles, approveOrders, addGuestOrder, stampReminder, deleteOrder } from '../../data/events';
import {
  EVENT_TABS, defaultTab, eventSubtitle, detailsMeta, vendorsMeta, productsMeta, staffingStats, staffingMeta, stationsOf, ordersOf, guestStats,
  eventOrderPeople, filterOrders, ticketsWord, dayTiles, scanPart, shareLabel, eventSummary, topSold, debtsOf, debtTotals, debtBreakdown, fillDebtTemplate,
  isPaid, cancelledOrdersOf, scansFromTickets, summaryExtras, type EventTab, type GuestFilter, type Order,
} from './logic';
import { useTestTickets } from '../../data/eventTestTickets';
import { useApplications } from '../../data/vendorApplications';
import { ReminderAction } from './reminder';
import { EventShareActions } from './EventShareActions';
import { EventShoppingLink } from './shopping';
import { EventTestTickets } from '../events/testTickets';
import { OfflineStatus } from './offline';
import { EventProjects, PrepTaskCard } from './preparation';
import { personPath, registrationReport, RegistrantsReport, reportHeaders } from './registrants';
import { back } from '../../../router';
import { PayConfirmStatus } from './payconfirm';
import { tableCell, usePayConfirm, useTableView, type PayConfirmTarget } from '../../patterns';
import { useCounters, useScans, useCash, liveNumbers as liveOf } from '../../data/eventday';
import { Loading, Missing, TitleBlock, ButtonRow, backTo, link, useRun } from './shared';
import { DEFAULT_SETTINGS, PAYMENT_LABELS, type Profile, type AppNotification, type EventVendorV2, type FarmEvent, type Tab, type Ticket } from '../../../types';

export function EventScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="אירועים" parent="/manage/events" />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <EventBody ctx={ctx} e={e} tabParam={params.tab} part={params.part} />;
}

type Part = 'sold' | 'money' | 'compare';
const PARTS: Part[] = ['sold', 'money', 'compare'];

function EventBody({ ctx, e, tabParam, part }: { ctx: V2Ctx; e: FarmEvent; tabParam?: string; part?: string }) {
  const now = nowMs();
  const tab = (EVENT_TABS.some((t) => t.value === tabParam) ? tabParam : defaultTab(e, now, ctx.today)) as EventTab;
  const tickets = useEventTickets(e.id, ctx.manager);
  const tabs = useEventTabs(e.id, ctx.manager && tab === 'summary');
  const donations = useDonations(ctx.manager && tab === 'summary');
  const tests=useTestTickets(tab==='guests' ? e.id : '');
  const legacy = useLegacyTicketActivity(tab === 'guests' ? tickets.items : []);
  const peopleByOrder = useMemo(() => eventOrderPeople(e.id, tickets.items, legacy.items, ctx.peopleByUid), [e.id, tickets.items, legacy.items, ctx.peopleByUid]);
  const report = useMemo(() => registrationReport(e, tickets.items, peopleByOrder, ctx.settings.registrationFields, tests.items), [e, tickets.items, peopleByOrder, ctx.settings.registrationFields, tests.items]);
  const table = useTableView({ title: e.title, filename: e.title + ' - נרשמים.csv', headers: reportHeaders, rows: () => report.map((r) => r.values) });
  if (table.active) return <RegistrantsReport event={e} rows={report} full onBack={() => back('/manage/events/' + e.id + '?tab=guests')} />;
  if (tab === 'summary' && PARTS.includes(part as Part)) return <SummaryPart ctx={ctx} e={e} part={part as Part} />;
  const dayDonations = () => donations.items.filter((d) => keyOf(d.createdAt) === keyOf(e.start) && isPaid(d.paymentStatus)).reduce((s, d) => s + d.amount, 0);
  const summaryItems: ActionItem[] = [
    { label: 'ייצוא לאקסל', icon: 'download', onSelect: () => reportCsv(e, tickets.items, tabs.items, dayDonations()) },
    { label: 'הדפסה', icon: 'print', onSelect: () => window.print() },
    { label: 'היסטוריית שינויים', icon: 'clock', onSelect: () => go(`/manage/activity?event=${e.id}`) },
  ];
  const end = tab === 'guests' ? <MoreMenu title="נרשמים" items={table.items} />
    : tab === 'summary' ? <MoreMenu title={`סיכום · ${e.title}`} items={summaryItems} />
      : <Button variant="outline" icon="edit" iconSize={16} onClick={() => go(`/manage/events/${e.id}/edit`)}>עריכה</Button>;
  return (
    <AppScreen variant="detail" gap={tab === 'prep' ? 12 : 10}>
      <TopBar back={backTo('אירועים', '/manage/events')} end={end} />
      <TitleBlock over={eventSubtitle(e, now)} title={e.title} />
      <OfflineStatus ctx={ctx} eventId={e.id} />
      <Segmented mode="tabs" className="events-tabs" label="שלבי האירוע" options={EVENT_TABS} value={tab} onChange={(v) => go(`/manage/events/${e.id}?tab=${v}`, true)} />
      {tab === 'prep' && <Prep ctx={ctx} e={e} />}
      {tab === 'guests' && <><RegistrantsReport event={e} rows={report} /><Guests ctx={ctx} e={e} tickets={tickets.items} peopleByOrder={peopleByOrder} /><EventTestTickets ctx={ctx} eventId={e.id} /></>}
      {tab === 'day' && <Day ctx={ctx} e={e} />}
      {tab === 'summary' && <Summary ctx={ctx} e={e} tickets={tickets.items} tabs={tabs.items} donMoney={dayDonations()} />}
    </AppScreen>
  );
}

// ---------- M4 הכנה ----------
function Prep({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const open = useExternal();
  const applications = useApplications(e.id);
  const products = useProducts(e.id, ctx.manager && e.stall !== false);
  const staffing = useStaffing(e.id, ctx.manager);
  const files = useFiles(e.id, ctx.manager);
  const st = staffingStats(stationsOf(e, staffing.items), [], []);
  const fileNames = [...files.items.map((f) => f.name), ...(e.files || []).map((f) => f.name)];
  return (
    <>
      <ListCard><Row minHeight={58} title="בעלי דוכנים" meta={applications.items.filter((a)=>a.status==='requested').length + ' ביקשו · ' + applications.items.filter((a)=>a.status==='approved').length + ' אושרו'} {...link('/manage/events/' + e.id + '/vendors')} /></ListCard>
      <PrepTaskCard event={e} ctx={ctx} />
      <EventShoppingLink event={e} />
      <ListCard><Row minHeight={58} title="צוות" meta={staffingMeta(st)} {...link('/manage/events/' + e.id + '/staffing')} /></ListCard>
      <EventProjects event={e} ctx={ctx} />
      <ListCard>
        {e.stall !== false && <Row minHeight={58} title="מוצרי דוכן החווה" meta={productsMeta(products.items)} {...link('/manage/events/' + e.id + '/products')} />}
        <Row minHeight={58} title="מסמכים ואישורים" meta={fileNames.length ? fileNames.slice(0, 2).join(', ') : 'מסמכי האירוע לשיתוף בין מנהלי החווה'} {...link('/manage/events/' + e.id + '/files')} />
      </ListCard>
      <ButtonRow>
        <EventShareActions event={e} />
        <ReminderAction event={e} ctx={ctx} />
      </ButtonRow>
    </>
  );
}

// ---------- M5 נרשמים ----------
const STATUS_TAG: Record<Order['status'], { tone: 'waiting' | 'neutral' | 'paid'; text: string }> = {
  claimed: { tone: 'waiting', text: 'סימן שהעביר' }, pending: { tone: 'neutral', text: PAYMENT_LABELS.pending }, paid: { tone: 'paid', text: PAYMENT_LABELS.paid }, free: { tone: 'neutral', text: PAYMENT_LABELS.free },
};
/** "סימן שהעביר" / "סימנה שהעבירה" follows the guest (as Q4, Q6 and Q13 word it). */
const statusTag = (o: Order) => (o.status === 'claimed' ? { ...STATUS_TAG.claimed, text: gw(o.name, 'סימן שהעביר', 'סימנה שהעבירה') } : STATUS_TAG[o.status]);
const payTarget = (e: FarmEvent, o: Order): PayConfirmTarget => ({
  collection: 'tickets', ids: o.tickets.map((t) => t.id), uid: o.ownerUid, name: o.name, phone: o.phone, amount: o.total, purpose: `כרטיסים לאירוע ${e.title}`, event: e.title,
});
function Guests({ ctx, e, tickets, peopleByOrder }: { ctx: V2Ctx; e: FarmEvent; tickets: Ticket[]; peopleByOrder: ReadonlyMap<string, Profile | undefined> }) {
  const toast = useToast(); const run = useRun();
  const pay = usePayConfirm();
  const notes = useNotifications(ctx.manager);
  const orders = useMemo(() => ordersOf(tickets), [tickets]);
  const cancelled = useMemo(() => cancelledOrdersOf(tickets), [tickets]);
  const allOrders = useMemo(() => [...orders, ...cancelled], [orders, cancelled]);
  const arrivedN = orders.filter((o) => o.arrived > 0).length;
  const stats = guestStats(tickets);
  const claimed = orders.filter((o) => o.status === 'claimed');
  const [filter, setFilter] = useState<GuestFilter | null>(null);
  const f: GuestFilter = filter ?? (claimed.length ? 'claimed' : 'all');
  const [q, setQ] = useState('');
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const list = filterOrders(allOrders, f, q);
  const chosen = f === 'claimed' ? list.filter((o) => !unselected.has(o.orderId)) : [];
  const toggle = (id: string, on: boolean) => setUnselected((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });

  const approve = async (sel: Order[]) => {
    const before = await run(() => approveOrders(ctx.actor, sel.map((o) => o.tickets), notes.items));
    if (!before) return;
    toast.show({ text: sel.length === 1 ? `${sel[0].name} · ${PAYMENT_LABELS.paid}` : `${sel.length} הזמנות · ${PAYMENT_LABELS.paid}`, check: true,
      actions: [{ label: 'ביטול', onClick: () => { before.forEach((b) => restoreOrder(ctx.actor, b)); } }] });
    // Q7: one approved order asks how to tell the guest; several at once are confirmed from each order's sheet
    if (sel.length === 1 && sel[0].total > 0) pay.ask(payTarget(e, sel[0]));
  };
  const approveLabel = chosen.length === 2 ? 'אישור של שניהם' : chosen.length > 2 ? 'אישור של כולם' : 'אישור';
  const opened = allOrders.find((o) => o.orderId === sheet) || null;

  return (
    <>
      <StatRow>
        <StatTile value={stats.tickets} label="כרטיסים" />
        <StatTile value={stats.paid} label="שולמו" />
        <StatTile value={money(stats.waiting)} label="ממתין" />
      </StatRow>
      <SearchField label="חיפוש: שם או טלפון" value={q} onChange={(ev) => setQ(ev.target.value)} />
      <ChipRow label="סינון נרשמים">
        <Chip selected={f === 'all'} onClick={() => setFilter('all')}>הכל · {orders.length}</Chip>
        <Chip selected={f === 'claimed'} onClick={() => setFilter('claimed')}>סימנו שהעבירו · {claimed.length}</Chip>
        <Chip selected={f === 'unpaid'} onClick={() => setFilter('unpaid')}>לא שילמו · {orders.filter((o) => o.status === 'pending').length}</Chip>
        {(arrivedN > 0 || f === 'arrived') && <Chip selected={f === 'arrived'} onClick={() => setFilter('arrived')}>הגיעו · {arrivedN}</Chip>}
        {(cancelled.length > 0 || f === 'cancelled') && <Chip selected={f === 'cancelled'} onClick={() => setFilter('cancelled')}>בוטלו · {cancelled.length}</Chip>}
      </ChipRow>
      {list.length > 0 ? (
        <section className="k-card k-card--list" aria-label="נרשמים">
          {f === 'claimed' && (
            <div className="events-selhead">
              <span className="events-selhead__text">{chosen.length === 1 ? 'אחד סומן' : `${chosen.length} סומנו`} · {money(chosen.reduce((s, o) => s + o.owed, 0))}</span>
              <Button disabled={!chosen.length} onClick={() => approve(chosen)}>{approveLabel}</Button>
            </div>
          )}
          <ul className="k-list">
            {list.map((o) => {
              const person = peopleByOrder.get(o.orderId);
              const number = userNumber(person?.customerNumber);
              const tag = o.cancelled ? { tone: 'neutral' as const, text: 'בוטל' } : statusTag(o);
              return (
                <li key={o.orderId} className="events-guestrow">
                  {f === 'claimed' && <CheckButton className="events-guestrow__check" checked={!unselected.has(o.orderId)} onChange={(on) => toggle(o.orderId, on)} label={`בחירה: ${o.name}`} />}
                  <button type="button" className="events-guestrow__hit" onClick={() => setSheet(o.orderId)}>
                    <span className="k-row__body">
                      <span className="k-row__title">{o.name}<Tag tone={tag.tone}>{tag.text}</Tag></span>
                      <span className="k-row__meta">{ticketsWord(o.count)}{o.phone ? <> · <span dir="ltr">{o.phone}</span></> : null}</span>
                    </span>
                    <b className="events-value">{money(o.owed || o.total)}</b>
                  </button>
                  {person && number !== undefined && (
                    <a {...link(personPath(person))} className="k-textlink events-guestrow__person" aria-label={`User ID ${number} · פתיחת התיק של ${person.displayName}`}>
                      <span dir="ltr">User ID</span><bdi>{number}</bdi>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState variant="card" title={q ? 'לא נמצא' : f === 'claimed' ? 'אין תשלומים לאישור' : f === 'unpaid' ? 'כולם שילמו' : f === 'arrived' || f === 'cancelled' ? 'אין עדיין' : 'עוד אין נרשמים'} />
      )}
      <ButtonRow>
        <Button variant="outline" size="tall" icon="plus" onClick={() => setAdding(true)}>הוספת נרשם</Button>
      </ButtonRow>
      <OrderSheet ctx={ctx} e={e} order={opened} peopleByOrder={peopleByOrder} onClose={() => setSheet(null)} onApprove={(o) => approve([o])} onConfirm={(o) => pay.ask(payTarget(e, o))}
        onCancel={setCancelling} notes={notes.items} />
      <CancelSheet ctx={ctx} order={cancelling} onClose={() => setCancelling(null)} />
      <AddGuestSheet ctx={ctx} e={e} open={adding} onClose={() => setAdding(false)} />
      {pay.sheet}
    </>
  );
}

/** The order's row sheet (Q11): what it is, then its actions; cancel and delete in red at the bottom (rule 6). */
function OrderSheet({ ctx, e, order, peopleByOrder, onClose, onApprove, onConfirm, onCancel, notes }: {
  ctx: V2Ctx; e: FarmEvent; order: Order | null; peopleByOrder: ReadonlyMap<string, Profile | undefined>; onClose: () => void; onApprove: (o: Order) => void; onConfirm: (o: Order) => void; onCancel: (o: Order) => void; notes: AppNotification[];
}) {
  const open = useExternal(); const toast = useToast(); const run = useRun();
  const remove = useRemove();
  // the sheet stays mounted after it closes, so the delete confirmation it opens can still run
  const last = useRef<Order | null>(null);
  if (order) last.current = order;
  const o = order || last.current;
  if (!o) return null;
  const person = peopleByOrder.get(o.orderId);
  const t0 = o.tickets[0];
  const owing = o.owed > 0;
  const paidAll = o.tickets.every((t) => isPaid(t.paymentStatus));
  const confirmation = o.tickets.find((t) => t.paymentConfirmation)?.paymentConfirmation;
  const remind = async () => {
    const text = fillDebtTemplate(ctx.settings.templates.debtReminder, { name: o.name, event: e.title, amount: o.owed, bit: ctx.settings.payment.bit });
    open(waUrl(o.phone, text));
    await run(() => stampReminder(ctx.actor, e.id, 'tickets', o.tickets.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').map((t) => t.id)));
  };
  const markPaidNow = async () => {
    const before = o.tickets.map((t) => ({ ...t }));
    const ok = await run(async () => { await setOrderPayment(ctx.actor, o.tickets.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed'), 'paid_onsite'); await handleNotificationsFor(notes, o.orderId, ctx.actor); return true; });
    if (ok) toast.show({ text: `${o.name} · ${PAYMENT_LABELS.paid_onsite}`, check: true, actions: [{ label: 'ביטול', onClick: () => { restoreOrder(ctx.actor, before); } }] });
  };
  const holders = o.tickets.filter((t) => t.holderName).map((t) => `כרטיס ${t.index}: ${t.holderName}`);
  const answers = Object.entries(t0.answers || {}).map(([k, v]) => `${e.questions.find((x) => x.id === k)?.label || k} ${v}`);
  const sub = (
    <span className="events-sheet__meta">
      {ticketsWord(o.count)} · {o.cancelled ? 'בוטל' : statusTag(o).text}{o.arrived ? ` · ${o.arrived} נכנסו` : ''} · {money(o.owed || o.total)}<br />
      הוזמן {ddmm(o.createdAt)}{o.phone ? <> · <span dir="ltr">{o.phone}</span></> : null}
      {holders.length > 0 && <><br />{holders.join(' · ')}</>}
      {answers.length > 0 && <><br />{answers.join(' · ')}</>}
      {!o.cancelled && o.total > 0 && <PayConfirmStatus paid={paidAll} confirmation={confirmation} emailJob={'order_' + o.orderId} />}
    </span>
  );
  const items: ActionItem[] = [
    { label: 'אישור תשלום', icon: 'check', hidden: !owing, onSelect: () => onApprove(o) },
    { label: 'שולם במקום', icon: 'check', hidden: !owing, onSelect: markPaidNow },
    { label: 'תזכורת בוואטסאפ', icon: 'message', hidden: !owing || !o.phone, onSelect: remind },
    { label: confirmation ? 'שליחת אישור התשלום שוב' : 'שליחת אישור תשלום', icon: 'mail', hidden: o.cancelled || !paidAll || o.total <= 0, onSelect: () => onConfirm(o) },
    { label: 'התקשרות', icon: 'phone', hidden: !o.phone, onSelect: () => open(telUrl(o.phone)) },
    ...(person ? [{ label: `הכרטיס של ${firstName(person.displayName)}`, icon: 'people' as const, onSelect: () => go(personPath(person)) }] : []),
    { label: 'ביטול ההזמנה', icon: 'close', tone: 'danger', hidden: o.cancelled, onSelect: () => onCancel(o) },
    { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
      title: 'למחוק את ההזמנה?', text: `ההזמנה של ${o.name} (${ticketsWord(o.tickets.length)}) תימחק לגמרי, גם אצל מי שהזמין. ביטול משאיר אותה ברשימה, מחיקה לא.`,
      onConfirm: () => remove(() => deleteOrder(ctx.actor, o.tickets, notes), { text: 'ההזמנה נמחקה' }),
    } },
  ];
  return <ActionSheet open={!!order} onClose={onClose} title={o.name} sub={sub} items={items} />;
}

/** "ביטול ההזמנה": the reason goes to the history; undo from the toast. */
function CancelSheet({ ctx, order, onClose }: { ctx: V2Ctx; order: Order | null; onClose: () => void }) {
  const toast = useToast(); const run = useRun();
  const [reason, setReason] = useState('');
  const close = () => { setReason(''); onClose(); };
  const doCancel = async () => {
    if (!order) return;
    const before = order.tickets.map((t) => ({ ...t }));
    const ok = await run(async () => { await cancelOrder(ctx.actor, order.tickets, reason.trim()); return true; });
    if (ok) { close(); toast.show({ text: 'ההזמנה בוטלה', check: true, actions: [{ label: 'ביטול', onClick: () => { restoreOrder(ctx.actor, before); } }] }); }
  };
  return (
    <Sheet open={!!order} onClose={close} title="ביטול ההזמנה" sub={order ? `${order.name} · ${ticketsWord(order.count)}` : undefined}>
      <div className="events-sheet">
        <Field label="סיבת הביטול (תירשם בהיסטוריה)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
        <ButtonRow className="events-btnrow--fill">
          <Button variant="danger" size="tall" onClick={doCancel}>לבטל את ההזמנה</Button>
          <Button variant="neutral" size="tall" onClick={close}>חזרה</Button>
        </ButtonRow>
      </div>
    </Sheet>
  );
}

function AddGuestSheet({ ctx, e, open, onClose }: { ctx: V2Ctx; e: FarmEvent; open: boolean; onClose: () => void }) {
  const toast = useToast(); const run = useRun();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [count, setCount] = useState(1); const [paid, setPaid] = useState(false);
  const ok = !!name.trim() && contactPhoneOk(phone) && nowMs() < eventMillis(e.end);
  const save = async () => {
    const id = await run(() => addGuestOrder(ctx.actor, e, { name, phone, count, paid }));
    if (!id) return;
    toast.show({ text: `${name.trim()} · ${ticketsWord(count)}`, check: true });
    setName(''); setPhone(''); setCount(1); setPaid(false); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="הוספת נרשם">
      <div className="events-sheet">
        <Field label="שם" value={name} onChange={(ev) => setName(ev.target.value)} autoComplete="off" />
        <Field label="טלפון" ltr inputMode="tel" value={phone} onChange={(ev) => setPhone(ev.target.value)} />
        <div className="events-stepline">
          <span className="k-field__label">כמה כרטיסים</span>
          <Stepper size="lg" value={count} min={1} max={Math.max(e.maxPerOrder || 1, 20)} onChange={setCount} />
        </div>
        {e.price > 0 && (
          <div className="events-toggleline">
            <span>כבר שילם · {money(e.price * count)}</span>
            <Toggle checked={paid} onChange={setPaid} label="כבר שילם" />
          </div>
        )}
        <Button size="bar" block disabled={!ok} onClick={save}>הוספה</Button>
      </div>
    </Sheet>
  );
}

// ---------- M6 יום האירוע ----------
function Day({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const counters = useCounters(e.id, ctx.manager);
  const scans = useScans(e.id, 3, ctx.manager);
  const tickets = useEventTickets(e.id, ctx.manager);
  const tabs = useEventTabs(e.id, ctx.manager);
  const live = liveOf(tickets.items, counters.item);
  const share = live.total ? live.entered / live.total : 0;
  const L = { ...live, ...dayTiles(counters.item, tickets.items, tabs.items) };
  // events from before the scan log keep their entries on the tickets (ticket.scans[])
  const recent = scans.items.length ? scans.items : scansFromTickets(tickets.items).slice(0, 3);
  return (
    <>
      <Hero className="events-livehero" aria-label="כניסה">
        <div className="events-livehero__top">
          <HeroNumber>{num(L.entered)}</HeroNumber>
          <span className="events-livehero__of">נכנסו מתוך {num(L.total)} כרטיסים</span>
        </div>
        <Bar tone="hero" value={share} label={shareLabel(share)} />
        <div className="k-hero__split">
          <span>{num(L.waiting)} עוד לא הגיעו</span>
          <a className="k-hero__link" {...link(`/manage/events/${e.id}/live`)}>מסך חי מלא</a>
        </div>
      </Hero>
      <StatRow>
        <StatTile value={num(L.paidAtGate)} label="שילמו בשער" />
        <StatTile value={num(L.stallTabs)} label="חשבונות דוכן" />
        <StatTile small value={money(L.stallSold)} label="נמכר בדוכן" />
      </StatRow>
      <ListCard title="סריקות אחרונות" end={<TextLink {...link(`/manage/events/${e.id}/live/scans`)}>הכל</TextLink>}>
        {recent.map((s) => {
          const part = scanPart(s, tickets.items.find((t) => t.id === s.ticketId));
          return (
            <li key={s.id} className="events-scanrow">
              <span className="events-scanrow__time">{hhmm(s.at)}</span>
              <span className="events-scanrow__who">{s.name}{part ? ` · ${part}` : ''}</span>
              <span className="events-scanrow__by">{firstName(s.by?.name || '')}</span>
            </li>
          );
        })}
        {!recent.length && <li className="events-scanrow events-scanrow--empty">עוד אין סריקות</li>}
      </ListCard>
      <ButtonRow>
        {e.entry !== false && <Button size="lg" icon="qr" onClick={() => go(`/event/gate?e=${e.id}`)}>שער</Button>}
        {e.stall !== false && <Button size="lg" variant="outline" icon="cart" onClick={() => go(`/event/stall?e=${e.id}`)}>דוכן</Button>}
        {e.stall !== false && <Button size="lg" variant="outline" onClick={() => go(`/manage/events/${e.id}/tabs`)}>חשבונות</Button>}
      </ButtonRow>
    </>
  );
}

// ---------- M7 / Q15 סיכום ----------
/** Arrivals: counters/live from the gate (event-day data) when the event used it, the tickets otherwise. */
function useSummary(ctx: V2Ctx, e: FarmEvent, tickets: Ticket[], tabs: Tab[]) {
  const counters = useCounters(e.id, ctx.manager);
  const S = { ...eventSummary(tickets, tabs), arrived: liveOf(tickets, counters.item).entered };
  const X = summaryExtras(tickets, tabs);
  const pct = S.registered ? Math.round((S.arrived / S.registered) * 100) : X.pct;
  return { S, X, pct };
}
function usePast(ctx: V2Ctx, e: FarmEvent) {
  const nowS = nowIso();
  return useAllEvents(ctx.manager).items.filter((x) => x.id !== e.id && x.end < nowS).slice(0, 4);
}

function Summary({ ctx, e, tickets, tabs, donMoney }: { ctx: V2Ctx; e: FarmEvent; tickets: Ticket[]; tabs: Tab[]; donMoney: number }) {
  const { S, pct } = useSummary(ctx, e, tickets, tabs);
  const cash = useCash(e.id).item;
  const debts = debtsOf(e.id, tickets, tabs);
  const T = debtTotals(debts);
  const top = topSold(tabs, 3);
  const past = usePast(ctx, e);
  const cashSum = (cash?.gate?.amount || 0) + (cash?.stall?.amount || 0);
  const part = (p: Part) => link(`/manage/events/${e.id}?tab=summary&part=${p}`);
  return (
    <>
      <StatRow grid>
        <StatTile value={num(S.registered)} label="נרשמו" />
        <StatTile value={num(S.arrived)} label={`הגיעו · ${pct}%`} />
        <StatTile value={money(S.ticketsIncome)} label="כרטיסים" />
        <StatTile value={money(S.stallIncome)} label="דוכן" />
      </StatRow>
      {T.count > 0 && (
        <Card pad="md" as="section" className="events-debtcard" aria-label="חובות">
          <span className="events-debtcard__body">
            <span className="events-debtcard__title">{T.count === 1 ? 'חוב פתוח אחד' : `${T.count} חובות פתוחים`}<Tag tone="waiting">{money(T.amount)}</Tag></span>
            <span className="events-card__meta">{debtBreakdown(T)}</span>
          </span>
          <Button icon="message" iconSize={18} onClick={() => go(`/manage/events/${e.id}/debts`)}>תזכורות</Button>
        </Card>
      )}
      <ListCard aria-label="פירוט">
        {top.length > 0 && <Row minHeight={54} title="מה נמכר בדוכן" meta={top.map((x) => `${x.label} ${x.value}`).join(' · ')} {...part('sold')} />}
        <Row minHeight={54} title="כסף" meta={`תרומות ביום האירוע ${money(donMoney)}${cashSum ? ` · מזומן ${money(cashSum)}` : ''}`} {...part('money')} />
        {past.length > 0 && <CompareRow ctx={ctx} e={past[0]} href={part('compare')} />}
      </ListCard>
    </>
  );
}
/** "לעומת אירועים קודמים" with the latest past event as its meta ("סיור ראש השנה: 100% הגיעו"). */
function CompareRow({ ctx, e, href }: { ctx: V2Ctx; e: FarmEvent; href: ReturnType<typeof link> }) {
  const t = useEventTickets(e.id, ctx.manager).items;
  const v = t.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length;
  return <Row minHeight={54} title="לעומת אירועים קודמים" meta={v.length ? `${e.title}: ${Math.round((a / v.length) * 100)}% הגיעו` : e.title} {...href} />;
}

const PART_TITLE: Record<Part, string> = { sold: 'מה נמכר בדוכן', money: 'כסף', compare: 'לעומת אירועים קודמים' };
/** Q15 drill-ins: what used to sit under the summary (rule 10). */
function SummaryPart({ ctx, e, part }: { ctx: V2Ctx; e: FarmEvent; part: Part }) {
  const tickets = useEventTickets(e.id, ctx.manager).items;
  const tabs = useEventTabs(e.id, ctx.manager).items;
  const donations = useDonations(ctx.manager && part === 'money');
  const cash = useCash(e.id).item;
  const { S, X, pct } = useSummary(ctx, e, tickets, tabs);
  const past = usePast(ctx, e);
  const dayDon = donations.items.filter((d) => keyOf(d.createdAt) === keyOf(e.start) && isPaid(d.paymentStatus));
  const donMoney = dayDon.reduce((s, d) => s + d.amount, 0);
  const openSum = X.openTabsAmount + X.openOrdersAmount;
  const top = topSold(tabs, 50);
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={backTo('סיכום', `/manage/events/${e.id}?tab=summary`)} />
      <TitleBlock over={e.title} title={PART_TITLE[part]} />
      {part === 'sold' && (top.length ? (
        <Card as="section" className="events-soldcard"><BarList items={top} /></Card>
      ) : <EmptyState variant="card" icon="cart" title="עוד לא נמכר כלום" />)}
      {part === 'money' && (
        <ListCard>
          <Row minHeight={56} {...link('/manage/donations')} title="תרומות ביום האירוע" meta={`${dayDon.length} תורמים`} value={money(donMoney)} />
          <Row minHeight={56} title="עדיין לא שולם" meta={`${X.openTabs} חשבונות דוכן · ${X.openOrders} הזמנות כרטיסים`} value={money(openSum)} />
          {S.waived > 0 && <Row minHeight={56} title="נמחל" meta={`${X.waivedCount} חשבונות`} value={money(S.waived)} />}
          {cash?.gate && <Row minHeight={56} title="מזומן בשער" meta={cash.gate.by} value={money(cash.gate.amount)} />}
          {cash?.stall && <Row minHeight={56} title="מזומן בדוכן" meta={cash.stall.by} value={money(cash.stall.amount)} />}
        </ListCard>
      )}
      {part === 'compare' && (
        <>
          {/* "יצאו וחזרו" moved to the scans log (Y2), needs-design decision 7. */}
          <StatRow>
            <StatTile value={`${pct}%`} label="הגעה" />
          </StatRow>
          {past.length > 0 ? (
            <ListCard>
              {past.map((x) => <PastRow key={x.id} e={x} enabled={ctx.manager} />)}
            </ListCard>
          ) : <EmptyState variant="card" icon="calendar" title="אין אירועים קודמים" />}
        </>
      )}
    </AppScreen>
  );
}
/** A past event next to this one: tickets and how many came. */
function PastRow({ e, enabled }: { e: FarmEvent; enabled: boolean }) {
  const t = useEventTickets(e.id, enabled).items;
  const v = t.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length;
  return <Row minHeight={56} {...link(`/manage/events/${e.id}?tab=summary`)} title={e.title} meta={`${ddmm(e.start)} · ${a} הגיעו מתוך ${v.length}`}
    value={v.length ? `${Math.round((a / v.length) * 100)}%` : '—'} />;
}

function reportCsv(e: FarmEvent, tickets: Ticket[], tabs: Tab[], donMoney: number) {
  const S = eventSummary(tickets, tabs);
  const st = guestStats(tickets);
  const open = tabs.filter((t) => t.status === 'open' || t.status === 'claimed').reduce((s, t) => s + t.total, 0) + st.waiting;
  const units = new Map<string, { units: number; rev: number }>();
  for (const t of tabs) for (const i of t.items) { const c = units.get(i.name) || { units: 0, rev: 0 }; c.units += i.qty; c.rev += i.qty * i.price; units.set(i.name, c); }
  const pct = S.registered ? Math.round((S.arrived / S.registered) * 100) : 0;
  downloadCsv(`${e.title} - דוח.csv`, ['מדד', 'ערך'], [
    ['כרטיסים', S.registered], ['הזמנות', S.orders], ['הגיעו', S.arrived], ['אחוז הגעה', pct + '%'], ['כרטיסים ששולמו ₪', S.ticketsIncome],
    ['מכירות דוכן ₪', S.stallIncome], ['תרומות ביום האירוע ₪', donMoney], ['פתוח ₪', open], ['נמחל ₪', S.waived],
    ...[...units.entries()].sort((a, b) => b[1].units - a[1].units).map(([name, c]) => [name, `${c.units} יח׳ · ${c.rev} ₪`]),
  ]);
}
