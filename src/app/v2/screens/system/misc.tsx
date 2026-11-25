// C9-Welcome (first entry), C10-Install, C8-Offline (the queue of writes kept on the phone) and X2-Suspended.
import { useState } from 'react';
import { AppScreen, go, useToast, useExternal, waUrl, telUrl, ToastProvider, ToastStack } from '../../core';
import { TopBar, Button, BottomBar, Field, Hero, Avatar, Segmented, ListCard, Row, IconTile, TextLink, EmptyState, Icon, MoreDetails, initials } from '../../kit';
import { back, navigate, useSearch } from '../../../router';
import { useSync } from '../../../db';
import { useOnline, createProfile } from '../../../store';
import { contactPhoneOk } from '../../../data';
import { useDemo, useDemoStates, setDemoStates, demoOnly } from '../../../demo/store';
import { write } from '../../../db';
import { nowIso } from '../../../clock';
import { ddmm } from '../../format';
import { gw } from '../../gender';
import type { ScreenProps } from '../../ctx';
import type { Profile, RegistrationField, RoleInvite, Settings } from '../../../types';
import type { Session } from '../../../firebase';
import {
  useInviteFor, INVITE_ROLE_WORD, firstName, markWelcomed, registrationQuestions, answersFor, missingAnswers, useInstallPrompt, promptInstall, isIos,
  afterFirstEntry, useOfflineQueue, setOfflineSince, suspendedAt,
} from '../../data/system';
import { signOutEverywhere } from './profile';
import { RegistrationQuestions } from './fields';
import { forgetVendorInvite } from '../../data/vendor';
import './system.css';

// ---------- C9 ----------
/** C9 for a person a manager added: create the profile (first entry) or confirm the details of an existing one (/welcome).
 *  `fields` are the farm's registration questions (settings.registrationFields), asked here as the old onboarding did. */
/** `link`: the one-time team link (Q27) a new account came through; createProfile uses it up with the profile. */
export function WelcomeForm({ user, profile, invite, fields, link }: { user: Session; profile: Profile | null; invite: RoleInvite | null; fields?: RegistrationField[]; link?: string }) {
  const toast = useToast();
  const [name, setName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const questions = registrationQuestions(fields);
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFor(profile?.fields, questions));
  const missing = missingAnswers(answers, questions);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameErr = tried && name.trim().length < 2 ? 'צריך שם פרטי ומשפחה' : '';
  const phoneErr = tried && !contactPhoneOk(phone) ? 'מספר טלפון לא תקין' : '';
  const submit = async () => {
    setTried(true);
    if (name.trim().length < 2 || !contactPhoneOk(phone) || missing.length || busy) return;
    setBusy(true);
    const given = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try {
      // an existing profile keeps its other fields; its answers are written only when there are questions
      const d = { displayName: name, phone, ...(profile && questions.length ? { fields: { ...(profile.fields || {}), ...answers } } : {}) };
      if (profile) await markWelcomed(profile.uid, d);
      else if (demoOnly()) {
        const at = nowIso();
        await write.set('users', user.uid, { uid: user.uid, email: (invite?.email || user.email).toLowerCase(), displayName: name.trim(), phone: phone.trim(), role: invite?.role || 'staff', status: 'active', customerNumber: 999, acceptedTermsAt: at, createdAt: at, updatedAt: at, welcomedAt: at, fields: given });
      } else {
        await createProfile(user, { displayName: name, phone, fields: given }, link);
        if (link) forgetVendorInvite();
        void write.update('users', user.uid, { welcomedAt: nowIso() }, { quiet: true }).catch(() => {});
      }
      // C10 once, as its own step right after the first entry (not in demo, not when already installed)
      navigate(afterFirstEntry(demoOnly()), true);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const by = invite?.createdBy?.name || '';
  return (
    <AppScreen variant="root" gap={16} noNav bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={submit}>כניסה לאפליקציה</Button></BottomBar>}>
      <div className="system-welcome"><span className="system-welcome__farm">חוות רווה</span><h1 className="system-welcome__title">ברוך הבא לצוות</h1></div>
      {invite && (
        <Hero className="system-added">
          <Avatar initials={initials(by)} tone="ondark" size={40} />
          <div className="system-added__text">
            <span className="system-added__title">{firstName(by)} {gw(by, 'הוסיף', 'הוסיפה')} אותך {INVITE_ROLE_WORD[invite.role] || 'לצוות'}</span>
            <span className="k-hero__meta" dir="ltr">{invite.email || user.email}</span>
          </div>
        </Hero>
      )}
      <Field label="השם שלך בעברית" placeholder="שם פרטי ומשפחה" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={nameErr} autoComplete="name" />
      <Field label="טלפון" placeholder="05" ltr value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} inputMode="tel" error={phoneErr} autoComplete="tel" />
      {/* C9 shows name and phone. The farm's sign-up questions (parity) follow rule 8: a required one stays in the form,
          the optional ones wait in "עוד פרטים". */}
      <RegistrationQuestions questions={questions.filter((f) => f.required)} answers={answers} missing={tried ? missing : []} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
      {questions.some((f) => !f.required) && (
        <MoreDetails>
          <li className="k-moredetails__fields">
            <RegistrationQuestions questions={questions.filter((f) => !f.required)} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
          </li>
        </MoreDetails>
      )}
      <span className="system-note">השם יופיע ליד כל משימה שתבצע. <button type="button" onClick={() => go('/terms')}>תנאי שימוש ופרטיות</button></span>
    </AppScreen>
  );
}

/** Q27: a one-time team link that was used, cancelled or expired. "המשך" continues as a guest (the usual first entry). */
export function LinkGone({ onContinue }: { onContinue: () => void }) {
  return (
    <AppScreen variant="root" gap={16} noNav bar={<BottomBar><Button size="bar" grow onClick={onContinue}>המשך</Button></BottomBar>}>
      <div className="system-welcome"><span className="system-welcome__farm">חוות רווה</span></div>
      <EmptyState icon="clock" title="הקישור כבר לא בתוקף" text="הוא כבר שימש לכניסה, בוטל, או שעבר הזמן שלו. בקשו מהחווה קישור חדש. אפשר להמשיך בינתיים כאורח." />
    </AppScreen>
  );
}

/** /welcome inside the app: someone who already has a profile confirms their details once. */
export function WelcomeScreen({ ctx }: ScreenProps) {
  const { invite } = useInviteFor(ctx.profile.email);
  return <WelcomeForm user={ctx.user} profile={ctx.profile} invite={invite} fields={ctx.settings.registrationFields} />;
}

// ---------- C10 ----------
const IPHONE = [
  ['לוחצים על "שיתוף"', 'הריבוע עם החץ, בתחתית Safari'],
  ['בוחרים "הוספה למסך הבית"', 'גוללים מעט למטה ברשימה'],
  ['פותחים מהאייקון החדש', 'ומאשרים קבלת התראות'],
];
const ANDROID = [
  ['לוחצים על התפריט', 'שלוש הנקודות, בפינה של Chrome'],
  ['בוחרים "התקנת אפליקציה"', 'או "הוספה למסך הבית"'],
  ['פותחים מהאייקון החדש', 'ומאשרים קבלת התראות'],
];
/** C10. `?first=1`: the one offer right after the first entry (C9), where "אחר כך" and installing go on into the app.
 *  Otherwise it is the guide behind the profile row "התקנה למסך הבית" (Q18), and "אחר כך" goes back. */
export function InstallScreen(_: ScreenProps) {
  const first = new URLSearchParams(useSearch()).get('first') === '1';
  const later = () => (first ? navigate('/tasks', true) : back('/me'));
  const [os, setOs] = useState<'ios' | 'android'>(!isIos() && /Android/i.test(navigator.userAgent) ? 'android' : 'ios');
  const prompt = useInstallPrompt();
  const demo = useDemo();
  const steps = os === 'ios' ? IPHONE : ANDROID;
  return (
    <AppScreen className="system-scr" variant="detail" gap={14}>
      <div className="system-install-top"><Button variant="quiet" onClick={later}>אחר כך</Button></div>
      <h1 className="system-install-title">להוסיף למסך הבית</h1>
      <span className="system-lead">כך מקבלים התראות, והאפליקציה נפתחת בנגיעה אחת.</span>
      <Segmented label="סוג הטלפון" value={os} onChange={setOs} options={[{ value: 'ios', label: 'iPhone' }, { value: 'android', label: 'Android' }]} />
      <section className="k-card k-card--list">
        <ul className="k-list k-list--flush">
          {steps.map(([t, m], i) => (
            <li key={t} className="system-step"><span className="system-step__n" aria-hidden="true">{i + 1}</span><div className="system-step__body"><span className="system-step__title">{t}</span><span className="system-step__meta">{m}</span></div></li>
          ))}
        </ul>
      </section>
      {os === 'android' && prompt && !demo.on && <Button size="lg" block icon="download" onClick={() => void promptInstall().then((ok) => { if (ok && first) navigate('/tasks', true); })}>להתקין עכשיו</Button>}
    </AppScreen>
  );
}

// ---------- C8 ----------
/** The queue card (C8): writes kept on this phone until reception returns. Also rendered on T1 by the tasks area when offline. */
export function OfflineQueue({ uid }: { uid: string }) {
  const sync = useSync(); const demo = useDemo(); const states = useDemoStates(); const online = useOnline(); const toast = useToast();
  const demoOffline = demo.on && states.offline;
  const rows = useOfflineQueue(uid, sync.pending, demoOffline);
  const retry = () => {
    if (demoOffline) { setDemoStates({ offline: false }); setOfflineSince(''); toast.show({ text: 'נשלח', duration: 2500 }); return; }
    if (online || navigator.onLine) toast.show({ text: sync.pending ? 'שולח עכשיו' : 'נשלח', duration: 2500 });
    else toast.show({ text: 'עדיין אין קליטה. זה יישלח לבד כשתחזור', duration: 3500 });
  };
  if (!rows.length && !sync.pending) return null;
  return (
    <ListCard title="יישלחו לבד כשתחזור הקליטה" count={demoOffline ? rows.length : Math.max(sync.pending, rows.length)} end={<TextLink onClick={retry}>לנסות עכשיו</TextLink>}>
      {rows.map((r) => <Row key={r.id} minHeight={58} leading={<IconTile icon={r.icon} />} title={r.title} meta={r.meta} trailing={<span className="system-wait">מחכה</span>} />)}
    </ListCard>
  );
}
export function OfflineScreen({ ctx }: ScreenProps) {
  const sync = useSync(); const demo = useDemo(); const states = useDemoStates();
  const any = sync.pending > 0 || (demo.on && states.offline);
  return (
    <AppScreen variant="root" gap={12}>
      <TopBar className="system-pull" back={{ label: 'חזרה', onClick: () => back('/tasks') }} />
      <OfflineQueue uid={ctx.user.uid} />
      {!any && <EmptyState variant="done" title="הכול נשלח" text="אין פעולות שמחכות לקליטה" />}
    </AppScreen>
  );
}

// ---------- X2 ----------
/** Rendered by src/app/App.tsx instead of the app for a blocked account (outside the v2 shell). */
export function Suspended({ profile, settings }: { profile: Profile; settings: Settings }) {
  return <ToastProvider><SuspendedBody profile={profile} settings={settings} /></ToastProvider>;
}
function SuspendedBody({ profile, settings }: { profile: Profile; settings: Settings }) {
  const open = useExternal(); const demo = useDemo();
  const wa = settings.contact?.whatsapp || ''; const phone = settings.contact?.phone || '';
  const when = suspendedAt(profile);
  return (
    <div className="v2" dir="rtl">
      <div className="system-suspended">
        <main className="system-suspended__main">
          <span className="k-empty__ring" aria-hidden="true"><Icon name="blocked" size={44} /></span>
          <h1 className="system-suspended__title">החשבון הושעה</h1>
          <p className="system-suspended__text">מנהל השעה את הגישה שלך לאפליקציית הצוות{when ? ` ב־${ddmm(when)}` : ''}. כדי לברר, פונים לחווה.</p>
        </main>
        <div className="system-suspended__actions">
          <ToastStack />
          {wa && <button type="button" className="system-bigbtn" onClick={() => open(waUrl(wa))}><Icon name="message" size={22} />וואטסאפ לחווה</button>}
          {phone && <button type="button" className="system-bigbtn system-bigbtn--line" onClick={() => open(telUrl(phone))}><Icon name="phone" size={20} />התקשרות</button>}
          <button type="button" className="system-bigbtn system-bigbtn--quiet" onClick={() => signOutEverywhere(demo.on)}>יציאה מהחשבון</button>
        </div>
      </div>
    </div>
  );
}
