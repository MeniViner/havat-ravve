// Activity log: one append-only record per meaningful change, so every screen can show "who did what, when".
import { useList, write, newId, readOnce } from './db';
import { nowIso } from './firebase';
import { demoOnly } from './demo/store';
import type { Activity, ActivityKind, Actor } from './types';
import { now } from './clock';

export function logActivity(by: Actor, kind: ActivityKind, refId: string, action: string, text: string, extra: { subjectUid?: string; eventId?: string } = {}) {
  return write.set('activity', newId('activity'), { kind, refId, action, text: text.slice(0, 500), by, at: nowIso(), subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' }).catch(() => {});
}

/** A managers-only task logs under its own kind, so the rules can keep its title from volunteers in any list query. */
export const taskKind = (t: { managersOnly?: boolean }): ActivityKind => (t.managersOnly ? 'task_private' : 'task');
const TASK_KINDS: ActivityKind[] = ['task', 'task_private'];

/** History of one record. The kind is part of the query because the rules let volunteers read only team kinds. */
export const useActivityFor = (kind: ActivityKind, refId: string, enabled = true) => useList<Activity>('activity', { where: [['kind', '==', kind], ['refId', '==', refId]], orderBy: [['at', 'desc']], limit: 100 }, enabled && !!refId);
/** A task's history. Managers read both task kinds (the task may have changed visibility); a volunteer asks only for the open kind. */
export const useTaskActivity = (refId: string, manager: boolean, enabled = true) => useList<Activity>('activity', { where: [manager ? ['kind', 'in', TASK_KINDS] : ['kind', '==', 'task'], ['refId', '==', refId]], orderBy: [['at', 'desc']], limit: 100 }, enabled && !!refId);
/** Managers only. "task" covers managers-only tasks too. */
export const useActivityByKind = (kind: ActivityKind | 'all', enabled: boolean, max = 200) => useList<Activity>('activity', { where: kind === 'all' ? [] : kind === 'task' ? [['kind', 'in', TASK_KINDS]] : [['kind', '==', kind]], orderBy: [['at', 'desc']], limit: max }, enabled);
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

/** Moves a task's existing history to the kind that matches its visibility. Manager only (rules), never on a scan or stall path. */
export async function reclassifyTaskActivity(taskIds: string[], managersOnly: boolean) {
  const from: ActivityKind = managersOnly ? 'task' : 'task_private';
  const to: ActivityKind = managersOnly ? 'task_private' : 'task';
  for (let i = 0; i < taskIds.length; i += 30) {
    const rows = await readOnce<Activity>('activity', { where: [['kind', '==', from], ['refId', 'in', taskIds.slice(i, i + 30)]] });
    for (let j = 0; j < rows.length; j += 400) await write.batch(rows.slice(j, j + 400).map((a) => ({ op: 'update' as const, col: 'activity', id: a.id, data: { kind: to } })), { quiet: true, wait: true });
  }
}
/** A move that did not reach the server (no reception) is redone by the next sweep on this device. */
export const sweepAgain = () => { try { localStorage.removeItem(SWEEP_KEY); } catch { /* nothing to reset */ } };

/** Entries written before task_private existed carry a managers-only title under the open kind. A manager's device moves them once:
 *  the history of every task that is managers-only now, and of every deleted task (a deleted task may have been managers-only, and
 *  nobody but a manager can open a deleted task's history anyway). The flag is saved only after the server confirmed every move. */
const SWEEP_KEY = 'hr.taskPrivateSweep.v1';
let sweeping = false;
export async function sweepPrivateTaskActivity() {
  if (demoOnly()) return; // demo data is already in the new shape, and a demo run must not mark the real sweep as done
  try { if (sweeping || localStorage.getItem(SWEEP_KEY)) return; } catch { return; }
  sweeping = true;
  try {
    const tasks = await readOnce<{ id: string }>('tasks', { where: [['managersOnly', '==', true]] });
    await reclassifyTaskActivity(tasks.map((t) => t.id), true);
    const deletions = await readOnce<Activity>('activity', { where: [['kind', '==', 'task'], ['action', '==', 'deleted']] });
    const candidates = [...new Set(deletions.map((a) => a.refId))];
    const gone: string[] = [];
    for (let i = 0; i < candidates.length; i += 30) {
      const chunk = candidates.slice(i, i + 30);
      const still = new Set((await readOnce<{ id: string }>('tasks', { where: [['__id__', 'in', chunk]] })).map((t) => t.id));
      gone.push(...chunk.filter((id) => !still.has(id)));
    }
    await reclassifyTaskActivity(gone, true);
    try { localStorage.setItem(SWEEP_KEY, now().toISOString()); } catch { /* private window: it runs again next time, harmlessly */ }
  } catch { /* offline or refused: try again next session */ } finally { sweeping = false; }
}
