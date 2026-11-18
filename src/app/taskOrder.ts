// How Today orders and cuts its task groups. Pure, so the node tests can import it.
import type { Task } from './types';

/** Open before done, always; then urgent, mine, overdue, due today. */
export const byPriority = (uid: string, today: string) => (a: Task, b: Task) => {
  const score = (t: Task) => (t.dueDate && t.dueDate < today ? -1 : 0) + (t.urgent ? -4 : 0) + (t.assignee?.uid === uid ? -2 : 0) + (t.dueDate === today ? -1 : 0);
  return Number(a.done) - Number(b.done) || score(a) - score(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
};

/** Every open row of a group shows; completed rows only fill the space that is left. */
export function fit(list: Task[], max: number) {
  const open = list.filter((t) => !t.done);
  const shown = [...open, ...list.filter((t) => t.done).slice(0, Math.max(0, max - open.length))];
  return { shown, hidden: list.length - shown.length };
}
