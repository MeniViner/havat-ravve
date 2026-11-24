import type { Monitor, SwitchesView, TestAlert } from './source';

export const phoneConfigured = (mode?: string) => mode === 'webpush' || mode === 'fcm';

export const PHONE_OFF = 'כבויה. צריך להפעיל שליחת התראות לטלפון בשרת.';
export const PHONE_SETUP = 'כבויה. צריך להשלים את החיבור לשירות ההתראות בשרת.';
export const EMAIL_OFF = 'כבויה. צריך להפעיל שליחת מיילים בשרת.';
export const EMAIL_SETUP = 'כבויה. צריך לחבר שירות לשליחת מיילים בשרת.';

export function sendingSwitches(v: SwitchesView) {
  const { email, push } = v.server;
  const s = v.switches;
  const emailBlocked = !email.on;
  const pushBlocked = !phoneConfigured(push.mode);
  const emailHelp = email.configured ? EMAIL_SETUP : EMAIL_OFF;
  const pushHelp = push.missing ? PHONE_SETUP : PHONE_OFF;
  return {
    email: { on: !emailBlocked && !s.emailPaused, blocked: emailBlocked, text: emailBlocked
      ? `אישורי תשלום במייל. השליחה ${emailHelp}`
      : s.emailPaused ? 'בהשהיה. אישורי תשלום ממתינים בתור.' : 'פעילה. אישורי תשלום נכנסים לתור אחרי סימון תשלום.' },
    push: { on: !pushBlocked && !s.pushPaused, blocked: pushBlocked, text: pushBlocked
      ? `התראות לטלפונים שבהם הופעלו התראות. השליחה ${pushHelp}`
      : s.pushPaused ? 'בהשהיה. ההתראות מופיעות באפליקציה, והתראות שממתינות מעל 6 שעות לא יישלחו לטלפון.' : 'פעילה. התראות שמיועדות לטלפון נשלחות למכשירים שבהם הן מופעלות.' },
    broadcast: { on: !emailBlocked && !s.broadcastEmailPaused, blocked: emailBlocked, text: emailBlocked
      ? `עותקי הודעות לנרשמים במייל. השליחה ${emailHelp}`
      : s.broadcastEmailPaused ? 'בהשהיה. הודעות שממתינות פחות מ־12 שעות יוכלו להישלח כשהשליחה תחזור.' : 'פעילה כשבוחרים לשלוח גם במייל בהודעה לנרשמים או לכל המשתמשים.' },
  };
}

export function monitorAlertControls(m: Monitor) {
  const a = m.alerts;
  const monitorPaused = !!m.monitorPaused;
  const missingMonitor = m.alertsAvailable === false;
  const blocked = monitorPaused || missingMonitor;
  const appOn = a.on && !blocked;
  const phoneOff = m.pushState !== 'enabled';
  const needsApp = 'כדי להפעיל, צריך להדליק קודם את ההתראות לבעלים.';
  const needsMonitor = missingMonitor ? 'כבויה. צריך להפעיל שמירת הגדרות ניטור בשרת.'
    : 'בהשהיה. כדי לקבל התראות, צריך להפעיל את הבדיקה האוטומטית במסך משימות מתוזמנות.';
  return {
    app: { on: appOn, blocked, text: blocked ? needsMonitor : appOn ? 'פעילה. בעיה שנמצאה בבדיקה תופיע בהתראות באפליקציה של הבעלים.' : 'כבויה. אפשר להפעיל התראות על בעיות באפליקציה של הבעלים.' },
    phone: { on: a.push && appOn && !phoneOff, blocked: !appOn || phoneOff,
      text: blocked ? needsMonitor : !a.on ? needsApp : m.pushState === 'off' ? PHONE_OFF : m.pushState === 'paused'
        ? 'בהשהיה. צריך להחזיר את השליחה לטלפון במסך מתגים.' : phoneOff ? 'מצב השליחה לטלפון אינו ידוע.'
          : a.push ? 'פעילה למכשירים שבהם הופעלו התראות, בין 07:00 ל־23:00.' : 'כבויה. אפשר לקבל גם בטלפון בין 07:00 ל־23:00.' },
    daily: { on: !!a.daily && appOn, blocked: !appOn, text: blocked ? needsMonitor : !a.on ? needsApp
      : a.daily ? 'פעיל. סיכום בכל בוקר, גם כשהכול תקין.' : 'כבוי. אפשר לקבל סיכום גם בבוקר שבו הכול תקין.' },
  };
}

export function testAlertText(r: TestAlert) {
  if (!(r.created || r.sent)) return 'התראת הבדיקה לא נשמרה.';
  const saved = 'התראת הבדיקה נשמרה באפליקציה.';
  if (!r.queued && !r.push) return saved;
  if (r.pushState === 'off') return saved + ' היא נוספה לתור, אבל השליחה לטלפון כבויה בשרת.';
  if (r.pushState === 'paused') return saved + ' היא נוספה לתור, והשליחה לטלפון בהשהיה.';
  return saved + ' היא נוספה לתור השליחה לטלפון.';
}

export const jobBlockedText = {
  phone: 'כבויה. צריך להפעיל שליחת התראות לטלפון בשרת.',
  email: 'כבויה. צריך להפעיל או לחבר שירות לשליחת מיילים בשרת.',
  storage: 'כבויה. צריך לחבר מקום אחסון לגיבויים ולארכיון בשרת.',
  settings: 'כבויה. צריך להפעיל שמירת הגדרות בשרת.',
};
