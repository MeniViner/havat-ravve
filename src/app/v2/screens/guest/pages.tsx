// Pages around the guest screens, moved from the old Guest.tsx / Account.tsx to the kit: terms and privacy (public), account
// deletion (public page, the link Google Play asks for, and the request), the screen while a deletion is scheduled, and the
// blocked guest's page. The deletion request is one document written with the server's time (firestore.rules); the Worker
// removes the account after 30 days (api/src/accounts.ts).
import { useState, type ReactNode } from 'react';
import { AppScreen, go, useToast, ToastProvider } from '../../core';
import { BottomBar, Button, ConfirmSheet, EmptyState, PageTitle, SectionTitle, TopBar } from '../../kit';
import { useDoc, write, serverNow } from '../../../db';
import { isOwner } from '../../../store';
import { useDemo } from '../../../demo/store';
import { now } from '../../../clock';
import { back } from '../../../router';
import { ddmm, firstName } from '../../format';
import { signOutEverywhere } from '../system/profile';
import type { Profile, Settings } from '../../../types';
import type { GuestCtx } from './data';
import { ContactLinks } from './forms';
import { Note } from './parts';

// ---------- account deletion: data ----------
export const DELETION_DAYS = 30;
export type DeletionRequest = { id: string; uid: string; email: string; requestedAt: unknown };
export const useDeletionRequest = (uid: string | undefined) => useDoc<DeletionRequest>('account_deletions/' + (uid || '_'), !!uid);
/** Firestore Timestamp, ISO string (demo), or null while the server time is still pending (offline). */
function requestedDate(v: unknown): Date {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v);
  return now();
}
export const deletionDate = (r: DeletionRequest) => new Date(requestedDate(r.requestedAt).getTime() + DELETION_DAYS * 86_400_000);

const link = (to: string, text: string) => <button type="button" className="guest-inlinelink" onClick={() => go(to)}>{text}</button>;
const Lead = ({ children }: { children: ReactNode }) => <p className="guest-lead">{children}</p>;

// ---------- terms and privacy (public: /app/terms, /app/privacy) ----------
const POLICY_UPDATED = '23 בנובמבר 2026';
export function TermsPage() {
  const sections: [string, ReactNode][] = [
    ['מי אנחנו', 'חוות רווה, ליד טנא עומרים, מפעילה את האפליקציה ואת האתר havat-ravve.web.app. האפליקציה משמשת את צוות החווה, מתנדבים ואורחים: משימות, קניות, אירועים וכרטיסים, ביקורים ותרומות.'],
    ['איזה מידע נשמר', <>
      <b>חשבון:</b> השם, כתובת המייל וחשבון Google שאיתו נכנסתם, מספר הטלפון והתשובות שמילאתם בהרשמה.<br />
      <b>פעילות:</b> כרטיסים שהזמנתם, ביקורים שתיאמתם, תרומות (סכום, הקדשה, שם לקבלה), חשבונות בדוכן, ומצב התשלום. אין סליקה באפליקציה, ופרטי כרטיס אשראי לא נשמרים בה.<br />
      <b>צוות:</b> משימות וקניות, תמונות שצילמתם למשימה או לקנייה, מקומות בחווה (המיקום נקרא רק כשמסמנים מקום), והיסטוריה של מי עשה מה.<br />
      <b>בטלפון:</b> עותק של הנתונים נשמר במכשיר כדי שהאפליקציה תעבוד בלי קליטה. המצלמה משמשת לסריקת כרטיסים ולצילום תמונות; הסריקה עצמה לא נשמרת. אין באפליקציה פרסומות, ואין כלי מעקב של חברות אחרות.<br />
      <b>ספירת ביקורים:</b> אנחנו סופרים בעצמנו, בלי שם, בלי מזהה ובלי כתובת, כמה פעמים נפתח האתר ונפתחו מסכי האפליקציה, מאיזה סוג מכשיר, מאיפה הגיעו לאתר (למשל מגוגל או מוואטסאפ) ובאיזה תפקיד (צוות, אורח). נשמרים רק מונים לכל יום. בדפדפן נשמר תאריך הביקור האחרון, כדי לא לספור אתכם פעמיים באותו יום.
    </>],
    ['למה משמש המידע', 'תפעול החווה: הכרטיסים שלכם, הביקורים והתרומות, ולצוות: משימות ופריטים לצד שמכם. יצירת קשר אתכם בנוגע לפעילות שלכם, ושליחת אישור תשלום בוואטסאפ או במייל, לפי מה שבחרתם. המידע לא נמכר ולא משמש לפרסום.'],
    ['מי רואה מה', 'חברי צוות רואים את שמות חברי הצוות האחרים ליד משימות, ובאירוע את שמות האורחים בכניסה ובדוכן. מנהלי החווה רואים את פרטי הקשר של הנרשמים ואת התשלומים. אורחים רואים רק את הפעילות של עצמם.'],
    ['ספקים שמעבדים מידע בשבילנו', 'Google Firebase: כניסה עם Google, מסד הנתונים (שמור בשרתים בישראל) ואחסון האתר. Cloudflare: שרת קטן שדרכו עובדים הכלים של מנהלי החווה, כולל עוזר דיגיטלי שפועל בהרשאה שלהם, ושולח את אישורי התשלום במייל. Brevo: שליחת אישור התשלום במייל, רק למי שבחר מייל. כשמנהל שולח לכם הודעה בוואטסאפ, היא יוצאת מהוואטסאפ שלו.'],
    ['אבטחה', 'כל התעבורה מוצפנת (HTTPS). כל אחד רואה ומשנה רק מה שהתפקיד שלו מתיר, וזה נאכף בשרת ולא רק במסך. מפתחות הגישה לשרתים לא נשמרים בקוד.'],
    ['כמה זמן נשמר ומחיקה', <>המידע נשמר כל עוד החשבון פעיל. אפשר למחוק את החשבון בעצמכם בכל עת: החשבון שלי ← מחיקת החשבון, או בעמוד {link('/delete-account', 'מחיקת חשבון')}. החשבון נמחק לצמיתות 30 יום אחרי הבקשה, ועד אז אפשר לבטל. סכומים ותאריכים של תשלומים ותרומות נשארים בלי שם, להנהלת החשבונות.</>],
    ['הזכויות שלכם', <>לפי חוק הגנת הפרטיות אפשר לעיין במידע שלכם, לתקן אותו ולבקש למחוק אותו. את השם, הטלפון ופרטי ההרשמה מתקנים בעצמכם בחשבון. לכל בקשה אחרת: {link('/contact', 'פנייה למנהלים')}.</>],
    ['גיל', 'ההרשמה מיועדת לבני 18 ומעלה. ילדים מגיעים לאירועים עם הורה שמזמין בשבילם.'],
    ['תנאי שימוש', 'משתמשים באפליקציה רק לפעילות של החווה ובהתאם לתפקיד. כרטיסים, ביקורים ותרומות כפופים לתנאים שמופיעים בכל אירוע או טופס. אין להעביר את החשבון לאחר. החווה רשאית להשעות חשבון שמשמש לרעה.'],
    ['שינויים', 'אם המדיניות תשתנה, נעדכן כאן את התאריך, ועל שינוי מהותי נודיע באפליקציה.'],
  ];
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar className="guest-pull" back={{ label: 'חזרה', onClick: () => back('/') }} />
      <div className="guest-titleblock"><PageTitle size="detail">תנאי שימוש ופרטיות</PageTitle><span className="guest-sub">חוות רווה · עודכן ב־{POLICY_UPDATED}</span></div>
      {sections.map(([h, t]) => <section key={h} className="guest-section"><SectionTitle>{h}</SectionTitle><Lead>{t}</Lead></section>)}
    </AppScreen>
  );
}

// ---------- account deletion ----------
const WHAT = [
  ['נמחק', 'החשבון שלכם (הכניסה עם Google), השם, הטלפון, המייל והתשובות שמילאתם בהרשמה. גם השם והטלפון שעל הכרטיסים, הביקורים, התרומות וחשבונות הדוכן שלכם.'],
  ['נשאר בלי שם', 'סכומים ותאריכים של תשלומים ותרומות, כי החווה צריכה אותם להנהלת החשבונות. אם הייתם בצוות, השם שלכם נשאר ליד משימות שביצעתם בהיסטוריה של החווה.'],
];
/** /delete-account: the public explanation, and the request itself for a signed-in person (Q8 confirmation first). */
export function DeleteAccountPage({ ctx }: { ctx: GuestCtx }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const p = ctx.profile;
  const owner = !!p && isOwner(p, ctx.user?.email);
  const request = async () => {
    if (!p) return;
    try { await write.set('account_deletions', p.uid, { uid: p.uid, email: p.email, requestedAt: serverNow() }); } // the app then shows the scheduled screen
    catch (e) { toast.refused('לא נשמר. ' + (e instanceof Error ? e.message : '')); }
  };
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar className="guest-pull" back={{ label: 'חזרה', onClick: () => back('/') }} />
      <div className="guest-titleblock"><PageTitle size="detail">מחיקת החשבון</PageTitle><span className="guest-sub">{p ? <>{p.displayName} · <bdi>{p.email}</bdi></> : 'חוות רווה'}</span></div>
      <Lead>
        {p ? 'אפשר למחוק את החשבון שלכם באפליקציה של חוות רווה מכאן.' : 'כל מי שנרשם לאפליקציה של חוות רווה יכול למחוק את החשבון בעצמו.'}
        {' '}החשבון נמחק לצמיתות {DELETION_DAYS} ימים אחרי הבקשה. עד אז אפשר להתחרט: נכנסים שוב ולוחצים "ביטול המחיקה".
      </Lead>
      {WHAT.map(([h, t]) => <section key={h} className="guest-section"><SectionTitle>{h}</SectionTitle><Lead>{t}</Lead></section>)}
      {!p && <>
        <Button size="lg" block icon="user" onClick={() => go('/login?next=/delete-account')}>כניסה כדי למחוק את החשבון</Button>
        <Note>הדרך באפליקציה: החשבון שלי ← עריכת פרטים ← מחיקת החשבון. אי אפשר להיכנס? {link('/contact', 'פנייה למנהלים')} ונמחק בשבילכם.</Note>
      </>}
      {p && owner && <Note>בעלי החווה לא מוחקים את החשבון מהאפליקציה, כדי שהחווה לא תישאר בלי מנהל. קודם מעבירים את הבעלות לאדם אחר.</Note>}
      {p && !owner && <>
        <Button variant="secondary" size="lg" block icon="trash" className="guest-delete" onClick={() => setAsk(true)}>מחיקת החשבון</Button>
        <Note>אחרי האישור החשבון ננעל עד המחיקה. {link('/terms', 'מדיניות הפרטיות')}</Note>
        <ConfirmSheet open={ask} onClose={() => setAsk(false)} title="למחוק את החשבון?" confirmLabel="מחיקת החשבון" onConfirm={request}
          text={`החשבון ננעל עכשיו ונמחק לצמיתות אחרי ${DELETION_DAYS} ימים. עד אז אפשר לבטל.`} />
      </>}
    </AppScreen>
  );
}

/** Shown instead of the app while a deletion is scheduled. */
export function DeletionScheduledPage({ profile, request }: { profile: Profile; request: DeletionRequest }) {
  return <ToastProvider><Scheduled profile={profile} request={request} /></ToastProvider>;
}
function Scheduled({ profile, request }: { profile: Profile; request: DeletionRequest }) {
  const toast = useToast(); const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const when = deletionDate(request);
  const cancel = async () => {
    setBusy(true);
    try { await write.remove('account_deletions', profile.uid); toast.show({ text: 'המחיקה בוטלה. החשבון פעיל.', check: true }); }
    catch (e) { toast.refused('לא בוטל. ' + (e instanceof Error ? e.message : '')); }
    finally { setBusy(false); }
  };
  return (
    <AppScreen variant="root" gap={12} noNav bar={<BottomBar>
      <Button size="bar" grow disabled={busy} onClick={cancel}>ביטול המחיקה</Button>
      <Button variant="secondary" size="bar" onClick={() => signOutEverywhere(demo.on, profile)}>יציאה</Button>
    </BottomBar>}>
      <div className="guest-titleblock"><PageTitle size="detail">החשבון יימחק</PageTitle><span className="guest-sub"><bdi>{profile.email}</bdi></span></div>
      <Lead>שלום {firstName(profile.displayName)}. ביקשת למחוק את החשבון. ב־{ddmm(when.toISOString())} הוא יימחק לצמיתות יחד עם הפרטים שלך.</Lead>
      <Note>עד אז החשבון נעול. התחרטת? אפשר לבטל עכשיו, והכול יחזור כמו שהיה.</Note>
    </AppScreen>
  );
}

// ---------- a blocked guest ----------
/** A personal greeting, WhatsApp with the text filled in, and the line that the site stays open to view. */
export function BlockedPage({ profile, settings }: { profile: Profile; settings: Settings }) {
  return <ToastProvider><Blocked profile={profile} settings={settings} /></ToastProvider>;
}
function Blocked({ profile, settings }: { profile: Profile; settings: Settings }) {
  const demo = useDemo();
  return (
    <AppScreen variant="plain" gap={14} noNav>
      <EmptyState variant="blocked" icon="blocked" title="החשבון הושעה" text={`שלום ${firstName(profile.displayName)}. החשבון הזה חסום כרגע להזמנת כרטיסים.`} />
      <ContactLinks settings={settings} message="שלום, החשבון שלי באפליקציה של חוות רווה חסום. אפשר לבדוק?" />
      <Note>האתר, האירועים ותיאום ביקור עדיין פתוחים לצפייה.</Note>
      <Button variant="outline" onClick={() => signOutEverywhere(demo.on, profile)}>יציאה מהחשבון</Button>
    </AppScreen>
  );
}
