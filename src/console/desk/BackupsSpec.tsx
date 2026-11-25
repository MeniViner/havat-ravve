// גיבויים: what the phone and the computer share. The list and its states, a backup now, the recycle bin, the download, and
// a record from a backup compared with today.
import { useState } from 'react';
import { dayName, daysFromToday, ddmm, hhmm } from '../../app/v2/format';
import { nowMs } from '../../app/clock';
import { ago, fmt, useLoad } from '../shared';
import { collectionName, valueText } from '../labels';
import { errorText, source, type Backup, type TrashItem } from '../source';

export type Notify = (t: string, tone?: 'info' | 'alert') => void;
export const dayTitle = (date: string) => { const d = daysFromToday(date); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(date)} ${ddmm(date)}`; };
export const isManual = (b: Backup) => b.by !== 'cron';
/** The night's backup starts after 03:00 and takes minutes; one that ended after 06:00 had trouble on the way. */
export const isLate = (b: Backup) => !isManual(b) && (daysFromToday(b.finishedAt) !== daysFromToday(b.date) || Number(hhmm(b.finishedAt).split(':')[0]) >= 6);

export function useBackups(notify: Notify) {
  const list = useLoad(() => source.backups());
  const bin = useLoad(() => source.trash());
  // storage is part of the health check; without it the card shows only what is kept
  const storage = useLoad(() => source.monitor().then((m) => (m.health && m.health.r2Bytes !== null && m.health.r2Bytes !== undefined ? { used: m.health.r2Bytes, limit: m.limits.r2Bytes } : null)).catch(() => null));
  const [running, setRunning] = useState<string | null>(null);
  const last = list.data?.items[0];
  const stale = !last || nowMs() - Date.parse(last.finishedAt) > 36 * 3600_000;
  const runNow = async () => {
    setRunning('מתחיל…');
    try {
      let done = false;
      for (let i = 0; i < 60 && !done; i++) {
        const r = await source.runBackup();
        if (r.done) { done = true; notify(`הגיבוי נשמר: ${fmt(r.docs)} רשומות`); break; }
        setRunning(`נשמרו ${fmt(r.docs)} רשומות…`);
      }
      if (!done) notify('הגיבוי עוד לא הסתיים. הוא ממשיך ברקע מעצמו, ויופיע כאן כשיסתיים (אפשר לרענן בעוד כמה דקות).');
      list.reload();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setRunning(null); }
  };
  return { list, bin, storage: storage.data, last, stale, running, runNow };
}

export function useDownload(notify: Notify) {
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (date: string) => {
    if (source.demo) return notify('ההורדה עובדת בחשבון האמיתי');
    setBusy(date);
    try { await source.downloadBackup(date); } catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(null); }
  };
  return { downloading: busy, download };
}

export function useTrashRestore(t: TrashItem, notify: Notify, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const r = await source.restoreTrash([t.key]);
      if (r.restored.length) notify('שוחזר');
      else if (r.exists.length) notify('לא שוחזר: בינתיים נוצרה רשומה חדשה באותו מקום', 'alert');
      else notify('כבר לא נמצא בסל', 'alert');
      onDone();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return { busy, restore };
}

/** One record of a backup beside the same record today. */
export function useBackupDoc(date: string, path: string, notify: Notify) {
  const doc = useLoad(() => source.backupDoc(date, path), [date, path]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = doc.data;
  const keys = d ? [...new Set([...Object.keys(d.then), ...Object.keys(d.now || {})])].sort() : [];
  const changed = d ? keys.filter((k) => valueText(d.then[k]) !== valueText(d.now?.[k])) : [];
  const restore = async () => {
    setBusy(true);
    try { await source.restoreBackup(date, [path]); notify('הרשומה הוחזרה למצב שלה בגיבוי'); setConfirm(false); doc.reload(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const state = !d ? null : !d.now ? { text: 'נמחקה מאז', tone: 'red' as const } : !changed.length ? { text: 'זהה למצב היום', tone: 'green' as const } : { text: changed.length === 1 ? 'שדה אחד השתנה מאז' : `${changed.length} שדות השתנו מאז`, tone: 'amber' as const };
  const ask = d?.now ? `הרשומה תוחלף בגרסה מהגיבוי של ${dayTitle(date)}. הגרסה של היום נשמרת בסל המחזור ל־30 יום.` : 'הרשומה תחזור בדיוק כמו שהייתה בגיבוי.';
  return { doc, d, keys, changed, state, ask, can: !!d && (!d.now || changed.length > 0), confirm, setConfirm, busy, restore };
}

const ONE: Record<string, string> = { users: 'אדם', tasks: 'משימה', task_templates: 'תבנית משימה', shopping: 'קנייה', events: 'אירוע', tickets: 'כרטיס', donations: 'תרומה', visits: 'ביקור', places: 'מקום', calendar: 'פריט בלוח הזמנים', broadcasts: 'הודעה לצוות', vendors: 'דוכן', 'events/*/vendors': 'דוכן באירוע', projects: 'פרויקט', role_invites: 'תפקיד מראש', cms_content: 'תוכן באתר', cms_media: 'תמונה באתר' };
export const kindName = (collection: string) => ONE[collection] || collectionName(collection);
/** "מחק האינסטינקט של מני" for a key; a deletion made in the console says so. */
export const binnedBy = (t: TrashItem) => (/^קונסולה/.test(t.by) ? 'נמחק בקונסולה' : `מחק ${t.by}`);
export const binnedWhen = (t: TrashItem) => (daysFromToday(t.deletedAt) < -1 ? ddmm(t.deletedAt) : ago(t.deletedAt));
