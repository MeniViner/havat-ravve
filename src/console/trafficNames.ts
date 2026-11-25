// The Hebrew names of what the visit counters count (api/src/traffic.ts), for both layouts of ביקורים ושימוש.
import type { Traffic } from './source';

export const SOURCE: Record<string, string> = { direct: 'ישירות (קישור שמור או הקלדה)', whatsapp: 'וואטסאפ', google: 'גוגל', search: 'מנוע חיפוש אחר', facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק', qr: 'שלט עם QR', other: 'אתר אחר' };
export const SECTION: Record<string, string> = { home: 'פתיחה', story: 'הסיפור שלנו', heritage: 'שורשים ומורשת', experiences: 'מה חווים כאן', events: 'אירועים', visit: 'איך מגיעים', contact: 'תיאום ביקור' };
export const CLICK: Record<string, string> = { app: 'כניסה לאפליקציה', whatsapp: 'וואטסאפ', waze: 'ניווט בווייז', phone: 'התקשרות', email: 'מייל', calendar: 'הוספת אירוע ליומן', archive: 'ארכיון האירועים', share: 'שיתוף האתר', social: 'רשת חברתית', external: 'קישור לאתר אחר', install: 'התקנת האפליקציה', notify: 'התראות על אירועים' };
export const DEVICE: Record<string, string> = { mobile: 'טלפון', desktop: 'מחשב', installed: 'מותקנת' };
export const DEPTH: Record<string, string> = { d25: 'רק ההתחלה', d50: 'עד האמצע', d75: 'רוב הדף', d100: 'עד הסוף' };
export const TIME: Record<string, string> = { t10: 'פחות מ־10 שניות', t60: 'עד דקה', t180: 'דקה עד 3', tlong: 'יותר מ־3 דקות' };
export const SCREEN: Record<string, string> = { home: 'בית', day: 'היום', tasks: 'משימות', shopping: 'קניות', farm: 'החווה', manage: 'ניהול', event: 'אירוע (צוות)', events: 'אירועים', people: 'אנשים', places: 'מקומות', projects: 'פרויקטים', notifications: 'התראות', me: 'הכרטיסים והחשבון', new: 'הוספה', search: 'חיפוש', vendor: 'דוכנים', welcome: 'ברוכים הבאים', install: 'התקנה', visit: 'בקשת ביקור', donate: 'תרומה', contact: 'יצירת קשר', login: 'כניסה', calendar: 'יומן', more: 'עוד', terms: 'תנאים', offline: 'בלי חיבור', other: 'אחר' };
export const ROLE: Record<string, string> = { owner: 'בעלים', manager: 'מנהלים', staff: 'מתנדבים', vendor: 'דוכנים', guest: 'אורחים', signedout: 'בלי חשבון' };

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** A year only when the answer says the server counts that far back (`maxDays`, a newer Worker; today's stops at 90 days). */
export const trafficPeriods = (d: Traffic | null): readonly number[] => (((d as (Traffic & { maxDays?: number }) | null)?.maxDays || 90) >= 365 ? [7, 30, 90, 365] : [7, 30, 90]);
