// E7-StallWho, E8-StallSell, E9-Tabs. The stall sells to a guest's account (no money changes hands at the stall):
// pick the buyer (scan the ticket, search, recent buyers, or a walk-in), tap products, "רישום לחשבון". Works offline.
import { useMemo, useState, type ReactNode } from 'react';
import { TopBar, PageTitle, SearchField, ListCard, Row, Avatar, Button, Sheet, Field, BottomBar, Icon, TextLink, Chip, ChipRow, EmptyState, GateCamera } from '../../kit';
import { AppScreen, useToast } from '../../core';
import { hhmm, money, firstName } from '../../format';
import { useDemo } from '../../../demo/store';
import { navigate } from '../../../router';
import { parseQr, hasTabPurchases } from '../../../data';
import type { Product, Tab } from '../../../types';
import type { ScreenProps, V2Ctx } from '../../ctx';
import {
  useEventTickets, useEventTabs, useTab, useStallProducts, groupOrders, ticketMatcher, ticketGuest, tabFor, sellToTab, tabQty, tabLast, tabName,
  isWalkInTab, itemsWord, shortInitials, isEventClosed, qrPayload, DEMO_QR, digits, type EventV2, type StallGuest,
} from '../../data/eventday';
import { useRouteEvent, NoEvent, GateToasts, useCamera, useDebounce, to } from './common';

const q = (ctx: V2Ctx, id: string) => (id === ctx.eventToday?.id ? '' : `?e=${id}`);
const stallOpen = (event: EventV2 | null) => !!event && !isEventClosed(event) && event.stall !== false;
const avatarFor = (tab: Tab) => (isWalkInTab(tab) ? shortInitials(tab.guestName, true) : shortInitials(tab.guestName));

/** E7: who is buying. */
export function StallWho({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const tabs = useEventTabs(id);
  const products = useStallProducts(id);
  const toast = useToast();
  const demo = useDemo().on;
  const cam = useCamera(demo);
  const fresh = useDebounce();
  const [query, setQuery] = useState('');
  const [scan, setScan] = useState(false);
  const [walk, setWalk] = useState(false);
  const [busy, setBusy] = useState(false);
  const orders = useMemo(() => groupOrders(tickets.items).filter((o) => !o.cancelled), [tickets.items]);
  void products;
  if (!stallOpen(event) || !event) return <NoEvent loading={loading} closed={isEventClosed(event)} back="/event" backLabel="אירוע" />;
  const qs = q(ctx, id);
  const openTabs = tabs.items.filter((t) => t.status === 'open' && hasTabPurchases(t));
  const recent = [...openTabs].sort((a, b) => tabLast(b).localeCompare(tabLast(a))).slice(0, 3);
  const choose = async (g: StallGuest) => {
    if (busy) return;
    setBusy(true);
    try { const tid = await tabFor(ctx.actor, event, tabs.items, g); navigate(`/event/stall/${tid}${qs}`); }
    catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const onCode = (code: string) => {
    if (!fresh(code)) return;
    const p = parseQr(code);
    const t = p && tickets.items.find((x) => x.id === p.id && x.secret === p.secret);
    if (!t || t.eventId !== id || t.status !== 'valid') { toast.show({ text: 'הכרטיס לא נמצא באירוע הזה. אפשר לחפש לפי שם.', tone: 'error', duration: 4000 }); return; }
    setScan(false);
    void choose(ticketGuest(t));
  };
  if (scan) {
    const sample = tickets.items.find((x) => x.id === DEMO_QR.ok);
    return (
      <>
        <GateCamera place={`דוכן · ${event.title}`} onExit={() => setScan(false)} exitLabel="חזרה" hint={cam.error || undefined} showHint={demo || !!cam.error}
          onSearch={() => setScan(false)}>
          {cam.render(onCode)}
          {demo && sample && <div className="eventday-demoqr"><button type="button" className="eventday-demoqr__btn" onClick={() => onCode(qrPayload(sample))}>QR תקין</button></div>}
        </GateCamera>
        <GateToasts />
      </>
    );
  }
  const match = ticketMatcher(query);
  const d = digits(query);
  const people = query.trim() ? orders.filter((o) => o.tickets.some(match)).slice(0, 8) : [];
  const walkIns = query.trim() ? tabs.items.filter((t) => isWalkInTab(t) && t.status === 'open' && (t.guestName.toLowerCase().includes(query.trim().toLowerCase()) || (d.length >= 4 && digits(t.guestPhone).includes(d)))) : [];
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'אירוע', ...to('/event' + qs) }}
        end={<TextLink {...to('/event/stall/tabs' + qs)}>{openTabs.length === 1 ? 'חשבון פתוח אחד' : `${openTabs.length} חשבונות פתוחים`}</TextLink>} />
      <PageTitle>מי קונה?</PageTitle>
      <button type="button" className="eventday-scanbtn" onClick={() => setScan(true)}><Icon name="qr" size={24} />סריקת הכרטיס של האורח</button>
      <SearchField label="חיפוש בשם או טלפון" value={query} active={!!query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim() ? (
        people.length + walkIns.length ? (
          <ListCard title={people.length + walkIns.length === 1 ? 'התאמה אחת' : `${people.length + walkIns.length} התאמות`}>
            {people.map((o) => {
              const t = o.valid.find(match) || o.valid[0];
              const tab = tabs.items.find((x) => x.status === 'open' && x.guestUid === t.ownerUid && x.guestName === (t.holderName || t.ownerName));
              return <Row key={o.id} minHeight={58} leading={<Avatar name={t.holderName || t.ownerName} />} title={t.holderName || t.ownerName}
                meta={tab && hasTabPurchases(tab) ? `בחשבון: ${itemsWord(tabQty(tab))} · ${money(tab.total)}` : <span className="k-ltr">{t.ownerPhone}</span>}
                onClick={() => void choose(ticketGuest(t))} />;
            })}
            {walkIns.map((t) => <Row key={t.id} minHeight={58} leading={<Avatar initials={avatarFor(t)} />} title={tabName(t)} meta={`${itemsWord(tabQty(t))} · ${money(t.total)}`} {...to(`/event/stall/${t.id}${qs}`)} />)}
          </ListCard>
        ) : <EmptyState variant="card" icon="search" title="לא נמצא" text="אפשר לפתוח חשבון ללקוח בלי כרטיס." />
      ) : recent.length > 0 && (
        <ListCard title="קנו לאחרונה">
          {recent.map((t) => <Row key={t.id} minHeight={58} leading={<Avatar initials={avatarFor(t)} />} title={isWalkInTab(t) ? tabName(t) : t.guestName}
            meta={`${itemsWord(tabQty(t))} · ${hhmm(tabLast(t))}`} {...to(`/event/stall/${t.id}${qs}`)} />)}
        </ListCard>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} onClick={() => setWalk(true)}>לקוח בלי כרטיס</Button>
      <WalkInTab open={walk} onClose={() => setWalk(false)} onDone={(g) => { setWalk(false); void choose(g); }} />
    </AppScreen>
  );
}

function WalkInTab({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (g: StallGuest) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const ok = !!name.trim();
  return (
    <Sheet open={open} onClose={onClose} title="לקוח בלי כרטיס">
      <div className="eventday-sheetbody">
        <Field label="שם" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="טלפון" hint="לתזכורת תשלום אחרי האירוע" ltr inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button size="bar" block disabled={!ok} onClick={() => { onDone({ uid: '', name: name.trim(), phone: phone.trim(), ticketId: '' }); setName(''); setPhone(''); }}>המשך לדוכן</Button>
      </div>
    </Sheet>
  );
}

/** E8: tap products onto the guest's account. */
export function StallSell({ ctx, params }: ScreenProps): ReactNode {
  const tabDoc = useTab(params.tabId);
  const tab = tabDoc.item as Tab | null;
  const { id, event, loading } = useRouteEvent(ctx, { ...params, e: params.e || tab?.eventId || '' });
  const products = useStallProducts(id);
  const toast = useToast();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const qs = q(ctx, id);
  if (!tab && tabDoc.loading) return <AppScreen variant="detail">{null}</AppScreen>;
  if (!stallOpen(event) && !loading) return <NoEvent closed={isEventClosed(event)} back="/event" backLabel="אירוע" />;
  if (!tab || tab.status !== 'open') {
    return (
      <AppScreen variant="detail">
        <TopBar back={{ label: 'החלפת קונה', ...to('/event/stall' + qs) }} />
        <EmptyState icon="cart" title={tab ? 'החשבון כבר נסגר' : 'החשבון לא נמצא'} text="אפשר לבחור קונה אחר." action={<Button variant="outline" {...to('/event/stall' + qs)}>החלפת קונה</Button>} />
      </AppScreen>
    );
  }
  const list = products.items;
  const lines = list.map((p) => ({ product: p, qty: cart[p.id] || 0 })).filter((l) => l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sum = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const set = (p: Product, n: number) => setCart((c) => ({ ...c, [p.id]: Math.max(0, n) }));
  const save = async () => {
    if (!count || busy || !event) return;
    setBusy(true);
    try {
      const total = await sellToTab(ctx.actor, tab, lines);
      setCart({});
      toast.show({ text: `נרשם ${money(total)} לחשבון של ${firstName(tab.guestName)}`, check: true });
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="detail" bar={
      <BottomBar>
        <span className="eventday-total"><b>{money(sum)}</b><span>{itemsWord(count)}</span></span>
        <Button size="bar" grow disabled={!count || busy} onClick={() => void save()}>רישום לחשבון</Button>
      </BottomBar>
    }>
      <TopBar back={{ label: 'החלפת קונה', ...to('/event/stall' + qs) }} />
      <div className="eventday-who">
        <Avatar size={44} tone="me" initials={avatarFor(tab)} />
        <div className="eventday-who__body">
          <b className="eventday-who__name">{isWalkInTab(tab) ? tabName(tab) : tab.guestName}</b>
          <span className="eventday-who__meta">{hasTabPurchases(tab) ? `כבר בחשבון: ${itemsWord(tabQty(tab))} · ${money(tab.total)}` : 'חשבון חדש, עוד לא נרשם כלום'}</span>
        </div>
      </div>
      {list.length === 0 && !products.loading ? <EmptyState variant="card" icon="cart" title="אין מוצרים בדוכן" text="מנהל מוסיף מוצרים במסך האירוע." /> : (
        <div className="eventday-grid">
          {list.map((p) => {
            const n = cart[p.id] || 0;
            return (
              <div key={p.id} className={`eventday-tile${n ? ' eventday-tile--on' : ''}`}>
                <button type="button" className="eventday-tile__head" onClick={() => set(p, n + 1)} aria-label={`${p.name}, ${money(p.price)}${n ? `, ${n} בעגלה` : ''}`}>
                  <span className="eventday-tile__name">{p.name}</span>
                  <span className="eventday-tile__price">{money(p.price)}</span>
                </button>
                {n === 0 ? (
                  <button type="button" className="eventday-tile__add" aria-label={`הוספת ${p.name}`} onClick={() => set(p, 1)}><Icon name="plus" size={22} /></button>
                ) : (
                  <div className="eventday-tile__qty">
                    <button type="button" className="eventday-tile__step eventday-tile__step--dec" aria-label={`פחות ${p.name}`} onClick={() => set(p, n - 1)}>−</button>
                    <b aria-live="polite">{n}</b>
                    <button type="button" className="eventday-tile__step eventday-tile__step--inc" aria-label={`עוד ${p.name}`} onClick={() => set(p, n + 1)}><Icon name="plus" size={22} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppScreen>
  );
}

type TabFilter = 'open' | 'claimed' | 'closed';
/** E9: the stall's accounts (also the manager's N-list at /manage/events/:id/tabs). */
export function StallTabs({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tabs = useEventTabs(id);
  const [filter, setFilter] = useState<TabFilter>('open');
  const managed = !!params.id;
  if (!event) return <NoEvent loading={loading} back={managed ? '/manage/events' : '/event'} backLabel={managed ? 'אירועים' : 'אירוע'} />;
  const qs = q(ctx, id);
  const groups: Record<TabFilter, Tab[]> = {
    open: tabs.items.filter((t) => t.status === 'open' && hasTabPurchases(t)),
    claimed: tabs.items.filter((t) => t.status === 'claimed'),
    closed: tabs.items.filter((t) => t.status === 'paid' || t.status === 'waived'),
  };
  // Guests with a ticket first, largest amount first (who to remind); walk-ins at the end.
  const shown = [...groups[filter]].sort((a, b) => Number(isWalkInTab(a)) - Number(isWalkInTab(b)) || b.total - a.total);
  const toTab = (t: Tab) => (ctx.manager ? `/manage/events/${id}/tabs/${t.id}` : `/event/stall/${t.id}${qs}`);
  return (
    <AppScreen variant="detail">
      <TopBar back={managed ? { label: event.title, ...to(`/manage/events/${id}`) } : { label: 'דוכן', ...to('/event/stall' + qs) }} />
      <PageTitle>חשבונות הדוכן</PageTitle>
      <ChipRow label="סינון חשבונות">
        <Chip selected={filter === 'open'} onClick={() => setFilter('open')}>פתוחים · {groups.open.length}</Chip>
        <Chip selected={filter === 'claimed'} onClick={() => setFilter('claimed')}>סימנו ששילמו{groups.claimed.length ? ` · ${groups.claimed.length}` : ''}</Chip>
        <Chip selected={filter === 'closed'} onClick={() => setFilter('closed')}>נסגרו</Chip>
      </ChipRow>
      {shown.length ? (
        <ListCard>
          {shown.map((t) => {
            const times = new Set(t.items.map((i) => hhmm(i.at)));
            const when = times.size > 1 ? `אחרון ${hhmm(tabLast(t))}` : hhmm(tabLast(t));
            return <Row key={t.id} minHeight={58} leading={<Avatar initials={avatarFor(t)} />} title={tabName(t)}
              meta={<>{itemsWord(tabQty(t))} · {when}{isWalkInTab(t) && t.guestPhone ? <> · <span className="k-ltr">{t.guestPhone}</span></> : null}</>}
              value={money(t.total)} {...to(toTab(t))} />;
          })}
        </ListCard>
      ) : (
        <EmptyState variant="card" icon="cart" title={filter === 'open' ? 'אין חשבונות פתוחים' : filter === 'claimed' ? 'אף אחד עוד לא סימן ששילם' : 'עוד לא נסגרו חשבונות'} />
      )}
    </AppScreen>
  );
}
