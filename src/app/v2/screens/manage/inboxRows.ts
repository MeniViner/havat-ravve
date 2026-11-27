import type { AppNotification } from '../../../types';
import { inboxIn, type InboxFilter } from './calc';

const pointsToDonation = (n: AppNotification) =>
  n.type === 'donation' || (n.link || '').startsWith('/manage/donations/');
export type InboxRow = { note: AppNotification; members: AppNotification[]; donationId: string };
export function inboxRows(notes: AppNotification[]): InboxRow[] {
  const knownDonations = new Set(notes.filter(pointsToDonation).map(n => n.refId));
  const rows = new Map<string, InboxRow>();
  const priority = (n: AppNotification) => (n.type === 'donation' ? 3 : n.type === 'claim' ? 2 : 1);
  for (const note of notes) {
    const related = ['donation', 'claim', 'receipt'].includes(note.type);
    const legacyLink = !note.link || note.link === '/manage/inbox';
    const donationId =
      related && (pointsToDonation(note) || (legacyLink && knownDonations.has(note.refId))) ? note.refId : '';
    const key = donationId ? 'd/' + donationId : 'n/' + note.id;
    const row = rows.get(key);
    if (!row) rows.set(key, { note, members: [note], donationId });
    else {
      row.members.push(note);
      if (priority(note) > priority(row.note)) row.note = note;
    }
  }
  return [...rows.values()];
}
export const rowIn = (row: InboxRow, filter: InboxFilter) =>
  row.donationId
    ? filter === 'all' ||
      filter === 'payments' ||
      (filter === 'receipts' && row.members.some(n => n.type === 'receipt'))
    : inboxIn(row.note, filter);
