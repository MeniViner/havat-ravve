// One event, from the vendor's side: D1 invitation, D2 what the stall needs, D4 event details, D9 summary after the event.
import { useEffect, useState } from 'react';
import {
  BottomBar, Button, ChoiceChip, DetailList, DetailRow, EmptyState, Field, FormHeader, Hero, Icon, PageTitle, Quote, StatRow, StatTile, Stepper,
  TextAreaField, Toggle,
} from '../../kit';
import { AppScreen, useToast, useExternal } from '../../core';
import { navigate, back } from '../../../router';
import { nowMs } from '../../../clock';
import { isConflict } from '../../../db';
import { ddmm, inDays, longDate, dayName, num } from '../../format';
import {
  useVendorDoc, useEventDoc, useEventVendor, useVendorInfo, useLive, usePublishedEvents, declineInvite, confirmWithNeeds, saveFeedback, markGuidelinesRead,
  hours, setupTime, vehiclesUntil, answerBy, needsText, dayShort, first, g, phaseOf, NEED_ORDER, type NeedsForm, type VendorDoc, type EventVendorDoc, type VendorInfo,
} from '../../data/vendor';
import { NEED_LABELS, type FarmEvent, type VendorNeed } from '../../../types';
import { VendorTop, FarmWa, Countdown, SpotCard, Timeline, ContactCard, statusTag, Quiet } from './parts';
import type { ScreenProps, V2Ctx } from '../../ctx';

/** Loads the vendor, the event, the record and the brief for one event route. */
function useOne(ctx: V2Ctx, eid: string) {
  const v = useVendorDoc(ctx.vendorId); const e = useEventDoc(eid); const r = useEventVendor(eid, ctx.vendorId); const i = useVendorInfo(eid);
  return { v: v.item, e: e.item, rec: r.item, info: i.item, loading: v.loading || e.loading || r.loading || i.loading };
}
/** Not invited to this event (or it was removed): the vendor sees nothing of it. */
function NotInvited({ form }: { form?: boolean }) {
  return (
    <AppScreen variant={form ? 'form' : 'detail'} gap={10} noNav={form}>
      <VendorTop />
      <EmptyState variant="card" icon="calendar" title="האירוע הזה לא אצלך" text="אולי ההזמנה בוטלה. אפשר לכתוב לחווה בוואטסאפ." />
    </AppScreen>
  );
}
const errText = (e: unknown) => (isConflict(e) ? undefined : `לא נשמר. ${(e as Error).message}`);

// ---------- D1 ----------
export function VendorInvite({ ctx, params }: ScreenProps) {
  const eid = params.eventId || '';
  const { v, e, rec, info, loading } = useOne(ctx, eid);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (loading) return <AppScreen variant="plain" gap={12} noNav><Quiet text="טוען את ההזמנה..." /></AppScreen>;
  if (!v || !e || !rec) return <NotInvited />;
  const name = first(v.contact || ctx.actor.name);
  const closed = phaseOf(e) === 'past' || (e as { closed?: unknown }).closed;
  const lastDay = answerBy(e, info);
  const late = new Date(`${lastDay}T23:59:59`).getTime() < nowMs();
  const decline = async () => {
    setBusy(true);
    try { await declineInvite(ctx, e, v, rec, info); toast.show({ text: 'תודה שעדכנת. נשמח לראות אותך בפעם הבאה' }); navigate('/vendor', true); }
    catch (err) { toast.refused(errText(err)); }
    finally { setBusy(false); }
  };
  const bar = ctx.helper || closed ? undefined : (
    <BottomBar>
      <Button size="bar" grow icon="check" onClick={() => navigate(`/vendor/events/${eid}/needs`)} disabled={busy}>מגיעים</Button>
      <Button variant="secondary" size="bar" onClick={decline} disabled={busy || rec.status === 'declined'} style={{ fontWeight: 600 }}>לא הפעם</Button>
    </BottomBar>
  );
  return (
    <AppScreen variant="plain" gap={12} bar={bar} noNav bodyStyle={{ paddingTop: 14 }}>
      <div className="vendor-farm">
        <span className="vendor-farm__name"><span className="vendor-farm__logo"><Icon name="farm" size={18} /></span>חוות רווה</span>
        <FarmWa />
      </div>
      <div className="vendor-titles">
        <span className="vendor-titles__over">הזמנה לדוכן · {v.name}</span>
        <h1 className="vendor-h1-28">{name}, רוצים אותך ב{e.title}</h1>
      </div>
      <Hero className="vendor-hero" style={{ flexDirection: 'row', alignItems: 'center' }} aria-label={e.title}>
        <div className="vendor-titles" style={{ flex: 1 }}>
          <b className="vendor-hero__when">{dayName(e.start)}, {longDate(e.start)}</b>
          <span className="vendor-hero__line"><span dir="ltr">{hours(e)}</span> · הקמה מ־{setupTime(e, info)}</span>
        </div>
        <Countdown iso={e.start} />
      </Hero>
      <DetailList className="vendor-dl50">
        {rec.invitedBy?.name && <DetailRow term="מזמין">{rec.invitedBy.name}</DetailRow>}
        {!!info?.expected && <DetailRow term="צפי">כ־{num(info.expected)} מבקרים</DetailRow>}
        {info?.provided && <DetailRow term="מקבלים">{info.provided}</DetailRow>}
        {e.location && <DetailRow term="איפה">{e.location}</DetailRow>}
      </DetailList>
      {(rec.inviteNote || info?.note) && <Quote>{rec.inviteNote || info?.note}</Quote>}
      <span className="vendor-note">
        {closed ? 'האירוע הסתיים.' : late ? 'כבר מאוחר לשנות כאן. כותבים לחווה בוואטסאפ.'
          : rec.status === 'declined' ? 'ענית שלא הפעם. אפשר עדיין להגיד שמגיעים.' : `אפשר לשנות את התשובה עד ${ddmm(lastDay)}.`}
      </span>
    </AppScreen>
  );
}

// ---------- D2 ----------
export function VendorNeeds({ ctx, params }: ScreenProps) {
  const eid = params.id || '';
  const { v, e, rec, info, loading } = useOne(ctx, eid);
  if (loading) return <AppScreen variant="form" gap={14} noNav><Quiet text="טוען..." /></AppScreen>;
  if (!v || !e || !rec || ctx.helper) return <NotInvited form />;
  return <NeedsFormScreen ctx={ctx} v={v} e={e} rec={rec} info={info} />;
}
function NeedsFormScreen({ ctx, v, e, rec, info }: { ctx: V2Ctx; v: VendorDoc; e: FarmEvent; rec: EventVendorDoc; info: VendorInfo | null }) {
  const toast = useToast();
  const answered = rec.status === 'confirmed';
  const [f, setF] = useState<NeedsForm>(() => ({
    sells: (answered ? rec.sells : v.sells || v.product || rec.sells) || '',
    needs: (answered ? rec.needs : v.needs || rec.needs) || [],
    people: Math.max(1, rec.people || 1),
    withVehicle: rec.withVehicle ?? !!rec.vehicle,
    note: answered ? rec.note || '' : '',
  }));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const toggle = (n: VendorNeed) => setF((s) => ({ ...s, needs: s.needs.includes(n) ? s.needs.filter((x) => x !== n) : [...s.needs, n] }));
  const send = async () => {
    if (!f.sells.trim()) { setErr('כתבו בקצרה מה מוכרים'); return; }
    setBusy(true);
    try {
      await confirmWithNeeds(ctx, e, v, rec, info, f);
      toast.show({ text: answered ? 'עודכן. החווה רואה את השינוי' : `מעולה, אישרת הגעה ל${e.title}`, check: true });
      navigate(`/vendor/events/${e.id}`, true);
    } catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  const bar = <BottomBar><Button size="bar" grow onClick={send} disabled={busy}>שליחה לחווה</Button></BottomBar>;
  return (
    <AppScreen variant="form" gap={14} bar={bar}>
      <FormHeader title="מה צריך בדוכן" onCancel={() => back(`/vendor/invite/${e.id}`)} />
      <Field label="מה מוכרים" value={f.sells} onChange={(x) => { setF({ ...f, sells: x.target.value }); setErr(''); }} error={err || undefined} maxLength={120} />
      <div className="k-group">
        <span className="k-group__label" id="vendor-needs">מה צריך מהחווה</span>
        <div className="k-chips k-chips--wrap" role="group" aria-labelledby="vendor-needs">
          {NEED_ORDER.map((n) => <ChoiceChip key={n} selected={f.needs.includes(n)} onClick={() => toggle(n)}>{NEED_LABELS[n]}</ChoiceChip>)}
        </div>
      </div>
      <div className="vendor-stepcard">
        <span className="vendor-stepcard__label" id="vendor-people">כמה אנשים בדוכן</span>
        <Stepper value={f.people} onChange={(people) => setF({ ...f, people })} min={1} max={12} showValue decLabel="פחות" incLabel="עוד" />
      </div>
      <div className="vendor-togglecard">
        <div className="vendor-togglecard__body">
          <span className="vendor-togglecard__title" style={{ fontWeight: 500 }}>מגיעים עם רכב לפריקה</span>
          <span className="vendor-togglecard__meta">כניסת רכבים עד {vehiclesUntil(e, info)}</span>
        </div>
        <Toggle checked={f.withVehicle} onChange={(withVehicle) => setF({ ...f, withVehicle })} label="מגיעים עם רכב לפריקה" />
      </div>
      <TextAreaField label="משהו שחשוב שנדע" placeholder="למשל: מגיע עם מקרר" value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} maxLength={500} />
      <span className="vendor-note">הפרטים נשמרים גם להזמנות הבאות.</span>
    </AppScreen>
  );
}

// ---------- D4 ----------
export function VendorEvent({ ctx, params }: ScreenProps) {
  const eid = params.id || '';
  const { v, e, rec, info, loading } = useOne(ctx, eid);
  const open = useExternal();
  // after the event, D4 hands over to the summary (after render, not during it)
  const past = !loading && !!v && !!e && !!rec && phaseOf(e) === 'past';
  useEffect(() => { if (past) navigate(`/vendor/events/${eid}/summary`, true); }, [past, eid]);
  if (loading) return <AppScreen variant="detail" gap={10}><VendorTop /><Quiet text="טוען את האירוע..." /></AppScreen>;
  if (!v || !e || !rec) return <NotInvited />;
  if (past) return null;
  const guide = info?.guidelines;
  const gotNeeds = needsText(rec.needs);
  return (
    <AppScreen variant="detail" gap={10}>
      <VendorTop />
      <div className="vendor-titles">
        <span className="vendor-titles__over">{dayShort(e.start)} · {inDays(e.start)}</span>
        <div className="vendor-titlerow"><PageTitle size="detail">{e.title}</PageTitle>{statusTag(rec)}</div>
      </div>
      {rec.status === 'invited' && !ctx.helper && (
        <Button size="tall" block icon="check" onClick={() => navigate(`/vendor/invite/${eid}`)}>לענות להזמנה</Button>
      )}
      <SpotCard rec={rec} info={info} />
      <Timeline e={e} info={info} title="היום שלך" />
      {(gotNeeds || info?.bring) && (
        <DetailList className="vendor-dl50">
          {gotNeeds && <DetailRow term="מקבלים">{gotNeeds}</DetailRow>}
          {info?.bring && <DetailRow term="להביא">{info.bring}</DetailRow>}
        </DetailList>
      )}
      <ContactCard info={info} />
      <div className="vendor-actions">
        <Button variant="outline" size="tall" icon="nav" iconSize={18} onClick={() => open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location || 'חוות רווה')}`)}>ניווט לחווה</Button>
        {guide?.url && <Button variant="outline" size="tall" icon="file" iconSize={18} onClick={() => { open(guide.url); void markGuidelinesRead(eid, v.id); }}>ההנחיות</Button>}
        {!ctx.helper && rec.status !== 'invited' && <Button variant="quiet" onClick={() => navigate(`/vendor/invite/${eid}`)}>שינוי תשובה</Button>}
      </div>
    </AppScreen>
  );
}

// ---------- D9 ----------
const RATES: { v: number; label: string }[] = [{ v: 5, label: 'מצוין' }, { v: 3, label: 'בסדר' }, { v: 1, label: 'פחות' }];
export function VendorSummary({ ctx, params }: ScreenProps) {
  const eid = params.id || '';
  const { v, e, rec, info, loading } = useOne(ctx, eid);
  if (loading) return <AppScreen variant="detail" gap={12} noNav><VendorTop /><Quiet text="טוען את הסיכום..." /></AppScreen>;
  if (!v || !e || !rec) return <NotInvited />;
  return <Summary ctx={ctx} v={v} e={e} rec={rec} info={info} />;
}
function Summary({ ctx, v, e, rec, info }: { ctx: V2Ctx; v: VendorDoc; e: FarmEvent; rec: EventVendorDoc; info: VendorInfo | null }) {
  const toast = useToast();
  const live = useLive(e.id, !info?.visitors).item;
  const pub = usePublishedEvents(true);
  const nextEvent = pub.items.filter((x) => x.stall !== false && new Date(x.start).getTime() > nowMs()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const fb = rec.feedback;
  const [rating, setRating] = useState<number | null>(fb?.rating ?? null);
  const [text, setText] = useState(fb?.text || '');
  const [next, setNext] = useState(fb?.inviteNext ?? v.inviteNext ?? true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const visitors = info?.visitors ?? live?.entered;
  const mine = (v.events || []).length;
  const ended = phaseOf(e) === 'past';
  const send = async () => {
    if (rating === null) { setErr('בחרו איך היה'); return; }
    setBusy(true);
    try { await saveFeedback(ctx, e, v, rec, info, { rating, text, inviteNext: next }); toast.show({ text: 'תודה. החווה קיבלה את המשוב', check: true }); navigate('/vendor', true); }
    catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  const canSend = !ctx.helper && rec.status === 'confirmed';
  const bar = canSend ? <BottomBar><Button size="bar" grow onClick={send} disabled={busy}>{fb ? 'עדכון המשוב' : 'שליחה לחווה'}</Button></BottomBar> : undefined;
  return (
    <AppScreen variant="detail" gap={12} bar={bar} noNav={!bar}>
      <VendorTop />
      <div className="vendor-titles">
        <span className="vendor-titles__over">{e.title} · {dayShort(e.start)} · {ended ? 'הסתיים' : inDays(e.start)}</span>
        <PageTitle size="detail" style={{ lineHeight: 1.15 }}>{`תודה, ${first(v.contact || ctx.actor.name)}`}</PageTitle>
      </div>
      <StatRow>
        {visitors !== undefined && <StatTile value={num(visitors)} label="מבקרים" />}
        {!!info?.stalls && <StatTile value={info.stalls} label="דוכנים" />}
        <StatTile value={mine} label={mine === 1 ? 'אירוע שלך' : 'אירועים שלך'} />
      </StatRow>
      {info?.thanks && <Quote>{info.thanks}</Quote>}
      {canSend && <>
        <div className="vendor-rate">
          <span className="vendor-rate__label" id="vendor-rate">איך היה לך?</span>
          <div className="vendor-rate__row" role="radiogroup" aria-labelledby="vendor-rate">
            {RATES.map((r) => <ChoiceChip key={r.v} radio tall fill selected={rating === r.v} onClick={() => { setRating(r.v); setErr(''); }}>{r.label}</ChoiceChip>)}
          </div>
          {err && <span className="k-field__error" role="alert">{err}</span>}
        </div>
        <TextAreaField label="מה היה עוזר לך בפעם הבאה" placeholder="למשל: מקום קרוב יותר לחשמל" height={76} value={text} onChange={(x) => setText(x.target.value)} maxLength={500} />
        <div className="vendor-togglecard">
          <div className="vendor-togglecard__body">
            <span className="vendor-togglecard__title">להזמין אותי לאירוע הבא</span>
            <span className="vendor-togglecard__meta">{nextEvent ? `${nextEvent.title} · ${ddmm(nextEvent.start)}` : 'החווה רואה שאתם מעוניינים'}</span>
          </div>
          <Toggle checked={next} onChange={setNext} label="להזמין אותי לאירוע הבא" />
        </div>
      </>}
      {!canSend && rec.status !== 'confirmed' && <span className="vendor-note">לא השתתפתם באירוע הזה.</span>}
    </AppScreen>
  );
}
