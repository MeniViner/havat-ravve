// U8 GuestVisit (a date row and a date picker), U9 GuestDonate, U11 GuestContact and U13 GuestRegister (first sign-in).
// The forms open signed out; their bar button signs in with Google on the spot and the form keeps what was typed.
import { useState } from 'react';
import { AppScreen, go, useExternal, useToast, waUrl, telUrl, ToastProvider } from '../../core';
import { BottomBar, Button, ChoiceGroup, EmptyState, Field, FormHeader, IconButton, MoreDetails, SelectRow, Sheet, TextAreaField, Toggle, ListCard, Row, cx } from '../../kit';
import { createVisit, createDonation, contactPhoneOk, notify } from '../../../data';
import { createProfile } from '../../../store';
import { authErrorMessage, signOutUser, type Session } from '../../../firebase';
import { useDemo, setDemo } from '../../../demo/store';
import { write } from '../../../db';
import { nowIso, todayKey } from '../../../clock';
import { back, param } from '../../../router';
import { DAY_LETTERS, MONTHS, dayName, longDate, money } from '../../format';
import { registrationQuestions, answersFor, missingAnswers } from '../../data/system';
import { RegistrationQuestions } from '../system/fields';
import type { Settings } from '../../../types';
import { type GuestCtx, paths, useSignIn, ACCOUNT_WORD, useReceiptChoice, saveReceipt, payWays } from './data';
import { StepperCard, TotalBlock, ReceiptSelect, Note, SignInChoice } from './parts';
import { UpdatesSwitch } from './account';

// ---------- the date picker (U8) ----------
const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (key: string) => key.slice(0, 7);
function shiftMonth(ym: string, n: number) { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
/** A month at a time; days before today cannot be picked. */
function DateSheet({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: string; onChange: (key: string) => void }) {
  const today = todayKey();
  const [ym, setYm] = useState(() => monthOf(value || today));
  const [y, m] = ym.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (
    <Sheet open={open} onClose={onClose} title="מתי תרצו לבוא">
      <div className="guest-cal">
        <div className="guest-cal__head">
          <IconButton icon="back" label="החודש הקודם" variant="bordered" disabled={ym <= monthOf(today)} onClick={() => setYm(shiftMonth(ym, -1))} />
          <b className="guest-cal__month">{MONTHS[m - 1]} {y}</b>
          <IconButton icon="chevron" label="החודש הבא" variant="bordered" onClick={() => setYm(shiftMonth(ym, 1))} />
        </div>
        <div className="guest-cal__grid" role="grid">
          {DAY_LETTERS.map((d) => <span key={d} className="guest-cal__wd" aria-hidden="true">{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={'p' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const k = `${ym}-${pad(i + 1)}`; const off = k < today;
            return <button type="button" key={k} disabled={off} aria-pressed={k === value} aria-label={`${dayName(k)}, ${longDate(k)}`}
              className={cx('guest-cal__day', k === today && 'guest-cal__day--today', k === value && 'guest-cal__day--on')} onClick={() => { onChange(k); onClose(); }}>{i + 1}</button>;
          })}
        </div>
      </div>
    </Sheet>
  );
}

// ---------- U8 ----------
export function VisitForm({ ctx }: { ctx: GuestCtx }) {
  const types = ctx.settings.visitTypes;
  const [date, setDate] = useState('');
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState(4);
  const [type, setType] = useState(types[0] || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sign = useSignIn(); const toast = useToast();
  const send = async () => {
    if (!ctx.profile) { void sign.go(); return; }
    setBusy(true);
    try {
      const id = await createVisit(ctx.profile, { date, people, type, note: note.trim() });
      toast.show({ text: 'קיבלנו. נחזור אליכם לסגור שעה ופרטים.', check: true });
      go(`/me/visits/${id}`, true);
    } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar column={!ctx.profile}>
      <Button size="bar" block={!ctx.profile} grow={!!ctx.profile} disabled={busy || sign.busy || (!!ctx.profile && (!date || !type))} onClick={send}>שליחת הבקשה</Button>
      {!ctx.profile && <span className="k-note guest-barnote">{sign.error || `בפעם הראשונה נכנסים עם ${ACCOUNT_WORD} וממלאים פרטי הרשמה.`}</span>}<SignInChoice sign={sign} />
    </BottomBar>}>
      <FormHeader title="תיאום ביקור" onCancel={() => back('/')} />
      <span className="guest-sub">ממלאים כמה פרטים, ואנחנו חוזרים אליכם לסגור שעה.</span>
      <SelectRow label="מתי תרצו לבוא" value={date ? `${dayName(date)}, ${longDate(date)}` : 'לבחור תאריך'} onClick={() => setPicking(true)} />
      <StepperCard label="כמה אנשים" value={people} onChange={setPeople} min={1} max={200} />
      {types.length > 0 && <ChoiceGroup label="איזה ביקור" value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t }))} />}
      <TextAreaField label="כמה מילים (לא חובה)" placeholder="סבא וסבתא עם הנכדים, מעדיפים בוקר." maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <Note>אחרי השליחה הבקשה מופיעה בחשבון שלכם, עם המצב שלה.</Note>
      <DateSheet open={picking} onClose={() => setPicking(false)} value={date} onChange={setDate} />
    </AppScreen>
  );
}

// ---------- U9 ----------
export function DonateForm({ ctx }: { ctx: GuestCtx }) {
  const presets = ctx.settings.donationPresets;
  const [pick, setPick] = useState(String(presets[1]?.amount ?? presets[0]?.amount ?? 'other'));
  const [other, setOther] = useState('');
  const [memorial, setMemorial] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState(false);
  const [receiptName, setReceiptName] = useState('');
  const [busy, setBusy] = useState(false);
  const choice = useReceiptChoice(ctx.profile);
  const sign = useSignIn(); const toast = useToast();
  const preset = presets.find((p) => String(p.amount) === pick);
  const value = preset ? preset.amount : Number(other) || 0;
  const name = (receiptName || ctx.profile?.displayName || '').trim();
  const give = async () => {
    if (!ctx.profile) { void sign.go(); return; }
    setBusy(true);
    try {
      await saveReceipt(ctx.profile, choice.method);
      const id = await createDonation(ctx.profile, { amount: value, label: preset?.label || 'סכום חופשי', note: note.trim(), memorial: memorial.trim(), receiptWanted: receipt, receiptName: receipt ? name : '' });
      go(`/me/donations/${id}?new=1`, true);
    } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar column={!ctx.profile}>
      <Button size="bar" icon="heart" block={!ctx.profile} grow={!!ctx.profile} disabled={busy || sign.busy || (!!ctx.profile && (value < 1 || choice.missing || (receipt && !name)))} onClick={give}>לתרום {money(value)}</Button>
      {!ctx.profile && <span className="k-note guest-barnote">{sign.error || `בפעם הראשונה נכנסים עם ${ACCOUNT_WORD} וממלאים פרטי הרשמה.`}</span>}<SignInChoice sign={sign} />
    </BottomBar>}>
      <FormHeader title="תרומה לחווה" onCancel={() => back('/')} />
      <span className="guest-sub">כל תרומה הולכת ישר לעבודה בשטח: עצים, מים, בעלי חיים.</span>
      <ChoiceGroup label="סכום" value={pick} onChange={setPick} options={[...presets.map((p) => ({ value: String(p.amount), label: `${money(p.amount)} · ${p.label}` })), { value: 'other', label: 'סכום אחר' }]} />
      {pick === 'other' && <Field label="כמה (₪)" ltr numeric inputMode="numeric" maxLength={7} value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))} />}
      <Field label="הנצחה (לא חובה)" placeholder="לזכר…" maxLength={120} value={memorial} onChange={(e) => setMemorial(e.target.value)} />
      <ListCard><Row className="guest-togglerow" title="צריך קבלה" meta="נשלחת ידנית, על השם שבחשבון" actions={<Toggle checked={receipt} onChange={setReceipt} label="צריך קבלה" />} /></ListCard>
      <MoreDetails defaultOpen={!!(note || receiptName)}>
        <li className="guest-moreli">
          {receipt && <Field label="שם מלא לקבלה" size="sm" maxLength={120} placeholder={ctx.profile?.displayName || ''} value={receiptName} onChange={(e) => setReceiptName(e.target.value)} />}
          <TextAreaField label="כמה מילים למנהלים (לא חובה)" height={72} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </li>
      </MoreDetails>
      <ReceiptSelect profile={ctx.profile} method={choice.method} onChange={choice.set} />
      <TotalBlock amount={money(value)} meta={payWays(ctx.settings)} />
    </AppScreen>
  );
}

// ---------- U11 ----------
export function ContactLinks({ settings, message }: { settings: Settings; message?: string }) {
  const open = useExternal();
  const wa = settings.contact?.whatsapp || ''; const phone = settings.contact?.phone || '';
  if (!contactPhoneOk(wa) && !contactPhoneOk(phone)) return null;
  return (
    <div className="guest-contact">
      {contactPhoneOk(wa) && <Button icon="message" onClick={() => open(waUrl(wa, message))}>וואטסאפ לחווה</Button>}
      {contactPhoneOk(phone) && <Button variant="outline" icon="phone" onClick={() => open(telUrl(phone))}>טלפון</Button>}
    </div>
  );
}
export function ContactForm({ ctx }: { ctx: GuestCtx }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const sign = useSignIn(); const toast = useToast();
  const leave = () => back(param('from') === 'team' ? paths(ctx).account : '/');
  const ok = subject.trim() && message.trim();
  const send = async () => {
    if (!ctx.profile) { void sign.go(); return; }
    if (!ok || busy) return;
    setBusy(true);
    try { await notify('contact', subject.trim(), message.trim(), '/manage/inbox', ctx.profile.uid); setSent(true); }
    catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); }
    finally { setBusy(false); }
  };
  if (sent) {
    return (
      <AppScreen variant="form" gap={14}>
        <FormHeader title="פנייה לחווה" cancelLabel="סגירה" onCancel={leave} />
        <EmptyState variant="done" title="הפנייה נשלחה" text="המנהלים קיבלו אותה. נחזור אליך בהקדם." action={<Button variant="outline" onClick={leave}>חזרה</Button>} />
      </AppScreen>
    );
  }
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar column={!ctx.profile}>
      <Button size="bar" block={!ctx.profile} grow={!!ctx.profile} disabled={busy || sign.busy || (!!ctx.profile && !ok)} onClick={send}>שליחת הפנייה</Button>
      {!ctx.profile && <span className="k-note guest-barnote">{sign.error || `כדי שהמנהלים ידעו למי לחזור, נכנסים עם ${ACCOUNT_WORD}.`}</span>}<SignInChoice sign={sign} />
    </BottomBar>}>
      <FormHeader title="פנייה לחווה" onCancel={leave} />
      <ContactLinks settings={ctx.settings} />
      <span className="guest-sub">או לכתוב כאן, ונחזור אליך:</span>
      <Field label="נושא" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TextAreaField label="מה רצית לשאול" maxLength={500} height={120} value={message} onChange={(e) => setMessage(e.target.value)} />
    </AppScreen>
  );
}

// ---------- U13 ----------
/** First sign-in of a guest: name, phone, the farm's registration questions and the updates switch (off). */
export function GuestRegister({ user, settings }: { user: Session; settings: Settings }) {
  return <ToastProvider><Register user={user} settings={settings} /></ToastProvider>;
}
function Register({ user, settings }: { user: Session; settings: Settings }) {
  const demo = useDemo(); const toast = useToast();
  const questions = registrationQuestions(settings.registrationFields);
  const [name, setName] = useState(user.displayName || '');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFor({}, questions));
  const [optIn, setOptIn] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const missing = missingAnswers(answers, questions);
  const nameErr = tried && name.trim().length < 2 ? 'צריך שם פרטי ומשפחה' : '';
  const phoneErr = tried && !contactPhoneOk(phone) ? 'מספר טלפון לא תקין' : '';
  const submit = async () => {
    setTried(true);
    if (name.trim().length < 2 || !contactPhoneOk(phone) || missing.length || busy) return;
    setBusy(true);
    const given = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try {
      await createProfile(user, { displayName: name, phone, fields: given });
      if (optIn) void write.update('users', user.uid, { updatesOptIn: true, updatedAt: nowIso() }, { quiet: true }).catch(() => {});
    } catch (e) { toast.refused(`לא נשמר. ${authErrorMessage(e)}`); setBusy(false); }
  };
  return (
    <AppScreen variant="root" gap={14} noNav bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={submit}>כניסה</Button></BottomBar>}>
      <div className="guest-titleblock"><span className="guest-sub">חוות רווה</span><h1 className="k-h1">עוד רגע ונכנסים</h1></div>
      <Field label="השם שלך בעברית" placeholder="שם פרטי ומשפחה" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={nameErr} autoComplete="name" />
      <Field label="טלפון" placeholder="05" ltr value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} inputMode="tel" error={phoneErr} autoComplete="tel" />
      <RegistrationQuestions questions={questions} answers={answers} missing={tried ? missing : []} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
      <UpdatesSwitch checked={optIn} onChange={setOptIn} />
      <Note>בכניסה מסכימים ל<button type="button" className="guest-inlinelink" onClick={() => go('/terms')}>תנאי השימוש והפרטיות</button>.</Note>
      <Note>נכנסים עם <bdi>{user.email}</bdi> · <button type="button" className="guest-inlinelink" onClick={() => demo.on ? setDemo({ persona: 'anon' }) : void signOutUser()}>לא אני</button></Note>
    </AppScreen>
  );
}
