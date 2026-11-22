// The payment confirmation of one paid order, donation or stall account (the old PaymentConfirmationActions, in v2 parts):
// the guest's preference (WhatsApp or email), send by either, "סימון שהאישור נשלח", and the Worker's automatic email status
// (email_outbox/order_<orderId> | donation_<id> | tab_<id>; managers read it, nobody writes it from the app).
import { useDoc } from '../../../db';
import { fillTemplate, markPaymentConfirmation, receiptDestination, receiptPreference } from '../../../data';
import { DEFAULT_SETTINGS, RECEIPT_PREFERENCE_LABELS, type PaymentConfirmation } from '../../../types';
import { useExternal, useToast, useV2, waUrl } from '../../core';
import { Button, Tag } from '../../kit';
import { dayTime, money } from '../../format';
import { useRun } from './shared';

type EmailJob = { id: string; status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'; reason?: string | null; to?: string; sentAt?: string; updatedAt: string };
const SKIP_TEXT: Record<string, string> = {
  whatsapp: 'ההעדפה היא וואטסאפ', no_preference: 'לא נבחרה דרך שליחה', no_address: 'אין כתובת מייל תקינה', not_paid: 'התשלום בוטל לפני השליחה', manual: 'סומן ידנית',
};
function EmailStatus({ job }: { job: EmailJob }) {
  if (job.status === 'sent') return <span className="events-payconfirm__line"><Tag tone="paid">נשלח במייל אוטומטית</Tag>{job.sentAt && ` ${dayTime(job.sentAt)}`}{job.to && <> · <bdi>{job.to}</bdi></>}</span>;
  if (job.status === 'queued' || job.status === 'sending') return <span className="events-payconfirm__line"><Tag tone="waiting">מייל אוטומטי בתור</Tag>{job.reason ? ' · ניסיון נוסף בקרוב' : ''}</span>;
  if (job.status === 'failed') return <span className="events-payconfirm__line"><Tag tone="urgent">המייל האוטומטי נכשל</Tag> {job.reason === 'rejected' ? 'הכתובת נדחתה' : 'שירות המייל לא זמין'} · אפשר לשלוח ידנית</span>;
  return <span className="events-payconfirm__line">מייל אוטומטי לא נשלח · {SKIP_TEXT[job.reason || ''] || 'לא נדרש'}</span>;
}

export type PayConfirmProps = {
  collection: 'tickets' | 'donations' | 'tabs'; ids: string[]; uid: string; name: string; phone: string;
  amount: number; purpose: string; event?: string; paid: boolean; confirmation?: PaymentConfirmation; emailJob?: string;
};
export function PayConfirm({ collection, ids, uid, name, phone, amount, purpose, event, paid, confirmation, emailJob }: PayConfirmProps) {
  const { actor, manager, peopleByUid, settings } = useV2();
  const job = useDoc<EmailJob>('email_outbox/' + (emailJob || '_'), manager && paid && !!emailJob).item;
  const run = useRun();
  const toast = useToast();
  const ext = useExternal();
  const profile = peopleByUid.get(uid);
  const preference = receiptPreference(profile);
  const to = { phone: profile?.phone || phone, email: profile?.email || '' };
  const whatsapp = receiptDestination(to, 'whatsapp');
  const email = receiptDestination(to, 'email');
  const body = fillTemplate(settings.templates.paymentConfirmation?.trim() || DEFAULT_SETTINGS.templates.paymentConfirmation!, {
    'שם': profile?.displayName || name, 'סכום': money(amount), 'עבור': purpose, 'אירוע': event || '',
  });
  const mailto = 'mailto:' + encodeURIComponent(email).replace('%40', '@') + '?subject=' + encodeURIComponent('אישור תשלום מחוות רווה') + '&body=' + encodeURIComponent(body);
  const mark = async () => {
    const ok = await run(async () => { await markPaymentConfirmation(actor, collection, ids); return true; });
    if (ok) toast.show({ text: 'סומן: אישור התשלום נשלח', check: true, duration: 2500 });
  };
  const canSend = paid && !!(whatsapp || email);
  return (
    <div className="events-payconfirm">
      <span className="events-payconfirm__line">אישור תשלום · {preference ? 'העדפה: ' + RECEIPT_PREFERENCE_LABELS[preference] : 'אין העדפה'}</span>
      {canSend && (
        <div className="events-btnrow">
          {whatsapp && <Button variant={preference === 'whatsapp' ? 'primary' : 'outline'} icon="message" iconSize={16} onClick={() => ext(waUrl(whatsapp, body))}>שליחה בוואטסאפ</Button>}
          {email && <Button variant={preference === 'email' ? 'primary' : 'outline'} onClick={() => ext(mailto)}>שליחה במייל</Button>}
        </div>
      )}
      {confirmation
        ? <span className="events-payconfirm__line"><Tag tone="paid">אישור נשלח</Tag> {confirmation.by.name} · {dayTime(confirmation.at)}</span>
        : canSend && <div><Button variant="quiet" onClick={mark}>סימון שהאישור נשלח</Button></div>}
      {paid && job && <EmailStatus job={job} />}
    </div>
  );
}
