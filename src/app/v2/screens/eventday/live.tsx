// Y1-Live, Y2-Scans, Y3-Rejected, Y4-Waiting, Y5-Close: the manager's view of the event while it runs, and closing it.
// Numbers come from events/{id}/counters/live (one small document, cheap to watch); lists come from the scan log and the tickets.
import { useMemo, useState, type ReactNode } from 'react';
import {
  TopBar, PageTitle, SearchField, ListCard, Row, Avatar, Button, IconButton, Tag, Chip, ChipRow, Hero, HeroNumber, Bar, LiveStatus, Dot, IconTile,
  StatRow, StatTile, DetailList, DetailRow, Quote, BottomBar, FormHeader, TextLink, Sheet, Field, EmptyState, Card, Icon, Overline, MoreMenu,
} from '../../kit';
import { useTableView } from '../../patterns';
import { AppScreen, useToast, useExternal, waUrl, telUrl } from '../../core';
import { hhmm, ddmm, dayName, money, firstName } from '../../format';
import { now, nowMs, nowIso } from '../../../clock';
import { navigate } from '../../../router';
import { fillTemplate, hasTabPurchases } from '../../../data';
import { isConflict } from '../../../db';
import type { ScreenProps, V2Ctx } from '../../ctx';
import {
  useEventTickets, useEventTabs, useScans, useRejectedScans, useScan, useCounters, useCash, useStaffing, useOrderActivity, groupOrders, orderName,
  liveNumbers, onShift, bucketKeys, ticketWord, isUnpaid, isEventClosed, reopenAndAdmit, keepRejected, saveCash, closeEvent, reopenEvent, digits,
  shortInitials, type ScanV2, type TicketV2, type Counters, type EventV2, type CashCount,
} from '../../data/eventday';
import { useRouteEvent, NoEvent, to } from './common';
import { scansFromTickets, countersFromTickets } from '../events/logic';

/** Events from before the scan log (the live app kept scans on the tickets): rebuild counters and scans from the tickets. */
const countersOr = (c: Counters | null, loading: boolean, tickets: TicketV2[]): Counters | null => c || (loading ? null : countersFromTickets(tickets));
const scansOr = (scans: ScanV2[], loading: boolean, tickets: TicketV2[]): ScanV2[] => (scans.length || loading ? scans : scansFromTickets(tickets));
import { gw } from '../../gender';

const HOURS = ['שתים עשרה', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר', 'אחת עשרה'];
const hourWord = (h: number) => HOURS[h % 12];
const andJoin = (names: string[]) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`);
const minsOf = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const hmOf = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
function leftText(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const hours = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  const minutes = m === 0 ? '' : m === 1 ? 'דקה' : `${m} דקות`;
  return hours && minutes ? `${hours} ו־${minutes}` : hours || minutes;
}
const liveBack = (id: string) => `/manage/events/${id}/live`;
const needsLook = (s: ScanV2) => s.result === 'rejected' && !s.reopenedAt && !s.keptAt;
const RESULT_TAG: Record<ScanV2['result'], ReactNode> = {
  ok: <Tag tone="paid">נכנס</Tag>, paidAtGate: <Tag tone="neutral">שילם בשער</Tag>, payLater: <Tag tone="waiting">ישלם אחר כך</Tag>, rejected: <Tag tone="urgent">נדחה</Tag>,
};

/** Half-hour entry chart: past bars warm, the current one pine, the rest a thin line. */
function EntryChart({ event, counters }: { event: EventV2; counters: Counters | null }) {
  const start = minsOf(hhmm(event.start)), end = minsOf(hhmm(event.end));
  const first = Math.floor(start / 30) * 30;
  const keys: string[] = [];
  for (let m = first; m < Math.max(end, first + 30); m += 30) keys.push(hmOf(m));
  const nowKey = bucketKeys.halfKey(nowIso());
  const per = counters?.perHalfHour || {};
  const nowIdx = keys.indexOf(nowKey);
  const max = Math.max(1, ...keys.map((k) => per[k] || 0));
  const last10 = counters?.per10m?.[bucketKeys.tenKey(new Date(nowMs() - 10 * 60_000).toISOString())] || 0;
  const said = keys.filter((k, i) => (nowIdx < 0 || i <= nowIdx) && per[k]).map((k, i, arr) => {
    const h = Number(k.slice(0, 2)), half = k.endsWith('30');
    const isNow = k === nowKey && i === arr.length - 1;
    return `${per[k]} ${isNow ? `מאז ${hourWord(h)}${half ? ' וחצי' : ''}` : `ב${hourWord(h)}${half ? ' וחצי' : ''}`}`;
  });
  return (
    <Card className="eventday-chartcard">
      <div className="eventday-chartcard__head">
        <h2 className="eventday-chartcard__title">כניסות לפי חצי שעה</h2>
        {nowIdx >= 0 && <span className="eventday-chartcard__end">עכשיו: {last10} בעשר דקות</span>}
      </div>
      <div className="eventday-chart" role="img" aria-label={said.length ? said.join(', ').replace(/^(\d+) /, '$1 כניסות ') : 'עוד אין כניסות'}>
        {keys.map((k, i) => {
          const v = per[k] || 0;
          const future = nowIdx >= 0 ? i > nowIdx : false;
          const flat = future || !v;
          return (
            <span key={k} className="eventday-chart__col">
              <span className="eventday-chart__val">{flat ? '\u00a0' : v}</span>
              <span className={`eventday-chart__bar${i === nowIdx && !flat ? ' eventday-chart__bar--now' : ''}${flat ? ' eventday-chart__bar--future' : ''}`} style={flat ? undefined : { height: Math.max(4, Math.floor((v / max) * 46)) }} />
              <span className={`eventday-chart__label${i === nowIdx ? ' is-now' : ''}`} aria-hidden="true">{k.endsWith(':00') ? Number(k.slice(0, 2)) : '\u00a0'}</span>
            </span>
          );
        })}
      </div>
    </Card>
  );
}

/** Y1: the event while it runs. */
export function LiveScreen({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const tabs = useEventTabs(id, !!event && event.stall !== false);
  const counters = useCounters(id);
  const staffing = useStaffing(id);
  const rejected = useRejectedScans(id);
  const last = useScans(id, 1);
  if (!event) return <NoEvent loading={loading} back="/manage/events" backLabel="אירועים" />;
  const c = countersOr(counters.item, counters.loading, tickets.items);
  const n = liveNumbers(tickets.items, c);
  const nowHM = hhmm(now());
  const endM = minsOf(hhmm(event.end)), nowM = minsOf(nowHM), startM = minsOf(hhmm(event.start));
  const closed = isEventClosed(event);
  const status = closed ? 'נסגר' : nowM < startM ? `מתחיל ב־${hhmm(event.start)}` : nowM >= endM ? 'הסתיים' : `חי · ${nowHM}`;
  const open = rejected.items.filter(needsLook);
  const station = (key: string) => staffing.items.find((s) => s.id === key || s.station === key);
  const unstaffed = staffing.items.filter((s) => (s.needed || 1) > 0 && s.people.length === 0);
  const gateNames = onShift(station('gate') || station('שער'), nowHM).map((p) => firstName(p.name));
  const stallNames = onShift(station('stall') || station('דוכן'), nowHM).map((p) => firstName(p.name));
  const sold = tabs.items.filter(hasTabPurchases);
  const soldSum = sold.reduce((s, t) => s + t.total, 0);
  const l = scansOr(last.items, last.loading, tickets.items)[0];
  const attention = (open.length ? 1 : 0) + unstaffed.length + (n.payLaterCount ? 1 : 0);
  const e = `?e=${id}&from=live`;
  return (
    <AppScreen variant="detail" gap={10} bar={
      <BottomBar>
        {event.entry !== false && <Button size="bar" icon="qr" iconSize={20} className="eventday-barbtn" {...to('/event/gate' + e)}>שער</Button>}
        {event.stall !== false && <Button size="bar" variant="outline" icon="cart" iconSize={20} className="eventday-barbtn" {...to('/event/stall' + e)}>דוכן</Button>}
        <Button size="bar" variant="outline" className="eventday-barbtn" {...to(`/manage/events/${id}/close`)}>{closed ? 'הסיכום' : 'סגירת האירוע'}</Button>
      </BottomBar>
    }>
      <TopBar back={{ label: event.title, ...to(`/manage/events/${id}?tab=day`) }}
        end={<><LiveStatus tone={closed || nowM >= endM ? 'amber' : 'green'}>{status}</LiveStatus>
          <IconButton icon="megaphone" variant="outline" label="הודעה לצוות האירוע" {...to(`/manage/broadcasts/new?audience=crew&event=${id}`)} /></>} />
      <Hero tight>
        <div className="eventday-hero-count">
          <HeroNumber size="xl">{n.entered}</HeroNumber>
          <span className="eventday-hero-count__text"><b>נכנסו</b><span>מתוך {n.total} כרטיסים</span></span>
        </div>
        <Bar tone="hero" value={n.total ? n.entered / n.total : 0} label={`נכנסו ${n.entered} מתוך ${n.total}`} />
        <div className="k-hero__split">
          <a className="eventday-herolink" {...to(`/manage/events/${id}/live/waiting`)}>{n.waiting} עוד לא הגיעו</a>
          {!closed && nowM < endM && nowM >= startM && <span>נשארו {leftText(endM - nowM)}</span>}
        </div>
      </Hero>
      <EntryChart event={event} counters={c} />
      {attention > 0 && (
        <ListCard title={`דורש אותך · ${attention}`}>
          {open.length > 0 && <Row minHeight={48} leading={<Dot tone="red" />} title={open.length === 1 ? 'סריקה אחת נדחתה בשער' : `${open.length} סריקות נדחו בשער`}
            meta={`האחרונה ${hhmm(open[0].at)} · ${open[0].name}`} {...to(`/manage/events/${id}/live/scans?filter=rejected`)} />}
          {unstaffed.map((s) => <Row key={s.id} minHeight={48} leading={<Dot tone="red" />} title={`${s.station} בלי איש צוות`} meta="אף אחד לא משובץ" {...to(`/manage/events/${id}/staffing`)} />)}
          {n.payLaterCount > 0 && <Row minHeight={48} leading={<Dot tone="amber" />} title={`${n.payLaterCount === 1 ? 'אחד נכנס' : `${n.payLaterCount} נכנסו`} וישלמו אחר כך`}
            meta={`${money(n.payLaterAmount)} פתוחים`} {...to(`/manage/events/${id}/debts`)} />}
        </ListCard>
      )}
      <ListCard aria-label="עמדות">
        {event.entry !== false && <Row minHeight={50} leading={<IconTile icon="qr" />} title={`שער${gateNames.length ? ` · ${andJoin(gateNames)}` : ''}`}
          meta={`${l ? `סריקה אחרונה ${hhmm(l.at)}` : 'עוד לא נסרק'} · ${c?.paidAtGate || 0} שילמו בשער`} {...to(`/manage/events/${id}/live/scans`)} />}
        {event.stall !== false && <Row minHeight={50} leading={<IconTile icon="cart" />} title={`דוכן${stallNames.length ? ` · ${andJoin(stallNames)}` : ''}`}
          meta={`${sold.length} חשבונות · נמכר ${money(soldSum)}`} {...to(`/manage/events/${id}/tabs`)} />}
      </ListCard>
    </AppScreen>
  );
}

type ScanFilter = 'all' | 'gate' | 'later' | 'rejected';
const SCAN_WORD: Record<ScanV2['result'], string> = { ok: 'נכנס', paidAtGate: 'שילם בשער', payLater: 'ישלם אחר כך', rejected: 'נדחה' };
/** Y2: every scan, newest first. */
export function ScansScreen({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const scanLog = useScans(id, 300);
  const tickets = useEventTickets(id);
  const scans = { items: scansOr(scanLog.items, scanLog.loading || tickets.loading, tickets.items) };
  const rejected = useRejectedScans(id);
  const counters = useCounters(id);
  const [filter, setFilter] = useState<ScanFilter>((params.filter as ScanFilter) || 'all');
  const [query, setQuery] = useState('');
  // Q9 / rule 5: the table view and the CSV are ⋯ items, not a top-bar "אקסל"
  const table = useTableView({
    title: 'סריקות', filter: event?.title, filename: `סריקות-${event?.title || ''}.csv`, headers: ['שעה', 'שם', 'טלפון', 'תוצאה', 'פרטים', 'סכום', 'סרק'],
    rows: () => scans.items.map((s) => [hhmm(s.at), s.name, s.phone || '', SCAN_WORD[s.result], s.meta, s.amount || '', s.by?.name || '']),
  });
  if (!event) return <NoEvent loading={loading} back="/manage/events" backLabel="אירועים" />;
  if (table.active) return table.screen;
  const c = countersOr(counters.item, counters.loading || tickets.loading, tickets.items);
  const base = filter === 'rejected' ? rejected.items : scans.items.filter((s) => filter === 'all' || (filter === 'gate' ? s.result === 'paidAtGate' : filter === 'later' ? s.result === 'payLater' : true));
  const text = query.trim().toLowerCase(), d = digits(query);
  const shown = text ? base.filter((s) => s.name.toLowerCase().includes(text) || (d.length >= 4 && digits(s.phone || '').includes(d))) : base;
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'האירוע חי', ...to(liveBack(id)) }} end={<MoreMenu title="סריקות" items={table.items} />} />
      <PageTitle>סריקות · {c?.scans ?? scans.items.length}</PageTitle>
      <SearchField label="שם או טלפון" value={query} active={!!query} onChange={(ev) => setQuery(ev.target.value)} />
      <ChipRow label="סינון סריקות">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'gate'} onClick={() => setFilter('gate')}>בשער · {c?.paidAtGate ?? 0}</Chip>
        <Chip selected={filter === 'later'} onClick={() => setFilter('later')}>אחר כך · {c?.payLater ?? 0}</Chip>
        <Chip selected={filter === 'rejected'} onClick={() => setFilter('rejected')}>נדחו · {rejected.items.length}</Chip>
      </ChipRow>
      {shown.length ? (
        <ListCard>
          {shown.map((s) => {
            const tag = s.result === 'rejected' && s.reopenedAt ? <Tag tone="neutral">נפתח מחדש</Tag> : RESULT_TAG[s.result];
            const link = s.result === 'rejected' ? to(`/manage/events/${id}/live/scans/${s.id}`) : {};
            return <Row key={s.id} minHeight={58} chevron={false} leading={<span className="eventday-time">{hhmm(s.at)}</span>} title={s.name} tags={tag} meta={s.meta}
              trailing={<span className="eventday-by">{firstName(s.by?.name || '')}</span>} {...link} />;
          })}
        </ListCard>
      ) : <EmptyState variant="card" icon="qr" title={text ? 'לא נמצא' : 'אין סריקות כאן'} />}
    </AppScreen>
  );
}

/** Y3: one rejected scan; reopen the order and let them in, or keep it rejected. */
export function RejectedScan({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const scanDoc = useScan(id, params.sid);
  const scan = scanDoc.item as ScanV2 | null;
  const tickets = useEventTickets(id);
  const activity = useOrderActivity(scan?.orderId || '');
  const toast = useToast();
  const open = useExternal();
  const [busy, setBusy] = useState(false);
  const back = `/manage/events/${id}/live/scans`;
  if (!event || !scan) {
    if (loading || scanDoc.loading) return <AppScreen variant="detail">{null}</AppScreen>;
    return <AppScreen variant="detail"><TopBar back={{ label: 'סריקות', ...to(back) }} /><EmptyState icon="qr" title="הסריקה לא נמצאה" /></AppScreen>;
  }
  const order = tickets.items.filter((t) => t.orderId === scan.orderId).sort((a, b) => a.index - b.index);
  const t0 = order[0] as TicketV2 | undefined;
  const cancelled = !!t0 && t0.status === 'cancelled';
  const act = activity.items.find((a) => a.action === 'cancelled');
  const cancelBy = t0?.cancelledBy?.name || act?.by?.name || '';
  const cancelAt = t0?.cancelledAt || act?.at || t0?.updatedAt || '';
  const note = t0?.cancelNote || (act?.text.includes('·') ? act.text.split('·').slice(1).join('·').trim().replace(/^"|"$/g, '') : '');
  const sum = order.reduce((s, t) => s + (t.price || 0), 0);
  const paid = order.length > 0 && order.every((t) => !isUnpaid(t) && t.paymentStatus !== 'pending' && t.paymentStatus !== 'claimed');
  const phone = scan.phone || t0?.ownerPhone || '';
  const first = firstName(scan.name);
  const resolved = !!scan.reopenedAt || !!scan.keptAt;
  const reopen = async () => {
    if (busy) return;
    setBusy(true);
    try { await reopenAndAdmit(ctx.actor, event, scan, order); toast.show({ text: `נפתח מחדש. ${first} בפנים`, check: true }); navigate(back); }
    catch (e) { if (isConflict(e)) toast.refused(); else toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const keep = async () => {
    if (busy) return;
    setBusy(true);
    try { await keepRejected(ctx.actor, id, scan); toast.show({ text: 'נשאר דחוי', check: true }); navigate(back); }
    catch (e) { if (isConflict(e)) toast.refused(); else toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const canAct = !resolved && order.length > 0 && !isEventClosed(event);
  return (
    <AppScreen variant="detail" gap={10} bar={canAct ? (
      <BottomBar>
        <Button size="bar" grow disabled={busy} onClick={() => void reopen()}>{cancelled ? 'לפתוח מחדש ולהכניס' : 'להכניס, ישלמו אחר כך'}</Button>
        <Button size="bar" variant="secondary" disabled={busy} onClick={() => void keep()}>נשאר דחוי</Button>
      </BottomBar>
    ) : undefined}>
      <TopBar back={{ label: 'סריקות', ...to(back) }} />
      <div className="eventday-head">
        <Overline className="eventday-overhead">נדחה בשער · {hhmm(scan.at)} · סרק {firstName(scan.by?.name || '')}</Overline>
        <div className="eventday-titleline">
          <PageTitle size="detail">{scan.name}</PageTitle>
          {scan.reopenedAt ? <Tag tone="paid">נפתח מחדש</Tag> : scan.keptAt ? <Tag tone="neutral">נשאר דחוי</Tag> : <Tag tone="urgent">נדחה</Tag>}
        </div>
      </div>
      {phone && (
        <div className="eventday-actions">
          <Button size="tall" icon="message" onClick={() => open(waUrl(phone, `שלום ${first},`))}>וואטסאפ</Button>
          <Button size="tall" variant="outline" icon="phone" onClick={() => open(telUrl(phone))}>התקשרות</Button>
        </div>
      )}
      <DetailList>
          <DetailRow term="למה נדחה" style={{ minHeight: 50 }}>{scan.reason || scan.meta}</DetailRow>
          {cancelled && cancelBy && <DetailRow term="מי ביטל" style={{ minHeight: 50 }}>{firstName(cancelBy)}{cancelAt ? ` · ${ddmm(cancelAt)}` : ''}</DetailRow>}
          {order.length > 0 && <DetailRow term="הזמנה" style={{ minHeight: 50 }}>{ticketWord(order.length)} · {money(sum)} · {sum === 0 ? 'חינם' : paid ? 'שולם' : 'לא שולם'}</DetailRow>}
          {phone && <DetailRow term="טלפון" style={{ minHeight: 50 }}><span className="k-ltr">{phone}</span></DetailRow>}
      </DetailList>
      {cancelled && note && <Quote>{note}</Quote>}
      <ListCard title="מה קרה">
        {scan.reopenedAt && <Row minHeight={50} title={`${hhmm(scan.reopenedAt)} · נפתח מחדש ונכנסו`} meta={scan.reopenedBy?.name ? firstName(scan.reopenedBy.name) : undefined} />}
        {scan.keptAt && <Row minHeight={50} title={`${hhmm(scan.keptAt)} · נשאר דחוי`} meta={scan.keptBy?.name ? firstName(scan.keptBy.name) : undefined} />}
        <Row minHeight={50} title={`${hhmm(scan.at)} · הכרטיס נסרק ונדחה`} meta={`${firstName(scan.by?.name || '')}, בשער`} />
        {cancelled && cancelAt && <Row minHeight={50} title={`${ddmm(cancelAt)} · ההזמנה בוטלה`} meta={cancelBy ? firstName(cancelBy) : undefined} />}
      </ListCard>
    </AppScreen>
  );
}

type WaitFilter = 'all' | 'partial' | 'unpaid';
/** Y4: who has not arrived yet, with a WhatsApp nudge per order. */
export function WaitingScreen({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const open = useExternal();
  const [filter, setFilter] = useState<WaitFilter>('all');
  const orders = useMemo(() => groupOrders(tickets.items).filter((o) => !o.cancelled && o.entered < o.valid.length)
    .sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt)), [tickets.items]);
  if (!event) return <NoEvent loading={loading} back="/manage/events" backLabel="אירועים" />;
  const owes = (o: (typeof orders)[number]) => o.valid.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').filter((t) => !t.payLater || isUnpaid(t));
  const partial = orders.filter((o) => o.entered > 0);
  const unpaid = orders.filter((o) => owes(o).length > 0);
  const waitingTickets = orders.reduce((s, o) => s + o.valid.length - o.entered, 0);
  const shown = filter === 'partial' ? partial : filter === 'unpaid' ? unpaid : orders;
  const rush = hmOf(minsOf(hhmm(event.start)) + 150);
  const tpl = ctx.settings.templates.ticketReminder;
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'האירוע חי', ...to(liveBack(id)) }} />
      <PageTitle>עוד לא הגיעו</PageTitle>
      <StatRow>
        <StatTile value={waitingTickets} label="כרטיסים" />
        <StatTile value={orders.length} label="הזמנות" />
        <StatTile value={unpaid.length} label="לא שילמו" />
      </StatRow>
      <ChipRow label="סינון">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל · {orders.length}</Chip>
        <Chip selected={filter === 'partial'} onClick={() => setFilter('partial')}>הגיעו חלקית · {partial.length}</Chip>
        <Chip selected={filter === 'unpaid'} onClick={() => setFilter('unpaid')}>לא שילמו · {unpaid.length}</Chip>
      </ChipRow>
      {shown.length ? (
        <ListCard>
          {shown.map((o) => {
            const name = orderName(o);
            const family = name.startsWith('משפחת ');
            const due = owes(o).reduce((s, t) => s + (t.price || 0), 0);
            const n = o.valid.length;
            const meta = o.entered > 0 ? `${o.entered === 1 ? 'נכנס' : 'נכנסו'} ${o.entered} מתוך ${n}` : n === 1 ? 'כרטיס אחד · עוד לא הגיע' : `${ticketWord(n)} · אף אחד עוד לא`;
            const text = fillTemplate(tpl, { 'שם': family ? name : firstName(name), 'אירוע': event.title, 'תאריך': `${dayName(event.start)} ${ddmm(event.start)}` });
            return <Row key={o.id} minHeight={58} leading={<Avatar initials={family ? shortInitials(name.slice(6), true) : shortInitials(name)} />} title={name}
              tags={due ? <Tag tone="waiting">{money(due)}</Tag> : <Tag tone="paid">שולם</Tag>} meta={meta}
              actions={o.first.ownerPhone ? <IconButton icon="message" variant="outline" label={`וואטסאפ ל${family ? name : firstName(name)}`} onClick={() => open(waUrl(o.first.ownerPhone, text))} /> : undefined} />;
          })}
        </ListCard>
      ) : <EmptyState variant="card" icon="check" title="כולם כאן" />}
      {!isEventClosed(event) && <p className="eventday-foot">השעה {hhmm(now())}. האירוע פתוח עד {hhmm(event.end)}, ורוב האנשים מגיעים עד {rush}.</p>}
    </AppScreen>
  );
}

/** Y5: count the cash, see what stays open, close (reopenable until noon tomorrow). */
export function CloseEvent({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const tabs = useEventTabs(id);
  const counters = useCounters(id);
  const cash = useCash(id);
  const toast = useToast();
  const [edit, setEdit] = useState<'gate' | 'stall' | null>(null);
  const [busy, setBusy] = useState(false);
  if (!event) return <NoEvent loading={loading} back="/manage/events" backLabel="אירועים" />;
  const n = liveNumbers(tickets.items, countersOr(counters.item, counters.loading || tickets.loading, tickets.items));
  const openTabs = tabs.items.filter((t) => t.status === 'open' && hasTabPurchases(t));
  const openSum = openTabs.reduce((s, t) => s + t.total, 0);
  const closed = event.closed;
  const canReopen = !!closed && nowIso() < closed.reopenUntil;
  const cashRow = (which: 'gate' | 'stall') => {
    const cc = cash.item?.[which] as CashCount | undefined;
    const place = which === 'gate' ? 'בשער' : 'בדוכן';
    if (!event[which === 'gate' ? 'entry' : 'stall'] && event[which === 'gate' ? 'entry' : 'stall'] === false) return null;
    return <Row key={which} minHeight={60} leading={<span className={`eventday-check${cc ? ' eventday-check--done' : ''}`}>{cc && <Icon name="check" size={16} />}</span>}
      title={cc ? `מזומן ${place} נספר` : `מזומן ${place}`} meta={cc ? `${money(cc.amount)} · ${gw(cc.by, 'ספר', 'ספרה')} ${cc.by}` : 'עוד לא נספר'}
      actions={closed ? undefined : <TextLink onClick={() => setEdit(which)}>{cc ? 'תיקון' : 'ספירה'}</TextLink>} />;
  };
  const doClose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await closeEvent(ctx.actor, event, cash.item);
      toast.show({ text: 'האירוע נסגר', check: true, actions: [{ label: 'ביטול', onClick: () => { void reopenEvent(ctx.actor, event); } }] });
      navigate(`/manage/events/${id}?tab=summary`);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const doReopen = async () => {
    if (busy) return;
    setBusy(true);
    try { await reopenEvent(ctx.actor, event); toast.show({ text: 'האירוע נפתח מחדש', check: true }); navigate(liveBack(id)); }
    catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const at = closed?.at || nowIso();
  return (
    <AppScreen variant="form" gap={12} bar={closed ? (canReopen ? <BottomBar><Button size="bar" grow variant="outline" disabled={busy} onClick={() => void doReopen()}>פתיחה מחדש</Button></BottomBar> : undefined)
      : <BottomBar><Button size="bar" grow icon="check" iconSize={22} disabled={busy} onClick={() => void doClose()}>סגירת האירוע</Button></BottomBar>}>
      <FormHeader title={closed ? 'האירוע נסגר' : 'סגירת האירוע'} cancelLabel={closed ? 'חזרה' : 'ביטול'} cancelHref={to(liveBack(id)).href} onCancel={to(liveBack(id)).onClick} />
      <Hero style={{ gap: 4 }}>
        <span className="eventday-hero-over">{event.title} · {dayName(at)} {ddmm(at)} · {hhmm(at)}</span>
        <div className="eventday-hero-count">
          <HeroNumber>{n.entered}</HeroNumber>
          <span className="eventday-hero-count__text"><b className="eventday-hero-count__of">נכנסו מתוך {n.total} כרטיסים</b></span>
        </div>
      </Hero>
      <ListCard title="לפני שסוגרים">
        {cashRow('gate')}
        {cashRow('stall')}
        {openTabs.length > 0 && <Row minHeight={60} leading={<span className="eventday-check" />} title={openTabs.length === 1 ? 'חשבון דוכן פתוח אחד' : `${openTabs.length} חשבונות דוכן פתוחים`}
          meta={`${money(openSum)} · יקבלו תזכורת מחר בבוקר`} {...to(`/manage/events/${id}/tabs`)} />}
        {n.payLaterCount > 0 && <Row minHeight={60} leading={<span className="eventday-check" />} title={`${n.payLaterCount === 1 ? 'אחד ישלם' : `${n.payLaterCount} ישלמו`} אחר כך`}
          meta={`${money(n.payLaterAmount)} · יקבלו תזכורת מחר בבוקר`} {...to(`/manage/events/${id}/debts`)} />}
      </ListCard>
      {!closed && (
        <Card className="eventday-listcard">
          <h2 className="eventday-listcard__title">מה קורה כשסוגרים</h2>
          <ul className="eventday-list">
            <li>הסריקה בשער והמכירה בדוכן נסגרות.</li>
            <li>לשונית "אירוע" יורדת מהטלפונים של הצוות.</li>
            <li>הסיכום נפתח, והחובות הפתוחים עוברים לתזכורות.</li>
          </ul>
        </Card>
      )}
      <p className="eventday-note">{closed ? (canReopen ? `אפשר לפתוח מחדש עד ${dayName(closed.reopenUntil)} ב־12:00.` : 'כבר אי אפשר לפתוח מחדש.') : 'אפשר לפתוח מחדש עד מחר בצהריים.'}</p>
      <CashSheet which={edit} current={edit ? (cash.item?.[edit] as CashCount | undefined) : undefined} me={firstName(ctx.actor.name)}
        onClose={() => setEdit(null)} onSave={async (amount, by) => { const w = edit!; setEdit(null); try { await saveCash(ctx.actor, id, w, amount, by); toast.show({ text: 'נשמר', check: true }); } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } }} />
    </AppScreen>
  );
}

function CashSheet({ which, current, me, onClose, onSave }: { which: 'gate' | 'stall' | null; current?: CashCount; me: string; onClose: () => void; onSave: (amount: number, by: string) => void }) {
  const [amount, setAmount] = useState('');
  const [by, setBy] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  if (which && shown !== which) { setShown(which); setAmount(current ? String(current.amount) : ''); setBy(current?.by || me); }
  if (!which && shown) setShown(null);
  const value = Number(amount.replace(/[^\d.]/g, ''));
  const ok = amount.trim() !== '' && Number.isFinite(value) && !!by.trim();
  return (
    <Sheet open={!!which} onClose={onClose} title={which === 'stall' ? 'מזומן בדוכן' : 'מזומן בשער'}>
      <div className="eventday-sheetbody">
        <Field label="כמה נספר (₪)" inputMode="numeric" numeric ltr value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field label="מי ספר" value={by} onChange={(e) => setBy(e.target.value)} />
        <Button size="bar" block disabled={!ok} onClick={() => onSave(value, by.trim())}>שמירה</Button>
      </div>
    </Sheet>
  );
}
export type { V2Ctx };
