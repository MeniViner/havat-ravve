// E2-Scan, E3-Ok, E4-Pay, E5-Bad (one route, full-bleed, no AppScreen) and E6-Search.
// A valid ticket is let in at once (optimistic; the transaction refuses a second gate's copy -> X1). Unpaid shows E4,
// cancelled or unknown shows E5 and is logged as a rejected scan. Works offline: the ticket list is on the phone.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GateCamera, GateResult, GateButton, TopBar, PageTitle, SearchField, SectionTitle, ListCard, Row, Tag, Button, Sheet, Field, Stepper, BottomBar } from '../../kit';
import { AppScreen, useToast, useV2 } from '../../core';
import { hhmm, money } from '../../format';
import { isConflict } from '../../../db';
import { nowIso } from '../../../clock';
import { useDemo } from '../../../demo/store';
import { navigate } from '../../../router';
import type { ScreenProps, V2Ctx } from '../../ctx';
import {
  useEventTickets, useScans, useCounters, judge, judgeCode, admit, logRejected, admitWalkIn, ensureCounters, groupOrders, orderName, ticketMatcher,
  ticketWord, isUnpaid, qrPayload, DEMO_QR, isEventClosed, type EventV2, type TicketV2, type Verdict, type ScanV2,
} from '../../data/eventday';
import { useRouteEvent, NoEvent, GateToasts, useCamera, useDebounce, to } from './common';

type View = { tone: 'ok'; name: string; detail: string } | { tone: 'pay' | 'bad'; v: Verdict };
const RESULT_WORD: Record<ScanV2['result'], string> = { ok: 'מאושר', paidAtGate: 'שולם בשער', payLater: 'ישלמו אחר כך', rejected: 'נדחה' };

/** The gate's decisions, shared by the camera (E2) and the name search (E6). */
function useGate(ctx: V2Ctx, event: EventV2 | null, tickets: TicketV2[]) {
  const toast = useToast();
  const [view, setView] = useState<View | null>(null);
  const [mine, setMine] = useState<{ name: string; result: ScanV2['result']; at: string } | null>(null);
  const note = (name: string, result: ScanV2['result']) => setMine({ name, result, at: nowIso() });
  const okDetail = (t: TicketV2) => `${t.total === 1 ? 'כרטיס אחד' : `כרטיס ${t.index} מתוך ${t.total}`} · ${(t.entries || 0) === 0 ? 'כניסה ראשונה' : `כניסה ${(t.entries || 0) + 1}, יצא וחזר`}`;
  const letIn = (t: TicketV2, order: TicketV2[], pay: 'none' | 'gate' | 'later') => {
    if (!event) return;
    setView({ tone: 'ok', name: t.holderName || t.ownerName, detail: okDetail(t) });
    note(t.holderName || t.ownerName, pay === 'gate' && order.some(isUnpaid) ? 'paidAtGate' : pay === 'later' && order.some(isUnpaid) ? 'payLater' : 'ok');
    admit(ctx.actor, event, t, order, pay).catch((e) => { setView(null); if (isConflict(e)) toast.refused(); else toast.refused(`לא נשמר. ${(e as Error).message}`); });
  };
  const show = (v: Verdict) => {
    if (!event) return;
    if (v.kind === 'ok') return letIn(v.ticket, v.order, 'none');
    setView({ tone: v.kind, v });
    if (v.kind === 'bad') note(v.name || 'לא מזוהה', 'rejected');
    if (v.kind === 'bad') logRejected(ctx.actor, event, { ticket: v.ticket, name: v.name, reason: v.reason }).catch(() => {});
  };
  return {
    view, mine, clear: () => setView(null),
    scan: (code: string) => { if (event) show(judgeCode(code, tickets, event.id)); },
    open: (t: TicketV2) => { if (event) show(judge(t, tickets, event.id)); },
    paid: () => { if (view?.tone === 'pay' && view.v.kind === 'pay') letIn(view.v.ticket, view.v.order, 'gate'); },
    later: () => { if (view?.tone === 'pay' && view.v.kind === 'pay') letIn(view.v.ticket, view.v.order, 'later'); },
    refuse: () => {
      if (view?.tone === 'pay' && view.v.kind === 'pay') note(view.v.name, 'rejected');
      if (event && view?.tone === 'pay' && view.v.kind === 'pay') logRejected(ctx.actor, event, { ticket: view.v.ticket, reason: 'לא שולם', meta: `לא שולם · ${money(view.v.amount)}` }).catch(() => {});
      setView(null);
    },
    walkIn: (g: { name: string; phone: string; count: number }, pay: 'gate' | 'later') => {
      if (!event) return;
      setView({ tone: 'ok', name: g.name, detail: `${ticketWord(g.count)} · כניסה ראשונה` });
      note(g.name, (event.price || 0) ? (pay === 'gate' ? 'paidAtGate' : 'payLater') : 'ok');
      admitWalkIn(ctx.actor, event, g, pay).catch((e) => { setView(null); if (isConflict(e)) toast.refused(); else toast.refused(`לא נשמר. ${(e as Error).message}`); });
    },
  };
}

/** E3 / E4 / E5 as one full-bleed page. */
function ResultPage({ view, place, origin, onNext, onPaid, onLater, onRefuse, onSearch }: { view: View; place: string; origin: 'scan' | 'search'; onNext: () => void; onPaid: () => void; onLater: () => void; onRefuse: () => void; onSearch: () => void }) {
  const { settings } = useV2();
  const [left, setLeft] = useState(3);
  useEffect(() => {
    if (view.tone !== 'ok') return;
    setLeft(3);
    const started = performance.now();
    const tick = setInterval(() => setLeft(Math.max(1, Math.ceil((3000 - (performance.now() - started)) / 1000))), 250);
    const done = setTimeout(onNext, 3000);
    return () => { clearInterval(tick); clearTimeout(done); };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = origin === 'scan' ? 'לסריקה' : 'לחיפוש';
  if (view.tone === 'ok') {
    return <><GateResult tone="ok" place={place} headline="מאושר" name={view.name} detail={view.detail}
      actions={<GateButton onClick={onNext}>הבא</GateButton>} note={`חוזר ${back} בעוד ${left === 1 ? 'שנייה' : `${left} שניות`}`} /><GateToasts /></>;
  }
  const v = view.v;
  if (v.kind === 'pay') {
    const p = settings.payment;
    const methods = [p.bit && <>ביט <span className="k-ltr">{p.bit}</span></>, p.paybox && 'PayBox', p.cash && 'מזומן'].filter(Boolean);
    return <><GateResult tone="pay" place={place} prelude="נשאר לשלם" amount={money(v.amount)} name={v.name} detail={v.detail}
      extra={methods.length ? methods.map((m, i) => <span key={i}>{i > 0 && ' · '}{m}</span>) : undefined}
      actions={<><GateButton variant="dark" icon="check" onClick={onPaid}>שולם, להכניס</GateButton><GateButton variant="outline" onClick={onLater}>להכניס, ישלמו אחר כך</GateButton><GateButton variant="link" onClick={onRefuse}>לא להכניס</GateButton></>} /><GateToasts /></>;
  }
  if (v.kind !== 'bad') return null;
  return <><GateResult tone="bad" place={place} headline={v.headline} headlineSize="md" name={v.name} detail={v.detail}
    actions={origin === 'scan'
      ? <><GateButton icon="search" iconSize={26} onClick={onSearch}>חיפוש בשם</GateButton><GateButton variant="outline" onClick={onNext}>לסרוק שוב</GateButton></>
      : <GateButton onClick={onNext}>חזרה לחיפוש</GateButton>} /><GateToasts /></>;
}

const gateQuery = (ctx: V2Ctx, id: string, from?: string) => (id === ctx.eventToday?.id && !from ? '' : `?e=${id}${from ? `&from=${from}` : ''}`);

/** E2-E5 */
export function GateScreen({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const last = useScans(id, 1);
  const counters = useCounters(id);
  const demo = useDemo().on;
  const gate = useGate(ctx, event, tickets.items);
  const cam = useCamera(demo);
  const fresh = useDebounce();
  useEffect(() => { if (id && !counters.loading && !counters.item && event && !isEventClosed(event)) ensureCounters(id); }, [id, counters.loading, counters.item, event]);
  if (!event || isEventClosed(event) || event.entry === false) return <NoEvent loading={loading} closed={isEventClosed(event)} back="/event" backLabel="אירוע" />;
  const q = gateQuery(ctx, id, params.from);
  const place = `שער · ${event.title}`;
  const onCode = (code: string) => { if (!gate.view && fresh(code)) gate.scan(code); };
  const tap = (code: string) => { if (!gate.view) gate.scan(code); }; // demo buttons: a deliberate tap, no camera debounce
  if (gate.view) {
    return <ResultPage view={gate.view} place={place} origin="scan" onNext={gate.clear} onPaid={gate.paid} onLater={gate.later} onRefuse={gate.refuse}
      onSearch={() => { gate.clear(); navigate('/event/gate/search' + q); }} />;
  }
  const q0 = last.items[0];
  const l = gate.mine && (!q0 || gate.mine.at >= q0.at) ? gate.mine : q0;
  const demoCode = (tid: string) => { const t = tickets.items.find((x) => x.id === tid); return t ? qrPayload(t) : `HR1|${tid}|00`; };
  return (
    <>
      <GateCamera place={place} onExit={() => navigate(params.from === 'live' || ctx.eventToday?.id !== id ? `/manage/events/${id}/live` : '/event')}
        hint={cam.error || undefined} showHint={demo || !!cam.error}
        lastScan={l ? { text: `הקודם: ${l.name} · ${RESULT_WORD[l.result]}`, time: hhmm(l.at), tone: l.result === 'rejected' ? 'bad' : l.result === 'payLater' ? 'pay' : 'ok' } : undefined}
        onSearch={() => navigate('/event/gate/search' + q)}>
        {cam.render(onCode)}
        {demo && (
          <div className="eventday-demoqr" role="group" aria-label="קודים להדגמה">
            <button type="button" className="eventday-demoqr__btn" onClick={() => tap(demoCode(DEMO_QR.ok))}>QR תקין</button>
            <button type="button" className="eventday-demoqr__btn" onClick={() => tap(demoCode(DEMO_QR.pay))}>QR לא שולם</button>
            <button type="button" className="eventday-demoqr__btn" onClick={() => tap(demoCode(DEMO_QR.bad))}>QR מבוטל</button>
          </div>
        )}
      </GateCamera>
      <GateToasts />
    </>
  );
}

/** E6-Search: by name or phone, one row per order. */
export function GateSearch({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const tickets = useEventTickets(id);
  const gate = useGate(ctx, event, tickets.items);
  const [q, setQ] = useState('');
  const [walk, setWalk] = useState(false);
  const orders = useMemo(() => groupOrders(tickets.items), [tickets.items]);
  if (!event || isEventClosed(event) || event.entry === false) return <NoEvent loading={loading} closed={isEventClosed(event)} back="/event" backLabel="אירוע" />;
  const qs = gateQuery(ctx, id, params.from);
  if (gate.view) {
    return <ResultPage view={gate.view} place={`שער · ${event.title}`} origin="search" onNext={gate.clear} onPaid={gate.paid} onLater={gate.later} onRefuse={gate.refuse} onSearch={gate.clear} />;
  }
  const match = ticketMatcher(q);
  const found = q.trim() ? orders.filter((o) => o.tickets.some(match)).sort((a, b) => a.first.createdAt.localeCompare(b.first.createdAt)).slice(0, 8) : [];
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'למצלמה', ...to('/event/gate' + qs) }} />
      <PageTitle>מי בכניסה?</PageTitle>
      <SearchField label="שם או טלפון" value={q} active={!!q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {q.trim() && <SectionTitle>{found.length === 0 ? 'לא נמצא' : found.length === 1 ? 'התאמה אחת' : `${found.length} התאמות`}</SectionTitle>}
      {found.length > 0 && (
        <ListCard>
          {found.map((o) => {
            const unpaid = o.unpaid.length > 0;
            const candidates = o.valid.filter(match).length ? o.valid.filter(match) : o.valid;
            const next = candidates.find((t) => !(t.entries || 0)) || candidates[0];
            const status = o.valid.length > 1 ? (o.entered === 0 ? 'עוד לא נכנסו' : o.entered === o.valid.length ? 'כולם נכנסו' : `נכנסו ${o.entered} מתוך ${o.valid.length}`) : (o.entered ? 'נכנס' : 'עוד לא נכנס');
            const tag = o.cancelled ? <Tag tone="urgent">בוטל</Tag> : unpaid ? <Tag tone="waiting">{money(o.unpaid.reduce((s, t) => s + (t.price || 0), 0))}</Tag> : o.valid.some((t) => t.payLater && t.paymentStatus === 'pending') ? <Tag tone="waiting">ישלמו אחר כך</Tag> : <Tag tone="paid">שולם</Tag>;
            return (
              <Row key={o.id} minHeight={72} title={orderName(o)} tags={tag}
                meta={<>{ticketWord(o.valid.length || o.tickets.length)} · <span className="k-ltr">{o.first.ownerPhone}</span>{!unpaid && !o.cancelled ? ` · ${status}` : ''}</>}
                actions={next && !o.cancelled ? (unpaid
                  ? <Button variant="outline" size="tall" onClick={() => gate.open(next)}>פתיחה</Button>
                  : <Button size="tall" onClick={() => gate.open(next)}>להכניס</Button>) : undefined} />
            );
          })}
        </ListCard>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} onClick={() => setWalk(true)}>אורח בלי כרטיס</Button>
      <WalkInSheet open={walk} price={event.price || 0} onClose={() => setWalk(false)} onDone={(g, pay) => { setWalk(false); gate.walkIn(g, pay); }} />
    </AppScreen>
  );
}

/** "אורח בלי כרטיס" at the gate (not designed: a short sheet in the tone of E4). */
function WalkInSheet({ open, price, onClose, onDone }: { open: boolean; price: number; onClose: () => void; onDone: (g: { name: string; phone: string; count: number }, pay: 'gate' | 'later') => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [count, setCount] = useState(1);
  const ok = !!name.trim();
  const done = (pay: 'gate' | 'later') => { if (!ok) return; onDone({ name: name.trim(), phone: phone.trim(), count }, pay); setName(''); setPhone(''); setCount(1); };
  return (
    <Sheet open={open} onClose={onClose} title="אורח בלי כרטיס" aside={price ? `${money(price * count)} לתשלום` : undefined}>
      <Field label="שם" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="טלפון" ltr inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="eventday-sheetrow"><span className="k-field__label">כמה נכנסים</span><Stepper size="lg" value={count} min={1} max={20} onChange={setCount} decLabel="פחות אנשים" incLabel="עוד אדם" /></div>
      <BottomBar column className="eventday-sheetbar">
        {price ? <>
          <Button size="bar" block icon="check" disabled={!ok} onClick={() => done('gate')}>שולם, להכניס</Button>
          <Button variant="outline" size="tall" block disabled={!ok} onClick={() => done('later')}>להכניס, ישלמו אחר כך</Button>
        </> : <Button size="bar" block icon="check" disabled={!ok} onClick={() => done('gate')}>להכניס</Button>}
      </BottomBar>
    </Sheet>
  );
}
