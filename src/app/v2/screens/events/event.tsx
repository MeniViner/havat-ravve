// M4-M7: one event, four stages chosen by ?tab (הכנה / נרשמים / יום האירוע / סיכום). Opens on the stage that fits the time.
import { useMemo, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useRemove, useToast, useExternal, waUrl, telUrl } from '../../core';
import {
  TopBar, Segmented, ListCard, Row, Tag, Button, StatRow, StatTile, SearchField, ChipRow, Chip, CheckButton, Hero, HeroNumber, Bar,
  TextLink, Card, SectionHeader, BarList, Sheet, Field, Stepper, Toggle, EmptyState, ConfirmSheet,
} from '../../kit';
import {
  useEvent, useEventTickets, useEventTabs, useEventVendors, useProducts, useNotifications, useDonations, restoreOrder, setOrderPayment,
  cancelOrder, markPaymentConfirmation, fillTemplate, downloadCsv, handleNotificationsFor,
} from '../../../data';
import { nowMs, useClockVersion } from '../../../clock';
import { money, num, hhmm, firstName, ddmm, dayName, keyOf } from '../../format';
import { useEventTasks, useStaffing, useFiles, approveOrders, addGuestOrder, stampReminder, deleteOrder } from '../../data/events';
import {
  EVENT_TABS, defaultTab, eventSubtitle, detailsMeta, vendorsMeta, productsMeta, staffingStats, staffingMeta, stationsOf, ordersOf, guestStats,
  filterOrders, ticketsWord, dayTiles, scanPart, shareLabel, eventSummary, topSold, debtsOf, debtTotals, debtBreakdown, fillDebtTemplate,
  isPaid, type EventTab, type GuestFilter, type Order,
} from './logic';
import { useCounters, useScans, liveNumbers as liveOf } from '../../data/eventday';
import { Loading, Missing, TitleBlock, ButtonRow, backTo, link, useRun } from './shared';
import { DEFAULT_SETTINGS, PAYMENT_LABELS, type EventVendorV2, type FarmEvent, type Tab, type Ticket } from '../../../types';

export function EventScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="אירועים" parent="/manage/events" />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <EventBody ctx={ctx} e={e} tabParam={params.tab} />;
}

function EventBody({ ctx, e, tabParam }: { ctx: V2Ctx; e: FarmEvent; tabParam?: string }) {
  const now = nowMs();
  const tab = (EVENT_TABS.some((t) => t.value === tabParam) ? tabParam : defaultTab(e, now, ctx.today)) as EventTab;
  return (
    <AppScreen variant="detail" gap={tab === 'prep' ? 12 : 10}>
      <TopBar back={backTo('אירועים', '/manage/events')}
        end={<Button variant="outline" icon="edit" iconSize={16} onClick={() => go(`/manage/events/${e.id}/edit`)}>עריכה</Button>} />
      <TitleBlock over={eventSubtitle(e, now)} title={e.title} />
      <Segmented mode="tabs" className="events-tabs" label="שלבי האירוע" options={EVENT_TABS} value={tab} onChange={(v) => go(`/manage/events/${e.id}?tab=${v}`, true)} />
      {tab === 'prep' && <Prep ctx={ctx} e={e} />}
      {tab === 'guests' && <Guests ctx={ctx} e={e} />}
      {tab === 'day' && <Day ctx={ctx} e={e} />}
      {tab === 'summary' && <Summary ctx={ctx} e={e} />}
    </AppScreen>
  );
}

// ---------- M4 הכנה ----------
function Prep({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const open = useExternal();
  const vendors = useEventVendors(e.id, ctx.manager);
  const products = useProducts(e.id, ctx.manager && e.stall !== false);
  const tasks = useEventTasks(e.id, ctx.manager);
  const staffing = useStaffing(e.id, ctx.manager);
  const files = useFiles(e.id, ctx.manager);
  const st = staffingStats(stationsOf(e, staffing.items), [], []);
  const openTasks = tasks.items.filter((t) => !t.done).length;
  const fileNames = files.items.map((f) => f.name);
  const share = async () => {
    const url = `${location.origin}/app/events/${e.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: e.title, url }); return; } catch (err) { if ((err as Error)?.name === 'AbortError') return; /* closed the share sheet */ }
    }
    // no share sheet, or it failed: copy the link
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { /* no clipboard permission */ }
    if (!copied) {
      const ta = document.createElement('textarea');
      ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { copied = document.execCommand('copy'); } catch { /* not supported */ }
      ta.remove();
    }
    toast.show(copied ? { text: 'הקישור הועתק', check: true, duration: 2500 } : { text: url, duration: 6000 });
  };
  const remind = () => {
    const t = fillTemplate(ctx.settings.templates.ticketReminder || DEFAULT_SETTINGS.templates.ticketReminder, { 'שם': '', 'אירוע': e.title, 'תאריך': `${dayName(e.start)} ${ddmm(e.start)}`, 'שעה': hhmm(e.start) });
    open(`https://wa.me/?text=${encodeURIComponent(t.replace(/^שלום\s*,\s*/, 'שלום, '))}`);
  };
  return (
    <>
      <ListCard>
        <Row minHeight={58} title="פרטי האירוע" tags={<Tag tone={e.published ? 'paid' : 'neutral'}>{e.published ? 'מפורסם' : 'טיוטה'}</Tag>} meta={detailsMeta(e)} {...link(`/manage/events/${e.id}/edit`)} />
        <Row minHeight={58} title="בעלי דוכנים" meta={vendors.items.length ? vendorsMeta(vendors.items as EventVendorV2[]) : 'עוד לא הוזמנו'} {...link(`/manage/events/${e.id}/vendors`)} />
        {e.stall !== false && <Row minHeight={58} title="מוצרי הדוכן" meta={productsMeta(products.items)} {...link(`/manage/events/${e.id}/products`)} />}
        <Row minHeight={58} title="משימות הכנה" meta={`${openTasks} פתוחות מתוך ${tasks.items.length}`} {...link(`/farm/events/${e.id}`)} />
        <Row minHeight={58} title="מי עובד באירוע" meta={staffingMeta(st)} {...link(`/manage/events/${e.id}/staffing`)} />
        <Row minHeight={58} title="קבצים" meta={fileNames.length ? fileNames.slice(0, 2).join(', ') : 'עוד אין קבצים'} {...link(`/manage/events/${e.id}/files`)} />
      </ListCard>
      <ButtonRow>
        <Button variant="outline" size="tall" onClick={share}>שיתוף הקישור</Button>
        <Button variant="outline" size="tall" icon="message" onClick={remind}>תזכורת לנרשמים</Button>
      </ButtonRow>
    </>
  );
}

// ---------- M5 נרשמים ----------
const STATUS_TAG: Record<Order['status'], { tone: 'waiting' | 'neutral' | 'paid'; text: string }> = {
  claimed: { tone: 'waiting', text: 'סימן שהעביר' }, pending: { tone: 'neutral', text: PAYMENT_LABELS.pending }, paid: { tone: 'paid', text: PAYMENT_LABELS.paid }, free: { tone: 'neutral', text: PAYMENT_LABELS.free },
};
function Guests({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const run = useRun();
  const tickets = useEventTickets(e.id, ctx.manager);
  const notes = useNotifications(ctx.manager);
  const orders = useMemo(() => ordersOf(tickets.items), [tickets.items]);
  const stats = guestStats(tickets.items);
  const claimed = orders.filter((o) => o.status === 'claimed');
  const [filter, setFilter] = useState<GuestFilter | null>(null);
  const f: GuestFilter = filter ?? (claimed.length ? 'claimed' : 'all');
  const [q, setQ] = useState('');
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = filterOrders(orders, f, q);
  const chosen = f === 'claimed' ? list.filter((o) => !unselected.has(o.orderId)) : [];
  const toggle = (id: string, on: boolean) => setUnselected((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });

  const approve = async (sel: Order[]) => {
    const before = await run(() => approveOrders(ctx.actor, sel.map((o) => o.tickets), notes.items));
    if (!before) return;
    toast.show({ text: sel.length === 1 ? `${sel[0].name} · ${PAYMENT_LABELS.paid}` : `${sel.length} הזמנות · ${PAYMENT_LABELS.paid}`, check: true,
      actions: [{ label: 'ביטול', onClick: () => { before.forEach((b) => restoreOrder(ctx.actor, b)); } }] });
  };
  const exportCsv = () => downloadCsv(`${e.title} - נרשמים.csv`, ['שם', 'טלפון', 'כרטיסים', 'תשלום', 'הוזמן', 'נכנסו', 'תשובות'],
    ordersOf(tickets.items).map((o) => [o.name, o.phone, o.count, PAYMENT_LABELS[o.tickets[0].paymentStatus], ddmm(o.createdAt), o.arrived, Object.values(o.tickets[0].answers || {}).join(' / ')]));
  const approveLabel = chosen.length === 2 ? 'אישור של שניהם' : chosen.length > 2 ? 'אישור של כולם' : 'אישור';
  const opened = orders.find((o) => o.orderId === sheet) || null;

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
              const tag = STATUS_TAG[o.status];
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
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState variant="card" title={q ? 'לא נמצא' : f === 'claimed' ? 'אין תשלומים לאישור' : f === 'unpaid' ? 'כולם שילמו' : 'עוד אין נרשמים'} />
      )}
      <ButtonRow>
        <Button variant="outline" size="tall" icon="download" onClick={exportCsv}>אקסל</Button>
        <Button variant="outline" size="tall" icon="plus" onClick={() => setAdding(true)}>הוספת נרשם</Button>
      </ButtonRow>
      <OrderSheet ctx={ctx} e={e} order={opened} onClose={() => setSheet(null)} onApprove={(o) => { setSheet(null); approve([o]); }} notes={notes.items} />
      <AddGuestSheet ctx={ctx} e={e} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function OrderSheet({ ctx, e, order, onClose, onApprove, notes }: { ctx: V2Ctx; e: FarmEvent; order: Order | null; onClose: () => void; onApprove: (o: Order) => void; notes: import('../../../types').AppNotification[] }) {
  const open = useExternal(); const toast = useToast(); const run = useRun();
  const [cancelling, setCancelling] = useState(false); const [reason, setReason] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();
  if (!order) return null;
  const t0 = order.tickets[0];
  const owing = order.owed > 0;
  const paidAll = order.tickets.every((t) => isPaid(t.paymentStatus));
  const confirmation = order.tickets.find((t) => t.paymentConfirmation)?.paymentConfirmation;
  const remind = async () => {
    const text = fillDebtTemplate(ctx.settings.templates.debtReminder, { name: order.name, event: e.title, amount: order.owed, bit: ctx.settings.payment.bit });
    open(waUrl(order.phone, text));
    await run(() => stampReminder('tickets', order.tickets.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').map((t) => t.id)));
  };
  const sendConfirmation = async () => {
    const body = fillTemplate(ctx.settings.templates.paymentConfirmation?.trim() || DEFAULT_SETTINGS.templates.paymentConfirmation!, { 'שם': order.name, 'סכום': money(order.total), 'עבור': `כרטיסים לאירוע ${e.title}`, 'אירוע': e.title });
    open(waUrl(order.phone, body));
    await run(() => markPaymentConfirmation(ctx.actor, 'tickets', order.tickets.map((t) => t.id)));
  };
  const markPaidNow = async () => {
    const before = order.tickets.map((t) => ({ ...t }));
    const ok = await run(async () => { await setOrderPayment(ctx.actor, order.tickets.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed'), 'paid_onsite'); await handleNotificationsFor(notes, order.orderId, ctx.actor); return true; });
    if (ok) { onClose(); toast.show({ text: `${order.name} · ${PAYMENT_LABELS.paid_onsite}`, check: true, actions: [{ label: 'ביטול', onClick: () => { restoreOrder(ctx.actor, before); } }] }); }
  };
  const doCancel = async () => {
    const before = order.tickets.map((t) => ({ ...t }));
    const ok = await run(async () => { await cancelOrder(ctx.actor, order.tickets, reason.trim()); return true; });
    if (ok) { setCancelling(false); setReason(''); onClose(); toast.show({ text: 'ההזמנה בוטלה', check: true, actions: [{ label: 'ביטול', onClick: () => { restoreOrder(ctx.actor, before); } }] }); }
  };
  const holders = order.tickets.filter((t) => t.holderName).map((t) => `כרטיס ${t.index}: ${t.holderName}`);
  const answers = Object.entries(t0.answers || {}).map(([k, v]) => `${e.questions.find((x) => x.id === k)?.label || k} ${v}`);
  return (
    <>
    <Sheet open={!askDelete} onClose={() => { setCancelling(false); onClose(); }} title={order.name} aside={money(order.owed || order.total)}>
      <div className="events-sheet">
        <p className="events-sheet__meta">
          {ticketsWord(order.count)} · {STATUS_TAG[order.status].text}{order.arrived ? ` · ${order.arrived} נכנסו` : ''}<br />
          הוזמן {ddmm(order.createdAt)}{order.phone ? <> · <span dir="ltr">{order.phone}</span></> : null}
          {holders.length > 0 && <><br />{holders.join(' · ')}</>}
          {answers.length > 0 && <><br />{answers.join(' · ')}</>}
          {confirmation && <><br />אישור התשלום נשלח {ddmm(confirmation.at)}</>}
        </p>
        {cancelling ? (
          <>
            <Field label="סיבת הביטול (תירשם בהיסטוריה)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
            <ButtonRow className="events-btnrow--fill">
              <Button variant="danger" size="tall" onClick={doCancel}>לבטל את ההזמנה</Button>
              <Button variant="neutral" size="tall" onClick={() => setCancelling(false)}>חזרה</Button>
            </ButtonRow>
          </>
        ) : (
          <div className="events-sheet__actions">
            {owing && <Button size="tall" block icon="check" onClick={() => onApprove(order)}>אישור תשלום</Button>}
            {owing && <Button variant="outline" size="tall" block onClick={markPaidNow}>שולם במקום</Button>}
            {owing && order.phone && <Button variant="outline" size="tall" block icon="message" onClick={remind}>תזכורת בוואטסאפ</Button>}
            {paidAll && order.total > 0 && order.phone && <Button variant="outline" size="tall" block icon="message" onClick={sendConfirmation}>{confirmation ? 'שליחת אישור התשלום שוב' : 'שליחת אישור תשלום'}</Button>}
            {order.phone && <Button variant="outline" size="tall" block icon="phone" onClick={() => open(telUrl(order.phone))}>התקשרות</Button>}
            {order.ownerUid !== ctx.user.uid && <Button variant="quiet" size="tall" block onClick={() => { onClose(); go(`/manage/people/${order.ownerUid}`); }}>הכרטיס של {firstName(order.name)}</Button>}
            <Button variant="danger" size="tall" block onClick={() => setCancelling(true)}>ביטול ההזמנה</Button>
            <Button variant="quiet" size="tall" block onClick={() => setAskDelete(true)}>מחיקת ההזמנה</Button>
          </div>
        )}
      </div>
    </Sheet>
    <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את ההזמנה?"
      text={`ההזמנה של ${order.name} (${ticketsWord(order.tickets.length)}) תימחק לגמרי, גם אצל מי שהזמין. ביטול משאיר אותה ברשימה, מחיקה לא.`} confirmLabel="מחיקה"
      onConfirm={() => remove(() => deleteOrder(ctx.actor, order.tickets, notes), { text: 'ההזמנה נמחקה', after: () => { setAskDelete(false); onClose(); } })} />
    </>
  );
}

function AddGuestSheet({ ctx, e, open, onClose }: { ctx: V2Ctx; e: FarmEvent; open: boolean; onClose: () => void }) {
  const toast = useToast(); const run = useRun();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [count, setCount] = useState(1); const [paid, setPaid] = useState(false);
  const ok = name.trim().length > 1;
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
        {scans.items.map((s) => {
          const part = scanPart(s, tickets.items.find((t) => t.id === s.ticketId));
          return (
            <li key={s.id} className="events-scanrow">
              <span className="events-scanrow__time">{hhmm(s.at)}</span>
              <span className="events-scanrow__who">{s.name}{part ? ` · ${part}` : ''}</span>
              <span className="events-scanrow__by">{firstName(s.by?.name || '')}</span>
            </li>
          );
        })}
        {!scans.items.length && <li className="events-scanrow events-scanrow--empty">עוד אין סריקות</li>}
      </ListCard>
      <ButtonRow>
        {e.entry !== false && <Button size="lg" icon="qr" onClick={() => go(`/event/gate?e=${e.id}`)}>שער</Button>}
        {e.stall !== false && <Button size="lg" variant="outline" icon="cart" onClick={() => go(`/event/stall?e=${e.id}`)}>דוכן</Button>}
        {e.stall !== false && <Button size="lg" variant="outline" onClick={() => go(`/manage/events/${e.id}/tabs`)}>חשבונות</Button>}
      </ButtonRow>
    </>
  );
}

// ---------- M7 סיכום ----------
function Summary({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const tickets = useEventTickets(e.id, ctx.manager);
  const tabs = useEventTabs(e.id, ctx.manager);
  const donations = useDonations(ctx.manager);
  const counters = useCounters(e.id, ctx.manager);
  // arrivals: counters/live from the gate (event-day data) when the event used it, the tickets otherwise
  const S = { ...eventSummary(tickets.items, tabs.items), arrived: liveOf(tickets.items, counters.item).entered };
  const debts = debtsOf(e.id, tickets.items, tabs.items);
  const T = debtTotals(debts);
  const top = topSold(tabs.items);
  const exportCsv = () => reportCsv(e, tickets.items, tabs.items, donations.items.filter((d) => keyOf(d.createdAt) === keyOf(e.start) && isPaid(d.paymentStatus)).reduce((s, d) => s + d.amount, 0));
  return (
    <>
      <StatRow grid>
        <StatTile value={num(S.registered)} label="נרשמו" />
        <StatTile value={num(S.arrived)} label="הגיעו" />
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
      {top.length > 0 && (
        <Card as="section" className="events-soldcard">
          <SectionHeader title="מה נמכר בדוכן" />
          <BarList items={top} />
        </Card>
      )}
      <ButtonRow>
        <Button variant="outline" size="tall" icon="download" onClick={exportCsv}>ייצוא לאקסל</Button>
        <Button variant="outline" size="tall" onClick={() => go(`/manage/activity?event=${e.id}`)}>היסטוריית האירוע</Button>
      </ButtonRow>
    </>
  );
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
