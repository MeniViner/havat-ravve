import { useState } from 'react';
import type { TeamCtx, GuestCtx } from '../ctx';
import type { Profile } from '../types';
import { ROLE_LABELS } from '../types';
import { Top, Ledger, Sec, Btn, Icon, A, Field, Input, Select, SwitchRow, Avatar, Chips, useToast, todayISO, addDays } from '../ui';
import { navigate } from '../router';
import { signOutUser } from '../firebase';
import { updateOwnProfile, useHistoryTasks, useOpenTasks } from '../store';
import { useDemo, setDemo, resetDemoData, PERSONA_LABELS, type Persona } from '../demo/store';

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
        <InstallHint />
        <A to="/terms"><Icon name="info" />תנאי שימוש ופרטיות<Icon name="chev" className="chev" size={18} /></A>
        <a href="/" target="_blank" rel="noopener"><Icon name="globe" />האתר של החווה<Icon name="chev" className="chev" size={18} /></a>
      </div>
      <DemoSection />
      <SignOut />
      <p className="lead" style={{ paddingTop: 20, fontSize: 13 }}>חוות רווה · גרסה 2.0 · עובד בלי קליטה, מסתנכרן כשיש</p>
    </>
  );
}

export function ProfileSection({ profile, fields }: { profile: Profile; fields: GuestCtx['settings']['registrationFields'] }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ displayName: profile.displayName, phone: profile.phone, fields: { ...(profile.fields || {}) } });
  const toast = useToast();
  const save = async () => { try { await updateOwnProfile(profile.uid, f); setEdit(false); toast({ text: 'נשמר' }, 2000); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } };
  return (
    <>
      <Sec title="הפרטים שלי" link={edit ? 'ביטול' : 'עריכה'} onLink={() => setEdit(!edit)} />
      {!edit ? <dl className="kv"><dt>שם בעברית</dt><dd>{profile.displayName}</dd><dt>טלפון</dt><dd className="ltr">{profile.phone || '—'}</dd>{fields.map((x) => <span key={x.id} style={{ display: 'contents' }}><dt>{x.label}</dt><dd>{profile.fields?.[x.id] || <span className="muted">—</span>}</dd></span>)}</dl>
        : <>
          <Field label="שם בעברית"><Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="טלפון"><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          {fields.map((x) => <Field key={x.id} label={x.label}>{x.type === 'choice' ? <Select value={f.fields[x.id] || ''} onChange={(e) => setF({ ...f, fields: { ...f.fields, [x.id]: e.target.value } })}><option value="">בחירה…</option>{x.options.map((o) => <option key={o}>{o}</option>)}</Select> : <Input type={x.type === 'date' ? 'date' : 'text'} dir={x.type === 'date' ? 'ltr' : undefined} value={f.fields[x.id] || ''} onChange={(e) => setF({ ...f, fields: { ...f.fields, [x.id]: e.target.value } })} />}</Field>)}
          <div className="actions"><Btn disabled={!f.displayName.trim()} onClick={save}>שמירה</Btn></div>
        </>}
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
  return <div className="actions" style={{ paddingTop: 20 }}><Btn kind="ghost" icon="logout" onClick={() => demo.on && demo.persona !== 'real' ? setDemo({ persona: 'anon' }) : signOutUser().then(() => navigate('/', true))}>יציאה מהחשבון במכשיר הזה</Btn><p className="lead" style={{ padding: 0, fontSize: 13 }}>בפעם הבאה תצטרכו להיכנס שוב עם Google.</p></div>;
}

/** Demo mode: show the example data on top of real data, or walk through the app as one of the example people. */
export function DemoSection() {
  const demo = useDemo();
  const toast = useToast();
  const personas: Persona[] = ['real', 'owner', 'manager', 'staff', 'guest', 'blocked', 'anon'];
  return (
    <>
      <Sec title="מצב הדגמה" n={demo.on ? 'פעיל' : undefined} />
      <SwitchRow on={demo.on} onChange={(on) => { setDemo({ on, persona: on ? demo.persona : 'real' }); navigate('/', true); }} title="להציג נתוני דוגמה" meta="משימות, אירועים, אנשים ותרומות לדוגמה, על גבי הנתונים האמיתיים. אפשר להסתיר בכל רגע." />
      {demo.on && <>
        <Field label="לעבור באפליקציה בתור…" hint="בתור דמות לדוגמה שום דבר לא נשמר בשרת: הכל נשאר במכשיר הזה.">
          <Chips value={demo.persona} onChange={(persona) => { setDemo({ persona }); navigate('/', true); }} options={personas.map((p) => ({ value: p, label: PERSONA_LABELS[p] }))} />
        </Field>
        <div className="inline pad" style={{ paddingTop: 14 }}><Btn kind="ghost" size="sm" icon="repeat" onClick={() => { resetDemoData(); toast({ text: 'נתוני הדוגמה אופסו' }, 2500); }}>איפוס נתוני הדוגמה</Btn><Btn kind="quiet" size="sm" onClick={() => navigator.clipboard?.writeText(location.origin + '/app?demo=owner').then(() => toast({ text: 'הקישור הועתק: /app?demo=owner' }, 3000))}>קישור להדגמה</Btn></div>
      </>}
    </>
  );
}

