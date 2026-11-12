// Activity log: one append-only record per meaningful change, so every screen can show "who did what, when".
import { useList, write, newId } from './db';
import { nowIso } from './firebase';
import type { Activity, ActivityKind, Actor } from './types';

export function logActivity(by: Actor, kind: ActivityKind, refId: string, action: string, text: string, extra: { subjectUid?: string; eventId?: string } = {}) {
  return write.set('activity', newId('activity'), { kind, refId, action, text: text.slice(0, 500), by, at: nowIso(), subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' }).catch(() => {});
}

/** History of one record. The kind is part of the query because the rules let volunteers read only team kinds. */
export const useActivityFor = (kind: ActivityKind, refId: string, enabled = true) => useList<Activity>('activity', { where: [['kind', '==', kind], ['refId', '==', refId]], orderBy: [['at', 'desc']], limit: 100 }, enabled && !!refId);
export const useActivityByKind = (kind: ActivityKind | 'all', enabled: boolean, max = 200) => useList<Activity>('activity', { where: kind === 'all' ? [] : [['kind', '==', kind]], orderBy: [['at', 'desc']], limit: max }, enabled);
export const useActivityForUser = (uid: string, enabled: boolean) => useList<Activity>('activity', { where: [['subjectUid', '==', uid]], orderBy: [['at', 'desc']], limit: 100 }, enabled && !!uid);
export const useActivityForEvent = (eventId: string, enabled: boolean) => useList<Activity>('activity', { where: [['eventId', '==', eventId]], orderBy: [['at', 'desc']], limit: 200 }, enabled && !!eventId);
export const useActivityBy = (uid: string, enabled: boolean, max = 200) => useList<Activity>('activity', { where: [['by.uid', '==', uid]], orderBy: [['at', 'desc']], limit: max }, enabled && !!uid);

export const ACTION_LABELS: Record<string, string> = {
  created: 'נוצר', edited: 'נערך', done: 'בוצע', undone: 'הוחזר לביצוע', deleted: 'נמחק', photo: 'תמונה נוספה', note: 'הערה נוספה', assigned: 'הוקצה', urgent: 'סומן דחוף',
  bought: 'נקנה', unbought: 'הוחזר לרשימה', found: 'נמצא', added: 'נוסף',
  scanned: 'נסרק', paid: 'סומן שולם', claimed: 'הועבר תשלום', cancelled: 'בוטל', ordered: 'הוזמן',
  opened: 'נפתח', item: 'פריט נרשם', removed: 'פריט הוסר', waived: 'נמחל',
  approved: 'אושר', rejected: 'נדחה', requested: 'הוגש', role: 'תפקיד שונה', blocked: 'נחסם', unblocked: 'שוחרר', invited: 'הוזמן', joined: 'הצטרף',
  receipt: 'קבלה נשלחה', published: 'פורסם', unpublished: 'הוסר מפרסום', saved: 'נשמר',
};
