// The owners' switches in words, one way for every screen that tells of a change (K13's list and K16's log): a switch is
// on or off as מתגים shows it. Most are kept as "is it stopped", so the stored value is the other way round.
/** A switch's name on the screen, and whether the screen shows the stored value the other way round (on = not stopped). */
const NAMES: Record<string, [string, boolean]> = {
  maintenance: ['מצב תחזוקה', false], readOnly: ['קריאה בלבד', false], registrationClosed: ['הרשמה פתוחה', true], emailPaused: ['מיילים על תשלומים', true],
  pushPaused: ['התראות לטלפון', true], broadcastEmailPaused: ['הודעות במייל לנרשמים', true], keysStopped: ['כל המפתחות פעילים', true],
  backupPaused: ['גיבוי לילי', true], monitorPaused: ['בדיקת האתר והמכסה', true], cleanupPaused: ['ניקוי רשומות ישנות', true],
};
const TEXT_NAME = 'ההודעה במסך התחזוקה';
/** What the server calls each stored value in its log (api/src/control.ts SWITCH_HE), to know which switch a line means. */
const SERVER: Record<string, string> = {
  'השהיית מיילים על תשלומים': 'emailPaused', 'השהיית התראות לטלפון': 'pushPaused', 'השהיית מיילים לנרשמים': 'broadcastEmailPaused', 'עצירת מפתחות API': 'keysStopped',
  'קריאה בלבד': 'readOnly', 'מצב תחזוקה': 'maintenance', 'סגירת ההרשמה': 'registrationClosed', 'השהיית הגיבוי': 'backupPaused', 'השהיית הניטור': 'monitorPaused', 'השהיית הניקוי': 'cleanupPaused',
  'הודעת התחזוקה': 'maintenanceText',
};
/** One change: which switch, and whether it is on now (null: a text was changed). */
export type SwitchSaid = { name: string; on: boolean | null };
export const switchKnown = (key: string) => key in NAMES;
/** A stored change ("emailPaused became true") as the owner sees it ("מיילים על תשלומים" is off). */
export function switchSaid(key: string, to: boolean): SwitchSaid {
  const [name, flip] = NAMES[key] || ['מתג אחר', false];
  return { name, on: flip ? !to : to };
}
export const switchTextSaid: SwitchSaid = { name: TEXT_NAME, on: null };
export const switchVerb = (on: boolean | null) => (on === null ? 'שינה' : on ? 'הדליק' : 'כיבה');
/** A log line's detail: the server's words ("השהיית מיילים לנרשמים: כבוי · למה"), or the stored keys themselves. */
export function readSwitchDetail(detail: string): { said: SwitchSaid[]; reason: string } {
  const cut = detail.indexOf(' · ');
  const said: SwitchSaid[] = [];
  for (const part of (cut < 0 ? detail : detail.slice(0, cut)).split(', ')) {
    const m = /^(.+): (דלוק|כבוי|שונה)$/.exec(part.trim());
    const key = m && SERVER[m[1]];
    if (key) said.push(m![2] === 'שונה' ? switchTextSaid : switchSaid(key, m![2] === 'דלוק'));
  }
  if (said.length) return { said, reason: cut < 0 ? '' : detail.slice(cut + 3).trim() };
  for (const m of detail.matchAll(/"?([A-Za-z]+)"?\s*[:=]\s*"?(true|false|on|off)\b/g)) if (switchKnown(m[1])) said.push(switchSaid(m[1], m[2] === 'true' || m[2] === 'on'));
  return { said, reason: '' };
}
