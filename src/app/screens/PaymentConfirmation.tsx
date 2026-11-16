import { useState } from 'react';
import type { TeamCtx } from '../ctx';
import type { PaymentConfirmation as Confirmation, Profile, ReceiptPreference } from '../types';
import { DEFAULT_SETTINGS, RECEIPT_PREFERENCE_FIELD, RECEIPT_PREFERENCE_LABELS } from '../types';
import { fillTemplate, markPaymentConfirmation, receiptDestination, receiptPreference, waLink } from '../data';
import { updateOwnProfile } from '../store';
import { Btn, Field, Icon, Pill, Sec, Select, money, useToast, whenText } from '../ui';

const METHODS = ['whatsapp', 'email'] as const;
export const canChooseReceipt = (profile: Profile) => METHODS.some((method) => receiptDestination(profile, method));

export function useReceiptChoice(profile: Profile | null) {
  const [draft, setChoice] = useState<ReceiptPreference>();
  const method = profile && draft && receiptDestination(profile, draft) ? draft : receiptPreference(profile);
  return { method, setChoice, missing: !!profile && !method && canChooseReceipt(profile) };
}

export function saveReceiptPreference(profile: Profile, method: ReceiptPreference | undefined) {
  if (method && receiptDestination(profile, method) && method !== receiptPreference(profile)) {
    return updateOwnProfile(profile.uid, { fields: { [RECEIPT_PREFERENCE_FIELD]: method } });
  }
}

export function ReceiptChoice({ profile, value, onChange, edit }: {
  profile: Profile; value?: ReceiptPreference; onChange: (value: ReceiptPreference | undefined) => void; edit?: boolean;
}) {
  const stored = receiptPreference(profile);
  const [change, setChange] = useState(false);
  if (!canChooseReceipt(profile)) return null;
  if (stored && !change && !edit) return (
    <div className="inline pad">
      <span>אישור תשלום יישלח ב{RECEIPT_PREFERENCE_LABELS[stored]} ל־<bdi>{receiptDestination(profile, stored)}</bdi></span>
      <Btn kind="quiet" size="sm" onClick={() => setChange(true)}>שינוי</Btn>
    </div>
  );
  return (
    <Field label="לאן לשלוח אישור תשלום?" hint="הבחירה תישמר בחשבון שלכם לתשלומים הבאים.">
      <Select required value={value || ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value as ReceiptPreference)}>
        <option value="" disabled>בחרו וואטסאפ או מייל</option>
        {METHODS.filter((method) => receiptDestination(profile, method)).map((method) => (
          <option key={method} value={method}>{RECEIPT_PREFERENCE_LABELS[method]} · {receiptDestination(profile, method)}</option>
        ))}
      </Select>
    </Field>
  );
}

export function ReceiptPreferenceSection({ profile }: { profile: Profile }) {
  const stored = receiptPreference(profile);
  const [edit, setEdit] = useState(false);
  const [choice, setChoice] = useState<ReceiptPreference>();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!canChooseReceipt(profile)) return null;
  const save = async () => {
    setBusy(true);
    try {
      await saveReceiptPreference(profile, choice);
      setEdit(false);
      toast({ text: 'ההעדפה נשמרה' }, 2500);
    } catch {
      toast({ text: 'ההעדפה לא נשמרה', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Sec title="אישור תשלום" link={edit ? 'ביטול' : stored ? 'שינוי' : 'בחירה'} onLink={() => { setChoice(stored); setEdit(!edit); }} />
      {edit
        ? <><ReceiptChoice profile={profile} value={choice} onChange={setChoice} edit /><div className="actions"><Btn disabled={!choice || busy} onClick={save}>שמירת העדפה</Btn></div></>
        : <p className="lead">{stored ? <>{RECEIPT_PREFERENCE_LABELS[stored]} · <bdi>{receiptDestination(profile, stored)}</bdi></> : 'דרך השליחה עוד לא נבחרה'}</p>}
    </>
  );
}

export function PaymentConfirmationActions({ ctx, collection, ids, uid, name, phone, amount, purpose, event, paid, confirmation }: {
  ctx: TeamCtx; collection: 'tickets' | 'donations' | 'tabs'; ids: string[]; uid: string; name: string; phone: string;
  amount: number; purpose: string; event?: string; paid: boolean; confirmation?: Confirmation;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const profile = ctx.peopleByUid.get(uid);
  const preference = receiptPreference(profile);
  const to = { phone: profile?.phone || phone, email: profile?.email || '' };
  const whatsapp = receiptDestination(to, 'whatsapp');
  const email = receiptDestination(to, 'email');
  const subject = 'אישור תשלום מחוות רווה';
  const body = fillTemplate(ctx.settings.templates.paymentConfirmation?.trim() || DEFAULT_SETTINGS.templates.paymentConfirmation!, {
    'שם': profile?.displayName || name, 'סכום': money(amount), 'עבור': purpose, 'אירוע': event || '',
  });
  const mailto = 'mailto:' + encodeURIComponent(email).replace('%40', '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  const mark = async () => {
    setBusy(true);
    try {
      await markPaymentConfirmation(ctx.actor, collection, ids);
      toast({ text: 'סומן: אישור התשלום נשלח' }, 2500);
    } catch {
      toast({ text: 'סימון השליחה לא נשמר', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginBlock: 8 }}>
      <div className="meta">אישור תשלום · {preference ? 'העדפה: ' + RECEIPT_PREFERENCE_LABELS[preference] : 'אין העדפה'}</div>
      {paid && (whatsapp || email) && <div className="inline" style={{ marginBlockStart: 6 }}>
        {whatsapp && <a className={'btn xs ' + (preference === 'whatsapp' ? 'primary' : 'ghost')} href={waLink(whatsapp, body)} target="_blank" rel="noopener"><Icon name="whatsapp" size={14} />שליחה בוואטסאפ</a>}
        {email && <a className={'btn xs ' + (preference === 'email' ? 'primary' : 'ghost')} href={mailto}>שליחה במייל</a>}
      </div>}
      {confirmation
        ? <div className="meta" style={{ marginBlockStart: 6 }}><Pill tone="ok">אישור נשלח</Pill> {confirmation.by.name} · {whenText(confirmation.at)}</div>
        : paid && (whatsapp || email) && <Btn kind="quiet" size="xs" disabled={busy} onClick={mark}>סימון שהאישור נשלח</Btn>}
    </div>
  );
}
