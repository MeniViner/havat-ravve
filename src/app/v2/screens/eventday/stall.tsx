// E7-StallWho, E8-StallSell, E9-Tabs. The stall sells to a guest's account (no money changes hands at the stall):
// pick the buyer (scan the ticket, search, recent buyers, or a walk-in), tap products, "רישום לחשבון". Works offline.
// Q28/Q29: "כבר בחשבון: …" under the buyer opens the account sheet, where the crew removes a line, marks the account paid,
// and clears the cart (with the undo toast). E9 rows open the account; they carry no buttons (rule 4).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { TopBar, PageTitle, SearchField, ListCard, Row, Avatar, Button, Sheet, Field, BottomBar, Icon, TextLink, Chip, ChipRow, EmptyState, GateCamera, StatRow, StatTile, UnderlineLink } from '../../kit';
import { gw } from '../../gender';
import { AppScreen, useToast } from '../../core';
import { hhmm, money, firstName } from '../../format';
import { useDemo } from '../../../demo/store';
import { navigate } from '../../../router';
import { parseQr, hasTabPurchases } from '../../../data';
import type { Product, Tab } from '../../../types';
import type { ScreenProps, V2Ctx } from '../../ctx';
import {
  useEventTickets, useEventTabs, useTab, useStallProducts, ticketGuest, tabFor, sellToTab, sellToGuest, tabQty, tabLast, tabName,
  isWalkInTab, itemsWord, shortInitials, isEventClosed, qrPayload, DEMO_QR, digits, findOpenTab, stallPeople, stallSummary, ticketWord,
  rememberBuyer, pendingBuyer, forgetBuyer, removeTabItem, setTabStatus, type EventV2, type StallGuest,
} from '../../data/eventday';
import { useRouteEvent, NoEvent, GateToasts, useCamera, useDebounce, to, moduleOff } from './common';

const q = (ctx: V2Ctx, id: string, from?: string) => (id === ctx.eventToday?.id && !from ? '' : `?e=${id}${from ? `&from=${from}` : ''}`);
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
  const people = useMemo(() => (query.trim() ? stallPeople(tickets.items, query).slice(0, 8) : []), [tickets.items, query]);
  void products;
  if (!stallOpen(event) || !event) return <NoEvent loading={loading} closed={isEventClosed(event)} off={moduleOff(event, 'stall')} back="/event" backLabel="אירוע" />;
  const qs = q(ctx, id, params.from);
  const live = params.from === 'live';
  const openTabs = tabs.items.filter((t) => t.status === 'open' && hasTabPurchases(t));
  const recent = [...openTabs].sort((a, b) => tabLast(b).localeCompare(tabLast(a))).slice(0, 3);
  // an existing open account opens as is; a new buyer gets an account only with the first "רישום לחשבון"
  const choose = (g: StallGuest) => {
    const tid = tabFor(tabs.items, g);
    if (tid) { navigate(`/event/stall/${tid}${qs}`); return; }
    rememberBuyer(id, g);
    navigate(`/event/stall/new${qs}`);
  };
  const onCode = (code: string, tapped = false) => {
    if (!tapped && !fresh(code)) return;
    const p = parseQr(code);
    const t = p && tickets.items.find((x) => x.id === p.id && x.secret === p.secret);
    if (!t || t.eventId !== id || t.status !== 'valid') { toast.show({ text: 'הכרטיס לא נמצא באירוע הזה. אפשר לחפש לפי שם.', tone: 'error', duration: 4000 }); return; }
    setScan(false);
    choose(ticketGuest(t));
  };
  if (scan) {
    const sample = tickets.items.find((x) => x.id === DEMO_QR.ok);
    return (
      <>
        <GateCamera place={`דוכן · ${event.title}`} onExit={() => setScan(false)} exitLabel="חזרה" hint={cam.error || undefined} showHint={demo || !!cam.error}
          onSearch={() => setScan(false)}>
          {cam.render(onCode)}
          {demo && sample && <div className="eventday-demoqr"><button type="button" className="eventday-demoqr__btn" onClick={() => onCode(qrPayload(sample), true)}>QR תקין</button></div>}
        </GateCamera>
        <GateToasts />
      </>
    );
  }
  const d = digits(query);
  const walkIns = query.trim() ? tabs.items.filter((t) => isWalkInTab(t) && t.status === 'open' && (t.guestName.toLowerCase().includes(query.trim().toLowerCase()) || (d.length >= 4 && digits(t.guestPhone).includes(d)))) : [];
  return (
    <AppScreen variant="detail">
      <TopBar back={live ? { label: 'האירוע חי', ...to(`/manage/events/${id}/live`) } : { label: 'אירוע', ...to('/event' + qs) }}
        end={<TextLink {...to('/event/stall/tabs' + qs)}>{openTabs.length === 1 ? 'חשבון פתוח אחד' : `${openTabs.length} חשבונות פתוחים`}</TextLink>} />
      <PageTitle>מי קונה?</PageTitle>
      <button type="button" className="eventday-scanbtn" onClick={() => setScan(true)}><Icon name="qr" size={24} />סריקת הכרטיס של האורח</button>
      <SearchField label="חיפוש בשם או טלפון" value={query} active={!!query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim() ? (
        people.length + walkIns.length ? (
          <ListCard title={people.length + walkIns.length === 1 ? 'התאמה אחת' : `${people.length + walkIns.length} התאמות`}>
            {people.map(({ key, guest, tickets: held }) => {
              const tab = findOpenTab(tabs.items, guest);
              return <Row key={key} minHeight={58} leading={<Avatar name={guest.name} />} title={guest.name}
                meta={tab && hasTabPurchases(tab) ? `בחשבון: ${itemsWord(tabQty(tab))} · ${money(tab.total)}` : <><span className="k-ltr">{guest.phone}</span> · {ticketWord(held.length)}</>}
                onClick={() => choose(guest)} />;
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
      <WalkInTab open={walk} onClose={() => setWalk(false)} onDone={(g) => { setWalk(false); choose(g); }} />
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

/** E8: tap products onto the guest's account. `/event/stall/new`: a buyer picked on E7 who has no account yet; the first
 *  "רישום לחשבון" opens it (as in the old stall) and the page moves to the new account. */
export function StallSell({ ctx, params }: ScreenProps): ReactNode {
  const fresh = params.tabId === 'new';
  const tabDoc = useTab(fresh ? '' : params.tabId);
  const tab = tabDoc.item as Tab | null;
  const { id, event, loading } = useRouteEvent(ctx, { ...params, e: params.e || tab?.eventId || '' });
  const buyer = useMemo(() => (fresh && id ? pendingBuyer(id) : null), [fresh, id]);
  const tabs = useEventTabs(id, fresh);
  const products = useStallProducts(id);
  const toast = useToast();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(false);
  const saving = useRef(false);
  const cartVersion = useRef(0);
  const qs = q(ctx, id, params.from);
  if (!fresh && !tab && tabDoc.loading) return <AppScreen variant="detail">{null}</AppScreen>;
  if (!stallOpen(event) && !loading) return <NoEvent closed={isEventClosed(event)} off={moduleOff(event, 'stall')} back="/event" backLabel="אירוע" />;
  if (fresh ? !buyer : !tab || tab.status !== 'open') {
    return (
      <AppScreen variant="detail">
        <TopBar back={{ label: 'החלפת קונה', ...to('/event/stall' + qs) }} />
        <EmptyState icon="cart" title={tab ? 'החשבון כבר נסגר' : 'החשבון לא נמצא'} text="אפשר לבחור קונה אחר." action={<Button variant="outline" {...to('/event/stall' + qs)}>החלפת קונה</Button>} />
      </AppScreen>
    );
  }
  const walkIn = tab ? isWalkInTab(tab) : !buyer!.uid && !buyer!.ticketId;
  const guestName = tab ? tab.guestName : buyer!.name;
  const shown = walkIn ? `לקוח בלי כרטיס: ${guestName}` : guestName;
  const list = products.items;
  const lines = list.map((p) => ({ product: p, qty: cart[p.id] || 0 })).filter((l) => l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sum = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const set = (p: Product, n: number) => { if (!saving.current) setCart((c) => ({ ...c, [p.id]: Math.max(0, n) })); };
  const resetCart = () => { cartVersion.current++; setCart({}); };
  // "נקה הכל" with undo (old stall)
  const clear = () => {
    const before = cart;
    resetCart();
    const version = cartVersion.current;
    toast.show({ text: 'העגלה נוקתה', duration: 5000, actions: [{ label: 'ביטול', onClick: () => {
      if (version !== cartVersion.current || saving.current) return;
      setCart((c) => { const back = { ...c }; for (const [pid, n] of Object.entries(before)) back[pid] = (back[pid] || 0) + n; return back; });
    } }] });
  };
  const save = async () => {
    if (!count || saving.current || !event) return;
    saving.current = true; setBusy(true);
    try {
      if (tab) {
        const total = await sellToTab(ctx.actor, tab, lines);
        resetCart();
        toast.show({ text: `נרשם ${money(total)} לחשבון של ${firstName(tab.guestName)}`, check: true });
      } else {
        const r = await sellToGuest(ctx.actor, event, tabs.items, buyer!, lines);
        resetCart();
        toast.show({ text: `נרשם ${money(r.total)} לחשבון של ${firstName(guestName)}`, check: true });
        if (r.tab) { forgetBuyer(id); navigate(`/event/stall/${r.tab.id}${qs}`, true); }
      }
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = (index: number) => {
    if (!tab) return;
    removeTabItem(ctx.actor, tab, index).catch((e) => toast.refused(`לא נשמר. ${(e as Error).message}`));
  };
  // the old stall: the crew marks an account paid on the spot (the rules allow it while the event is open)
  const markPaid = async () => {
    if (!tab || busy) return;
    setBusy(true);
    try {
      await setTabStatus(ctx.actor, tab, 'paid');
      setAccount(false);
      toast.show({ text: `${firstName(tab.guestName)} · שולם במקום`, check: true, duration: 2500 });
      navigate('/event/stall' + qs, true);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const onAccount = tab && hasTabPurchases(tab);
  return (
    <AppScreen variant="detail" bar={
      <BottomBar>
        <span className="eventday-total"><b>{money(sum)}</b><span>{itemsWord(count)}</span></span>
        <Button size="bar" grow disabled={!count || busy} onClick={() => void save()}>רישום לחשבון</Button>
      </BottomBar>
    }>
      <TopBar back={{ label: 'החלפת קונה', ...to('/event/stall' + qs) }} />
      <div className="eventday-who">
        <Avatar size={44} tone="me" initials={shortInitials(guestName, walkIn)} />
        <div className="eventday-who__body">
          <b className="eventday-who__name">{shown}</b>
          {onAccount || count > 0
            ? <UnderlineLink className="eventday-who__link" onClick={() => setAccount(true)}>{onAccount ? `כבר בחשבון: ${itemsWord(tabQty(tab))} · ${money(tab.total)}` : 'חשבון חדש, עוד לא נרשם כלום'}</UnderlineLink>
            : <span className="eventday-who__meta">חשבון חדש, עוד לא נרשם כלום</span>}
        </div>
      </div>
      {list.length === 0 && !products.loading ? <EmptyState variant="card" icon="cart" title="אין מוצרים בדוכן" text="מנהל מוסיף מוצרים במסך האירוע." /> : (
        <div className="eventday-grid">
          {list.map((p) => {
            const n = cart[p.id] || 0;
            return (
              <div key={p.id} className={`eventday-tile${n ? ' eventday-tile--on' : ''}`}>
                {/* long press takes one off (old stall) */}
                <button type="button" className="eventday-tile__head" onClick={() => set(p, n + 1)} onContextMenu={(e) => { if (n) { e.preventDefault(); set(p, n - 1); } }}
                  aria-label={`${p.name}, ${money(p.price)}${n ? `, ${n} בעגלה` : ''}`}>
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
      <AccountSheet open={account} onClose={() => setAccount(false)} tab={tab} guestName={guestName} busy={busy} cart={{ count, sum }}
        onRemove={remove} onPaid={() => void markPaid()} onClear={() => { setAccount(false); clear(); }} />
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
  const qs = q(ctx, id, params.from);
  const groups: Record<TabFilter, Tab[]> = {
    open: tabs.items.filter((t) => t.status === 'open' && hasTabPurchases(t)),
    claimed: tabs.items.filter((t) => t.status === 'claimed'),
    closed: tabs.items.filter((t) => t.status === 'paid' || t.status === 'waived'),
  };
  // Guests with a ticket first, largest amount first (who to remind); walk-ins at the end.
  const shown = [...groups[filter]].sort((a, b) => Number(isWalkInTab(a)) - Number(isWalkInTab(b)) || b.total - a.total);
  const toTab = (t: Tab) => (ctx.manager ? `/manage/events/${id}/tabs/${t.id}` : `/event/stall/${t.id}${qs}`);
  const sum = ctx.manager ? stallSummary(tabs.items, ctx.today) : null;
  return (
    <AppScreen variant="detail">
      <TopBar back={managed ? { label: event.title, ...to(`/manage/events/${id}`) } : { label: 'דוכן', ...to('/event/stall' + qs) }} />
      <PageTitle>חשבונות הדוכן</PageTitle>
      {sum && (
        <StatRow>
          <StatTile value={money(sum.openTotal)} label="פתוחים" small />
          <StatTile value={sum.openCount} label="חשבונות פתוחים" small />
          <StatTile value={money(sum.soldToday)} label="נמכרו היום" small />
        </StatRow>
      )}
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

/** Q29: the buyer's account for the crew. Each line with a quiet "הסרה", the total, "שילם עכשיו" and "סגירה".
 *  The cart (not yet on the account) can be cleared from here; the undo toast brings it back. */
function AccountSheet({ open, onClose, tab, guestName, busy, cart, onRemove, onPaid, onClear }: {
  open: boolean; onClose: () => void; tab: Tab | null; guestName: string; busy: boolean; cart: { count: number; sum: number };
  onRemove: (index: number) => void; onPaid: () => void; onClear: () => void;
}) {
  const lines = tab ? tab.items.map((item, index) => ({ item, index })).reverse() : [];
  const total = tab?.total || 0;
  const who = (name: string) => `${gw(name, 'רשם', 'רשמה')} ${firstName(name)}`;
  return (
    <Sheet open={open} onClose={onClose} title={`החשבון של ${firstName(guestName)}`} sub={`${itemsWord(tab ? tabQty(tab) : 0)} · עוד לא שולם`}>
      <div className="eventday-sheetbody">
        {lines.length > 0 ? (
          <ListCard aria-label="בחשבון">
            {lines.map(({ item, index }) => (
              <Row key={`${item.at}-${index}`} minHeight={58} title={`${item.name}${item.qty > 1 ? ` ×${item.qty}` : ''}`}
                meta={`${hhmm(item.at)}${item.by?.name ? ` · ${who(item.by.name)}` : ''}`} value={money(item.price * item.qty)}
                actions={<Button variant="quiet" disabled={busy} aria-label={`הסרה: ${item.name}`} onClick={() => onRemove(index)}>הסרה</Button>} />
            ))}
          </ListCard>
        ) : <p className="eventday-accountline">עוד לא נרשם כלום</p>}
        <div className="eventday-accounttotal"><span>סך הכל בחשבון</span><b>{money(total)}</b></div>
        {cart.count > 0 && (
          <div className="eventday-accountcart">
            <span>בעגלה, עוד לא נרשם: {itemsWord(cart.count)} · {money(cart.sum)}</span>
            <Button variant="quiet" disabled={busy} onClick={onClear}>נקה הכל</Button>
          </div>
        )}
        <div className="eventday-accountbar">
          {tab && total > 0 && <Button size="bar" grow icon="check" disabled={busy} onClick={onPaid}>שילם עכשיו · {money(total)}</Button>}
          <Button size="bar" variant="secondary" grow={!(tab && total > 0)} onClick={onClose}>סגירה</Button>
        </div>
      </div>
    </Sheet>
  );
}
