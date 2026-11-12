// Pieces of "my account" that the guest and the team member share: details, install, demo, sign out.
import { useState } from 'react';
import type { GuestCtx } from '../ctx';
import type { Profile } from '../types';
import { useToast } from '../ui';
import { Sect, Btn, Form, Field, Tick } from '../kit';
import { navigate } from '../router';
import { signOutUser } from '../firebase';
import { updateOwnProfile } from '../store';
import { useDemo, setDemo, resetDemoData, PERSONA_LABELS, type Persona } from '../demo/store';

export function ProfileSection({ profile, fields }: { profile: Profile; fields: GuestCtx['settings']['registrationFields'] }) {
  const start = () => ({ displayName: profile.displayName, phone: profile.phone, fields: { ...(profile.fields || {}) } });
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(start);
  const [err, setErr] = useState('');
  const toast = useToast();
  const open = () => { setF(start()); setErr(''); setEdit(true); };
  const save = async () => {
    if (f.displayName.trim().length < 2) { setErr('צריך שם'); return; }
    if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 9) { setErr('מספר הטלפון קצר מדי'); return; }
    try { await updateOwnProfile(profile.uid, f); setEdit(false); toast({ text: 'הפרטים נשמרו' }, 2000); } catch (e) { setErr((e as Error).message || 'לא נשמר'); }
  };
  const setField = (id: string, v: string) => setF({ ...f, fields: { ...f.fields, [id]: v } });
  return (
    <section>
      <Sect title="הפרטים שלי" more={edit ? undefined : 'עריכה'} onMore={open} />
      {!edit ? (
        <dl className="r-facts" style={{ marginTop: 4 }}>
          <div><dt>שם</dt><dd>{profile.displayName}</dd></div>
          <div><dt>טלפון</dt><dd dir="ltr" style={{ textAlign: 'right' }}>{profile.phone || '—'}</dd></div>
          <div><dt>מייל</dt><dd dir="ltr" style={{ textAlign: 'right', fontSize: 16 }}>{profile.email}</dd></div>
          {fields.map((x) => <div key={x.id}><dt>{x.label}</dt><dd>{profile.fields?.[x.id] || '—'}</dd></div>)}
        </dl>
      ) : (
        <Form onSubmit={save}>
          <Field label="שם בעברית">{(id) => <input id={id} className="r-input" value={f.displayName} onChange={(e) => { setF({ ...f, displayName: e.target.value }); setErr(''); }} maxLength={80} autoComplete="name" />}</Field>
          <Field label="טלפון">{(id) => <input id={id} className="r-input" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setErr(''); }} maxLength={25} autoComplete="tel" />}</Field>
          {fields.map((x) => (
            <Field key={x.id} label={x.label}>{(id) => x.type === 'choice'
              ? <select id={id} className="r-input" value={f.fields[x.id] || ''} onChange={(e) => setField(x.id, e.target.value)}><option value="">לבחור…</option>{x.options.map((o) => <option key={o}>{o}</option>)}</select>
              : <input id={id} className="r-input" type={x.type === 'date' ? 'date' : 'text'} dir={x.type === 'date' ? 'ltr' : undefined} value={f.fields[x.id] || ''} onChange={(e) => setField(x.id, e.target.value)} />}</Field>
          ))}
          {err && <p className="r-err" role="alert">{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}><Btn type="submit" style={{ flex: 1 }}>שמירה</Btn><Btn kind="quiet" onClick={() => setEdit(false)}>ביטול</Btn></div>
        </Form>
      )}
    </section>
  );
}

/** How to put the app on the home screen. Opens in place: no system dialog. */
export function InstallHint() {
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  if (standalone) return null;
  const ios = /iP(hone|ad)/.test(navigator.userAgent);
  return (
    <details className="g-install">
      <summary className="r-linkrow"><div>להתקין על מסך הבית <span>· נפתח כמו אפליקציה, גם בלי קליטה</span></div></summary>
      <ol>
        {ios
          ? <><li>פותחים את הדף הזה בספארי.</li><li>לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה).</li><li>בוחרים ״הוספה למסך הבית״.</li></>
          : <><li>פותחים את תפריט הדפדפן (שלוש נקודות).</li><li>בוחרים ״התקנת האפליקציה״ או ״הוספה למסך הבית״.</li></>}
      </ol>
    </details>
  );
}

/** Two steps in place of a system confirm: the first press asks, the second signs out. */
export function SignOut() {
  const demo = useDemo();
  const [ask, setAsk] = useState(false);
  const toast = useToast();
  const out = () => {
    if (demo.on) { setDemo({ persona: 'anon' }); navigate('/', true); return; }
    signOutUser().then(() => navigate('/', true)).catch(() => toast({ text: 'היציאה לא הצליחה. נסו שוב.', kind: 'error' }));
  };
  return (
    <div className="r-actions" style={{ paddingTop: 26 }}>
      {!ask ? <Btn kind="ghost" onClick={() => setAsk(true)}>יציאה מהחשבון</Btn>
        : <><p style={{ flexBasis: '100%', fontSize: 16 }}>לצאת מהחשבון במכשיר הזה? בפעם הבאה תיכנסו שוב עם Google.</p><Btn kind="ghost" onClick={out}>כן, לצאת</Btn><Btn kind="quiet" onClick={() => setAsk(false)}>להישאר</Btn></>}
    </div>
  );
}

/** Demo mode is a sandbox: while it is on the real data is not shown and nothing is written to the server. */
export function DemoSection({ role }: { role: Profile['role'] }) {
  const demo = useDemo();
  const toast = useToast();
  const personas: Persona[] = ['owner', 'manager', 'staff', 'guest', 'blocked', 'anon'];
  const copy = () => {
    const url = location.origin + '/app?demo=owner';
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast({ text: 'הקישור הועתק' }, 2500)).catch(() => toast({ text: url }, 6000));
  };
  return (
    <section>
      <Sect title="מצב הדגמה" n={demo.on ? 'פעיל' : undefined} />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Tick on={demo.on} onChange={(on) => { setDemo({ on }, role); navigate('/', true); }} help="אנשים, משימות ואירועים לדוגמה. הנתונים האמיתיים לא מוצגים, ושום דבר לא נשמר בשרת.">לעבור לנתוני דוגמה</Tick>
        {demo.on && <>
          <Field label="לעבור באפליקציה בתור">{(id) => <select id={id} className="r-input" value={demo.persona} onChange={(e) => { setDemo({ persona: e.target.value as Persona }); navigate('/', true); }}>{personas.map((p) => <option key={p} value={p}>{PERSONA_LABELS[p]}</option>)}</select>}</Field>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn kind="ghost" small onClick={() => { resetDemoData(); toast({ text: 'נתוני הדוגמה אופסו' }, 2500); }}>איפוס נתוני הדוגמה</Btn>
            <Btn kind="quiet" small onClick={copy}>להעתיק קישור להדגמה</Btn>
          </div>
        </>}
      </div>
    </section>
  );
}
