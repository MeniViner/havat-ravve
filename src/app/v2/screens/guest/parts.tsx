// Parts the guest screens share: the photo header (U1, U2), the one pay block (U4, U6, U9, U10), the ticket card (U5, U6),
// the stepper card (U3, U8), the total block (U3, U9), the check head (U4), the receipt-channel row (U3, U9, U4, U10, U7)
// and the Google button (U12, and signing in on a form).
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Icon, IconButton, Stepper, SelectRow, PickerSheet, Sheet, cx } from '../../kit';
import { useExternal, useToast } from '../../core';
import type { Profile, ReceiptPreference, Settings, Ticket } from '../../../types';
import { receiptDestination } from '../../../data';
import { qrPayload } from '../../../data';
import { money } from '../../format';
import { appleSignInAvailable } from '../../../firebase';
import { type useSignIn, RECEIPT_WORD, receiptMethods, canChooseReceipt, ticketsWord, whenShort, type Order, orderState } from './data';

export const FARM_PHOTO = '/assets/rava-sunset.webp';

/** The photo at the top of U1 (150) and U2 (190) with the white title over a dark fade. A missing photo falls back to the farm. */
export function PhotoHeader({ src, height, overline, title, label }: { src?: string; height: number; overline: ReactNode; title: ReactNode; label: string }) {
  return (
    <div className="guest-photo" style={{ height }} role="img" aria-label={label}>
      <img src={src || FARM_PHOTO} alt="" />
      <div className="guest-photo__over"><span className="guest-photo__overline">{overline}</span><b className="guest-photo__title">{title}</b></div>
    </div>
  );
}

/** U4 head: the warm check circle, the h1 and one soft line. */
export function CheckHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="guest-checkhead">
      <span className="guest-checkhead__mark" aria-hidden="true"><Icon name="check" size={28} /></span>
      <h1 className="k-h1 k-h1--detail">{title}</h1>
      {sub && <span className="guest-sub">{sub}</span>}
    </div>
  );
}

/** "כמה כרטיסים" / "כמה אנשים": label and meta on the start side, the stepper with its value on the end. */
export function StepperCard({ label, meta, value, onChange, min, max }: { label: string; meta?: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div className="k-card guest-stepcard">
      <span className="guest-stepcard__text"><span className="guest-stepcard__label">{label}</span>{meta && <span className="guest-stepcard__meta">{meta}</span>}</span>
      <Stepper value={value} onChange={onChange} min={min} max={max} showValue incLabel="עוד" decLabel="פחות" />
    </div>
  );
}

/** The warm total of a form (U3 "150 ₪ · 3 כרטיסים × 50 ₪", U9 "180 ₪ · בביט, ב־PayBox או במזומן"). */
export function TotalBlock({ amount, meta }: { amount: ReactNode; meta: ReactNode }) {
  return <section className="guest-total"><b className="guest-total__amount k-num">{amount}</b><span className="guest-total__meta">{meta}</span></section>;
}

export const Note = ({ children }: { children: ReactNode }) => <span className="k-note">{children}</span>;

// ---------- the pay block (one component: tickets, donations, the stall account) ----------
export type PayState = 'due' | 'claimed' | 'paid';
const payboxUrl = (v: string) => (/^https?:\/\//.test(v) ? v : `https://${v}`);
/**
 * U4: amber "נשאר לשלם" head with the amount, then how to pay (ביט with "העתקה", PayBox with "פתיחה") and what to write
 * ("לציין": what it is for, and the payer's name). After "העברתי" it says so; once a manager confirms, "שולם".
 */
export function PayBlock({ amount, purpose, name, settings, state }: { amount: number; purpose: string; name: string; settings: Settings; state: PayState }) {
  const open = useExternal(); const toast = useToast();
  const p = settings.payment;
  const copy = () => {
    navigator.clipboard?.writeText(p.bit).then(() => toast.show({ text: 'המספר הועתק', duration: 2500 }), () => toast.show({ text: p.bit, duration: 4000 }));
  };
  const head = state === 'due' ? 'נשאר לשלם' : state === 'claimed' ? 'סימנת שהעברת · מחכה לאישור' : 'שולם';
  return (
    <section className={cx('k-card guest-pay', `guest-pay--${state}`)} aria-label={head}>
      <div className="guest-pay__head"><b className="guest-pay__label">{head}</b><b className="guest-pay__amount k-num">{money(amount)}</b></div>
      {state === 'due' && (
        <dl className="guest-pay__dl">
          {p.bit && <div className="guest-pay__row"><dt>ביט</dt><dd><span dir="ltr">{p.bit}</span></dd><button type="button" className="k-textlink" onClick={copy}>העתקה</button></div>}
          {p.paybox && <div className="guest-pay__row"><dt>PayBox</dt><dd>קישור לקבוצה</dd><button type="button" className="k-textlink" onClick={() => open(payboxUrl(p.paybox))}>פתיחה</button></div>}
          <div className="guest-pay__row"><dt>לציין</dt><dd>{purpose}, {name}</dd></div>
        </dl>
      )}
    </section>
  );
}

// ---------- QR and the ticket card ----------
/** The ticket's own QR, drawn on the phone from the stored ticket (works with no reception). */
export function Qr({ text, size }: { text: string; size: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#14171B', light: '#ffffff' } }).then(setSrc).catch(() => setSrc('')); }, [text, size]);
  return (
    <div className="guest-qr" role="img" aria-label="הברקוד של הכרטיס" style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size - 16} height={size - 16} />}
    </div>
  );
}

const STRIP: Record<ReturnType<typeof orderState>, string> = {
  paid: 'שולם · מוכן לשער', onsite: 'שולם במקום · מוכן לשער', free: 'חינם · מוכן לשער', due: 'ממתין לתשלום', claimed: 'סימנת שהעברת · מחכה לאישור', cancelled: 'ההזמנה בוטלה',
};
/** U5 / U6: warm head (event, when), the QR of one ticket, the holder, previous / next, and the payment strip. */
export function TicketCard({ order, index, onIndex, onPay }: { order: Order; index: number; onIndex: (i: number) => void; onPay?: () => void }) {
  const list = order.valid.length ? order.valid : order.tickets;
  const i = Math.min(index, list.length - 1);
  const t: Ticket = list[i];
  const state = orderState(order);
  const tone = state === 'due' || state === 'claimed' ? 'amber' : state === 'cancelled' ? 'red' : 'green';
  return (
    <section className={cx('guest-ticket', state === 'cancelled' && 'guest-ticket--cancelled')} aria-label={`כרטיס ל${order.first.eventTitle}`}>
      <div className="guest-ticket__head"><b className="guest-ticket__title">{order.event?.title || order.first.eventTitle}</b>{order.event && <span className="guest-ticket__when">{whenShort(order.event)}</span>}</div>
      <div className="guest-ticket__body">
        <Qr text={qrPayload(t)} size={208} />
        <b className="guest-ticket__holder">{t.holderName || t.ownerName}</b>
        <div className="guest-ticket__nav">
          <IconButton icon="back" label="הכרטיס הקודם" variant="outline" disabled={i === 0} onClick={() => onIndex(i - 1)} />
          <span className="guest-ticket__count">כרטיס {t.index} מתוך {t.total}{t.entries > 0 ? ` · נכנס ${t.entries}` : ''}</span>
          <IconButton icon="chevron" label="הכרטיס הבא" variant="outline" disabled={i >= list.length - 1} onClick={() => onIndex(i + 1)} />
        </div>
      </div>
      <div className={cx('guest-ticket__strip', `guest-ticket__strip--${tone}`)}>
        {tone === 'green' && <Icon name="check" size={20} />}
        <span className="guest-ticket__striptext">{STRIP[state]}{state === 'due' ? ` · ${money(order.owed)}` : ''}</span>
        {state === 'due' && onPay && <button type="button" className="guest-ticket__pay" onClick={onPay}>לתשלום</button>}
      </div>
    </section>
  );
}
/** "פסטיבל הסתיו · 3 כרטיסים" */
export const orderTitle = (o: Order) => `${o.first.eventTitle} · ${ticketsWord(o.valid.length || o.tickets.length)}`;

// ---------- the payment-confirmation channel ----------
/** "לאן לשלוח אישור תשלום" as a SelectRow that opens a picker (U3, U9). Hidden when the account has no phone or mail. */
export function ReceiptSelect({ profile, method, onChange }: { profile: Profile | null; method: ReceiptPreference | undefined; onChange: (m: ReceiptPreference) => void }) {
  const [open, setOpen] = useState(false);
  if (!profile || !canChooseReceipt(profile)) return null;
  const options = receiptMethods(profile).map((m) => ({ value: m, label: RECEIPT_WORD[m], meta: <span dir="ltr">{receiptDestination(profile, m)}</span> }));
  return (
    <>
      <SelectRow label="לאן לשלוח אישור תשלום" value={method ? RECEIPT_WORD[method] : 'לבחור'} onClick={() => setOpen(true)} />
      <PickerSheet open={open} onClose={() => setOpen(false)} title="לאן לשלוח אישור תשלום" sub="כשהמנהלים מאשרים את התשלום" options={options} value={method} onChange={onChange} />
    </>
  );
}

// ---------- Google ----------
const GoogleG = () => <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>;
/** U12: white, ink-bordered, 56 high. */
export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="guest-google" disabled={disabled} onClick={onClick}><GoogleG />המשך עם Google</button>;
}
// Apple's own mark (Simple Icons, CC0); black button with white text, as Apple's guidelines ask. Only inside the iPhone app.
const AppleMark = () => <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>;
export function AppleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="guest-google guest-apple" disabled={disabled} onClick={onClick}><AppleMark />המשך עם Apple</button>;
}
/** Google, and Apple inside the iPhone app. */
export function SignInButtons({ sign, next }: { sign: ReturnType<typeof useSignIn>; next?: string }) {
  return (
    <>
      <GoogleButton disabled={sign.busy} onClick={() => void sign.go(next, 'google')} />
      {appleSignInAvailable && <AppleButton disabled={sign.busy} onClick={() => void sign.go(next, 'apple')} />}
    </>
  );
}
/** The iPhone app's choice when a form signs in (on the website a form opens Google directly and this draws nothing). */
export function SignInChoice({ sign }: { sign: ReturnType<typeof useSignIn> }) {
  if (!appleSignInAvailable) return null;
  return (
    <Sheet open={sign.choosing} onClose={sign.closeChoice} title="כניסה לחשבון" sub="פעם אחת, ואחר כך ממלאים שם וטלפון.">
      <div className="guest-signin__choice">
        <SignInButtons sign={sign} />
        {sign.error && <span className="k-field__error" role="alert">{sign.error}</span>}
      </div>
    </Sheet>
  );
}
