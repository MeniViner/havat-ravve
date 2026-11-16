import { useState } from 'react';
import type { TeamCtx } from '../ctx';
import type { Profile, RegistrationField } from '../types';
import { ROLE_LABELS } from '../types';
import { Top, Ledger, Sec, Btn, Icon, A, Field, SwitchRow, Avatar, Chips, useToast, todayISO, addDays } from '../ui';
import { navigate } from '../router';
import { signOutUser } from '../firebase';
import { updateOwnProfile, useHistoryTasks, useOpenTasks } from '../store';
import { useDemo, setDemo, resetDemoData, PERSONA_LABELS, type Persona } from '../demo/store';
import { RegistrationInputs, answerOf, profileDetailsComplete, signupQuestions, type ProfileDetails } from './RegistrationFields';

const PREF_KEY = 'farm-prefs';
const readPrefs = () => { try { return { assigned: true, urgent: true, eventDay: true, newEvents: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } as Record<string, boolean>; } catch { return { assigned: true, urgent: true, eventDay: true, newEvents: true }; } };

export function MoreScreen({ ctx }: { ctx: TeamCtx }) {
  const today = todayISO();
  const month = useHistoryTasks(true, ctx.manager, addDays(today, -30) + 'T00:00:00.000Z', today + 'T23:59:59.999Z');
  const open = useOpenTasks(true, ctx.manager);
  const mine = month.items.filter((t) => t.doneBy?.uid === ctx.actor.uid);
  const week = mine.filter((t) => (t.doneAt || '') >= addDays(today, -7)).length;
  return (
    <>
      <Top backTo="/" backLabel="היום" title={ctx.profile.displayName} sub={`${ROLE_LABELS[ctx.profile.role]} · ${ctx.profile.email}`} end={<Avatar name={ctx.profile.displayName} />} />
      <Ledger items={[{ n: open.items.filter((t) => t.assignee?.uid === ctx.actor.uid).length, label: 'עליך עכשיו' }, { n: week, label: 'ביצעת השבוע' }, { n: mine.length, label: 'החודש' }]} />
      <ProfileSection profile={ctx.profile} fields={ctx.settings.registrationFields} />
      <NotificationsSection team />
      <Sec title="עוד" />
      <div className="links">
        <A to="/me"><Icon name="ticket" />הכרטיסים והתרומות שלי<span className="s">כמו אורח, אם הזמנתי לאירוע</span><Icon name="chev" className="chev" size={18} /></A>
        <A to="/contact?from=team"><Icon name="phone" />פנייה למנהלים<Icon name="chev" className="chev" size={18} /></A>
        <InstallHint />
        <A to="/terms"><Icon name="info" />תנאי שימוש ופרטיות<Icon name="chev" className="chev" size={18} /></A>
        <a href="/" target="_blank" rel="noopener"><Icon name="globe" />האתר של החווה<Icon name="chev" className="chev" size={18} /></a>
      </div>
      <DemoSection role={ctx.owner ? 'owner' : ctx.manager ? 'manager' : ctx.profile.role} />
      <SignOut />
      <p className="lead" style={{ paddingTop: 20, fontSize: 13 }}>חוות רווה · גרסה 2.0 · עובד בלי קליטה, מסתנכרן כשיש</p>
    </>
  );
}

export function ProfileSection({ profile, fields }: { profile: Profile; fields: RegistrationField[] }) {
  const [draft, setDraft] = useState<Partial<ProfileDetails> | null>(null);
  const [busy, setBusy] = useState(false);
  const questions = signupQuestions(fields);
  const edit = draft !== null;
  const details = {
    displayName: draft?.displayName ?? profile.displayName,
    phone: draft?.phone ?? profile.phone,
    fields: { ...profile.fields, ...draft?.fields },
  };
  const toast = useToast();
  const save = async () => {
    if (!draft || !profileDetailsComplete(details, questions)) return;
    setBusy(true);
    try {
      await updateOwnProfile(profile.uid, draft);
      setDraft(null);
      toast({ text: 'נשמר' }, 2000);
    } catch {
      toast({ text: 'לא נשמר', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Sec title="הפרטים שלי" link={edit ? 'ביטול' : 'עריכה'} onLink={() => { if (!busy) setDraft(edit ? null : {}); }} />
      {!edit ? <dl className="kv"><dt>שם בעברית</dt><dd>{profile.displayName}</dd><dt>טלפון</dt><dd className="ltr">{profile.phone || '—'}</dd>{questions.map((field) => <span key={field.id} style={{ display: 'contents' }}><dt>{field.label}</dt><dd>{answerOf(profile.fields, field) || <span className="muted">—</span>}</dd></span>)}</dl>
        : <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <RegistrationInputs data={details} questions={questions} onChange={(patch) => setDraft((current) => ({ ...current, ...patch, fields: { ...current?.fields, ...patch.fields } }))} />
          <div className="actions"><Btn type="submit" disabled={!profileDetailsComplete(details, questions) || busy}>שמירה</Btn></div>
        </form>}
    </>
  );
}
export function NotificationsSection({ team }: { team: boolean }) {
  const [p, setP] = useState(readPrefs);
  const set = (k: string, v: boolean) => { const n = { ...p, [k]: v }; setP(n); try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch {} };
  return (
    <>
      <Sec title="התראות" />
      {team ? <>
        <SwitchRow on={p.assigned} onChange={(v) => set('assigned', v)} title="משימה חדשה הוקצתה לי" />
        <SwitchRow on={p.urgent} onChange={(v) => set('urgent', v)} title="משימה דחופה לכולם" />
        <SwitchRow on={p.eventDay} onChange={(v) => set('eventDay', v)} title="תזכורת ביום אירוע" />
      </> : <SwitchRow on={p.newEvents} onChange={(v) => set('newEvents', v)} title="עדכונים על אירועים חדשים" meta="התראה בטלפון כשמתפרסם אירוע" />}
      <p className="lead" style={{ fontSize: 13 }}>ההתראות עובדות אחרי שמתקינים על מסך הבית.</p>
    </>
  );
}
export function InstallHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  if (standalone) return null;
  const ios = /iP(hone|ad)/.test(navigator.userAgent);
  return <button type="button" onClick={() => alert(ios ? 'בספארי: כפתור שיתוף (הריבוע עם החץ) ← "הוספה למסך הבית".' : 'בתפריט הדפדפן (⋮) ← "התקנת אפליקציה" או "הוספה למסך הבית".')}><Icon name="download" />להתקין על מסך הבית<span className="s">{ios ? 'שיתוף ← הוספה למסך הבית' : 'מהתפריט של הדפדפן'}</span><Icon name="chev" className="chev" size={18} /></button>;
}
export function SignOut() {
  const demo = useDemo();
  return <div className="actions" style={{ paddingTop: 20 }}><Btn kind="ghost" icon="logout" onClick={() => demo.on ? setDemo({ persona: 'anon' }) : signOutUser().then(() => navigate('/', true))}>יציאה מהחשבון במכשיר הזה</Btn><p className="lead" style={{ padding: 0, fontSize: 13 }}>בפעם הבאה תצטרכו להיכנס שוב עם Google.</p></div>;
}

/**
 * Demo mode: walk through the app as one of the example people. It is a sandbox: while it is on the real data is not shown
 * and nothing is written to the server. It starts as the example person with the same role as the signed-in account.
 */
export function DemoSection({ role }: { role: Profile['role'] }) {
  const demo = useDemo();
  const toast = useToast();
  const personas: Persona[] = ['owner', 'manager', 'staff', 'guest', 'blocked', 'anon', 'new'];
  return (
    <>
      <Sec title="מצב הדגמה" n={demo.on ? 'פעיל' : undefined} />
      <SwitchRow on={demo.on} onChange={(on) => { setDemo({ on }, role); navigate('/', true); }} title="לעבור לנתוני דוגמה" meta="האפליקציה נפתחת עם אנשים, משימות ואירועים לדוגמה. בזמן ההדגמה הנתונים האמיתיים לא מוצגים, ושום דבר לא נשמר בשרת." />
      {demo.on && <>
        <Field label="לעבור באפליקציה בתור…" hint="כל מה שעושים בהדגמה נשאר במכשיר הזה בלבד. כדי לחזור לעבודה אמיתית מכבים את ההדגמה.">
          <Chips value={demo.persona} onChange={(persona) => { setDemo({ persona }); navigate('/', true); }} options={personas.map((p) => ({ value: p, label: PERSONA_LABELS[p] }))} />
        </Field>
        <div className="inline pad" style={{ paddingTop: 14 }}><Btn kind="ghost" size="sm" icon="repeat" onClick={() => { resetDemoData(); toast({ text: 'נתוני הדוגמה אופסו' }, 2500); }}>איפוס נתוני הדוגמה</Btn><Btn kind="quiet" size="sm" onClick={() => navigator.clipboard?.writeText(location.origin + '/app?demo=owner').then(() => toast({ text: 'הקישור הועתק: /app?demo=owner' }, 3000))}>קישור להדגמה</Btn></div>
      </>}
    </>
  );
}
