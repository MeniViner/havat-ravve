// Account deletion: one public page (/app/delete-account, the link Google Play asks for) and the screen a
// signed-in person sees while a deletion is scheduled. The request is a single document written with the
// server's time (firestore.rules); the Worker removes the account after 30 days (api/src/accounts.ts).
import { useState } from 'react';
import type { GuestCtx } from '../ctx';
import type { Profile } from '../types';
import { Top, Sec, Btn, A, Icon, useToast, fmtDateShort, firstName } from '../ui';
import { useDoc, write, serverNow } from '../db';
import { isOwner } from '../store';
import { SignOut } from './More';

export const DELETION_DAYS = 30;
export type DeletionRequest = { id: string; uid: string; email: string; requestedAt: unknown };

export const useDeletionRequest = (uid: string | undefined) => useDoc<DeletionRequest>('account_deletions/' + (uid || '_'), !!uid);

/** Firestore Timestamp, ISO string (demo), or null while the server time is still pending (offline). */
function requestedDate(v: unknown): Date {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v);
  return new Date();
}
export const deletionDate = (r: DeletionRequest) => new Date(requestedDate(r.requestedAt).getTime() + DELETION_DAYS * 86_400_000);

const WHAT = [
  ['נמחק', 'החשבון שלכם (הכניסה עם Google), השם, הטלפון, המייל והתשובות שמילאתם בהרשמה. גם השם והטלפון שעל הכרטיסים, הביקורים, התרומות וחשבונות הדוכן שלכם.'],
  ['נשאר בלי שם', 'סכומים ותאריכים של תשלומים ותרומות, כי החווה צריכה אותם להנהלת החשבונות. אם הייתם בצוות, השם שלכם נשאר ליד משימות שביצעתם בהיסטוריה של החווה.'],
];

/** /delete-account: the public explanation, and the request itself for a signed-in person. */
export function DeleteAccountPage({ ctx }: { ctx: GuestCtx }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const p = ctx.profile;
  const owner = !!p && isOwner(p, ctx.user?.email);
  const request = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await write.set('account_deletions', p.uid, { uid: p.uid, email: p.email, requestedAt: serverNow() });
      // the app now shows the scheduled screen (App reads this document)
    } catch (e) {
      toast({ text: 'הבקשה לא נשמרה. ' + (e instanceof Error ? e.message : ''), kind: 'error' });
      setBusy(false);
    }
  };
  return (
    <>
      <Top back title="מחיקת החשבון" sub={p ? `${p.displayName} · ${p.email}` : 'חוות רווה'} />
      <p className="lead ink" style={{ fontSize: 17 }}>
        {p ? 'אפשר למחוק את החשבון שלכם באפליקציה של חוות רווה מכאן.' : 'כל מי שנרשם לאפליקציה של חוות רווה יכול למחוק את החשבון בעצמו.'}
        {' '}החשבון נמחק לצמיתות {DELETION_DAYS} ימים אחרי הבקשה. עד אז אפשר להתחרט: נכנסים שוב ולוחצים "ביטול המחיקה".
      </p>
      {WHAT.map(([h, t]) => <div key={h}><Sec title={h} /><p className="lead ink">{t}</p></div>)}
      <div className="actions" style={{ paddingTop: 24 }}>
        {!p && <>
          <Btn size="big" icon="user" to="/login?next=/delete-account">כניסה כדי למחוק את החשבון</Btn>
          <p className="lead" style={{ padding: 0, fontSize: 14 }}>
            הדרך באפליקציה: החשבון שלי ← מחיקת החשבון. אי אפשר להיכנס? <A to="/contact" style={{ textDecoration: 'underline' }}>פנייה למנהלים</A> ונמחק בשבילכם.
          </p>
        </>}
        {p && owner && <p className="lead" style={{ padding: 0 }}>בעלי החווה לא מוחקים את החשבון מהאפליקציה, כדי שהחווה לא תישאר בלי מנהל. קודם מעבירים את הבעלות לאדם אחר.</p>}
        {p && !owner && <>
          <Btn kind="rustfill" size="big" icon="trash" disabled={busy} onClick={request}>מחיקת החשבון</Btn>
          <p className="lead" style={{ padding: 0, fontSize: 14 }}>אחרי הלחיצה החשבון ננעל עד המחיקה. <A to="/terms" style={{ textDecoration: 'underline' }}>מדיניות הפרטיות</A></p>
        </>}
      </div>
    </>
  );
}

/** Shown instead of the app while a deletion is scheduled. */
export function DeletionScheduledPage({ profile, request }: { profile: Profile; request: DeletionRequest }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const when = deletionDate(request);
  const cancel = async () => {
    setBusy(true);
    try { await write.remove('account_deletions', profile.uid); toast({ text: 'המחיקה בוטלה. החשבון פעיל.' }, 3000); }
    catch (e) { toast({ text: 'לא בוטל. ' + (e instanceof Error ? e.message : ''), kind: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="app"><div className="screen" style={{ paddingBottom: 20 }}>
      <Top title="החשבון יימחק" sub={profile.email} />
      <p className="lead ink" style={{ fontSize: 17 }}>
        שלום {firstName(profile.displayName)}. ביקשת למחוק את החשבון. ב־{fmtDateShort(when.toISOString())} הוא יימחק לצמיתות יחד עם הפרטים שלך.
      </p>
      <p className="lead">עד אז החשבון נעול. התחרטת? אפשר לבטל עכשיו, והכול יחזור כמו שהיה.</p>
      <div className="actions" style={{ paddingTop: 24 }}>
        <Btn size="big" icon="repeat" disabled={busy} onClick={cancel}>ביטול המחיקה</Btn>
        <SignOut />
      </div>
    </div></div>
  );
}

/** The row in "my account" (guest) and "more" (team). */
export function DeleteAccountLink() {
  return <A to="/delete-account"><Icon name="trash" />מחיקת החשבון<Icon name="chev" className="chev" size={18} /></A>;
}
