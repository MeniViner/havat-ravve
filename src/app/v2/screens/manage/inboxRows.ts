import type { AppNotification } from '../../../types';
import { inboxIn, type InboxFilter } from './calc';

export const donationRef = (n: AppNotification) => n.refId && (n.type === 'donation' || (['receipt','claim'].includes(n.type) && n.link.startsWith('/manage/donations/'))) ? n.refId : '';
export type InboxRow = { note: AppNotification; members: AppNotification[]; donationId: string };
export function inboxRows(notes: AppNotification[]): InboxRow[] {
  const rows = new Map<string,InboxRow>();
  const priority = (n: AppNotification) => n.type === 'donation' ? 3 : n.type === 'claim' ? 2 : 1;
  for (const note of notes) {
    const donationId = donationRef(note);
    const key = donationId ? 'd/'+donationId : 'n/'+note.id;
    const row = rows.get(key);
    if (!row) rows.set(key,{ note, members:[note], donationId });
    else { row.members.push(note); if (priority(note)>priority(row.note)) row.note=note; }
  }
  return [...rows.values()];
}
export const rowIn = (row: InboxRow, filter: InboxFilter) => row.donationId
  ? filter === 'all' || filter === 'payments' || (filter === 'receipts' && row.members.some(n=>n.type==='receipt'))
  : inboxIn(row.note,filter);
