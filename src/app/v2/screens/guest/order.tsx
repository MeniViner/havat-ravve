// U3 GuestOrder (ordering opens signed out; the bar signs in on the spot) and U4 GuestPay (after ordering, and from "לתשלום").
import { useState } from 'react';
import { useEventClock } from '../../data/eventClock';
import { AppScreen, go, useToast } from '../../core';
import { Button, BottomBar, EmptyState, Field, FormHeader, MoreDetails, TopBar } from '../../kit';
import { useEvent, orderTickets, claimOrderPaid, contactPhoneOk } from '../../../data';
import { authErrorMessage } from '../../../firebase';
import { back } from '../../../router';
import { dayName, longDate, money } from '../../format';
import { type GuestCtx, isPast, paths, useMine, useReceiptChoice, saveReceipt, useSignIn, ticketsWord, dayShort, orderState } from './data';
import { StepperCard, TotalBlock, ReceiptSelect, Note, PayBlock, CheckHead } from './parts';

export function OrderPage({ ctx, id }: { ctx: GuestCtx; id: string }) {
  const { item: e, loading } = useEvent(id);
  useEventClock([e?.end || '']);
  const [nameDraft, setName] = useState<string | null>(null);
  const [phoneDraft, setPhone] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [holders, setHolders] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const choice = useReceiptChoice(ctx.profile);
  const sign = useSignIn();
  const toast = useToast();
  const cancel = () => back(`/events/${id}`);
  if (loading) return <AppScreen variant="form" />;
  if (!e || !e.published) return <AppScreen variant="form"><FormHeader title="הזמנת כרטיסים" onCancel={cancel} /><EmptyState variant="fill" icon="calendar" title="האירוע לא נמצא" /></AppScreen>;
  const closed = isPast(e) || ('closed' in e && !!e.closed) || !e.open;
  if (closed) return <AppScreen variant="detail"><FormHeader title={e.title} onCancel={cancel} /><EmptyState icon="calendar" title={isPast(e) ? 'האירוע הסתיים' : 'ההרשמה סגורה'} /></AppScreen>;
  const fullName = (nameDraft ?? ctx.profile?.displayName ?? '').trim();
  const phone = (phoneDraft ?? ctx.profile?.phone ?? '').trim();
  const paid = e.price > 0;
  const total = e.price * count;
  const missing = (e.questions || []).filter((q) => q.required && !(answers[q.id] || '').trim());
  const order = async () => {
    if (!ctx.profile) { void sign.go(); return; }
    if (!fullName || !contactPhoneOk(phone) || missing.length || isPast(e)) return;
    setBusy(true);
    try {
      if (paid) await saveReceipt(ctx.profile, choice.method);
      const r = await orderTickets({ ...ctx.profile, displayName: fullName, phone }, e, count, [fullName, ...holders], answers);
      if (paid) go(`/me/orders/${r.orderId}/pay`, true);
      else { toast.show({ text: 'נרשמתם! הכרטיסים בטלפון.', check: true }); go(paths(ctx).tickets, true); }
    } catch (err) { toast.refused(`לא נשמר. ${authErrorMessage(err)}`); }
    finally { setBusy(false); }
  };
  const label = paid ? `הזמנה · ${money(total)}` : 'הרשמה';
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar column={!ctx.profile}>
      <Button size="bar" grow={!!ctx.profile} block={!ctx.profile} disabled={busy || sign.busy || (!!ctx.profile && (!fullName || !contactPhoneOk(phone) || missing.length > 0 || (paid && choice.missing)))} onClick={order}>{label}</Button>
      {!ctx.profile && <span className="k-note guest-barnote">{sign.error || 'בפעם הראשונה נכנסים עם Google וממלאים פרטי הרשמה.'}</span>}
    </BottomBar>}>
      <FormHeader title={paid ? 'הזמנת כרטיסים' : 'הרשמה'} onCancel={cancel} />
      <span className="guest-sub">{e.title} · {dayName(e.start)} {longDate(e.start)}</span>
      <Field label="שם מלא (חובה)" value={nameDraft ?? ctx.profile?.displayName ?? ''} autoComplete="name" maxLength={80} onChange={(ev) => setName(ev.target.value)} />
      <Field label="טלפון (חובה)" ltr inputMode="tel" autoComplete="tel" maxLength={25} value={phoneDraft ?? ctx.profile?.phone ?? ''} onChange={(ev) => setPhone(ev.target.value)} />
      <StepperCard label="כמה כרטיסים" meta={`עד ${e.maxPerOrder} בהזמנה`} value={count} onChange={setCount} min={1} max={Math.max(1, e.maxPerOrder)} />
      {(e.questions || []).map((q) => <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`} value={answers[q.id] || ''} maxLength={200} onChange={(ev) => setAnswers({ ...answers, [q.id]: ev.target.value })} />)}
      {count > 1 && (
        <MoreDetails defaultOpen={holders.some(Boolean)}>
          <li className="guest-moreli">
            <span className="k-note">שמות על הכרטיסים (לא חובה). כרטיס 1 על שמך.</span>
            {Array.from({ length: count - 1 }, (_, i) => (
              <Field key={i} label={`כרטיס ${i + 2}`} size="sm" maxLength={80} value={holders[i] || ''} onChange={(ev) => { const h = [...holders]; h[i] = ev.target.value; setHolders(h); }} />
            ))}
          </li>
        </MoreDetails>
      )}
      {paid && <ReceiptSelect profile={ctx.profile} method={choice.method} onChange={choice.set} />}
      <TotalBlock amount={paid ? money(total) : 'חינם'} meta={paid ? `${ticketsWord(count)} × ${money(e.price)}` : ticketsWord(count)} />
      {paid && <Note>הכרטיסים נוצרים מיד ומסומנים "ממתין לתשלום". משלמים בביט או ב־PayBox ולוחצים "העברתי", או במזומן בשער.</Note>}
    </AppScreen>
  );
}

/** U4: the order is saved; how to pay, and "העברתי" (with the receipt channel first when the account has none yet). */
export function PayPage({ ctx, orderId }: { ctx: GuestCtx; orderId: string }) {
  const mine = useMine(ctx);
  const choice = useReceiptChoice(ctx.profile);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const p = paths(ctx);
  const o = mine.orders.find((x) => x.id === orderId);
  const top = <TopBar className="guest-pull" back={{ label: 'הכרטיסים שלי', onClick: () => go(p.tickets) }} />;
  if (!ctx.profile || !o) return <AppScreen variant="detail">{top}{!mine.loading && <EmptyState variant="fill" icon="ticket" title="ההזמנה לא נמצאה" />}</AppScreen>;
  const state = orderState(o);
  const payState = state === 'due' ? 'due' : state === 'claimed' ? 'claimed' : 'paid';
  const amount = o.first.price * o.valid.length;
  const claim = async () => {
    setBusy(true);
    try { await saveReceipt(ctx.profile!, choice.method); await claimOrderPaid(o.valid); toast.show({ text: 'תודה! המנהלים יאשרו את ההעברה.', check: true }); go(p.tickets, true); }
    catch (err) { toast.refused(`לא נשמר. ${authErrorMessage(err)}`); }
    finally { setBusy(false); }
  };
  const cash = ctx.settings.payment.cash;
  return (
    <AppScreen variant="detail" gap={14} bar={<BottomBar>
      {state === 'due' && <Button size="bar" grow icon="check" disabled={busy || choice.missing} onClick={claim}>העברתי את התשלום</Button>}
      <Button variant="secondary" size="bar" grow={state !== 'due'} onClick={() => go(p.tickets)}>לכרטיסים</Button>
    </BottomBar>}>
      {top}
      <CheckHead title="הכרטיסים שמורים לך" sub={`${o.first.eventTitle} · ${ticketsWord(o.valid.length)}${o.event ? ` · ${dayShort(o.event.start)}` : ''}`} />
      <PayBlock amount={amount} purpose={o.first.eventTitle} name={ctx.profile.displayName} settings={ctx.settings} state={payState} />
      {state === 'due' && choice.missing && <ReceiptSelect profile={ctx.profile} method={choice.method} onChange={choice.set} />}
      <Note>{cash ? 'אפשר גם לשלם במזומן בשער. ' : ''}הכרטיסים כבר אצלך בטלפון.{ctx.settings.payment.note ? ` ${ctx.settings.payment.note}.` : ''}</Note>
    </AppScreen>
  );
}
