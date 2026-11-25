// Activity for domain operations whose write plans do not already include a detailed activity row.
// Descriptions are fixed. Never copy the input, a returned invite link or a personal notification into the feed.
import { activity, type ActivityKind, type Person, type Ref } from './core';
import type { Firestore, Write } from './firestore';

type Entry = readonly [kind: ActivityKind, action: string, description: string];
const entries: Record<string, Entry> = {
  'templates.create': ['task_private', 'created', 'משימה חוזרת'],
  'templates.update': ['task_private', 'edited', 'משימה חוזרת'],
  'templates.delete': ['task_private', 'deleted', 'משימה חוזרת'],
  'people.setNotes': ['inbox', 'edited', 'הערה בתיק אדם'],
  'notifications.setHandled': ['inbox', 'edited', 'פריט בתור לטיפול'],
  'notifications.delete': ['inbox', 'deleted', 'פריט בתור לטיפול'],
  'gate.reject': ['event', 'rejected', 'כניסה נדחתה בשער'],
  'gate.keepRejected': ['event', 'edited', 'כניסה נשארה דחויה'],
  'events.saveProduct': ['event', 'edited', 'זמינות מוצר בדוכן'],
  'events.reorderProducts': ['event', 'edited', 'סדר מוצרים בדוכן'],
  'tickets.stampReminder': ['ticket', 'saved', 'תזכורת להזמנת כרטיסים'],
  'tabs.stampReminder': ['tab', 'saved', 'תזכורת לחשבון דוכן'],
  'payments.markConfirmation': ['inbox', 'saved', 'תיעוד שליחת אישור תשלום'],
  'projects.create': ['project', 'created', 'פרויקט'],
  'projects.update': ['project', 'edited', 'פרויקט'],
  'projects.delete': ['project', 'deleted', 'פרויקט'],
  'projects.takeStep': ['project', 'assigned', 'צעד בפרויקט'],
  'projects.releaseStep': ['project', 'released', 'צעד בפרויקט'],
  'projects.completeStep': ['project', 'done', 'צעד בפרויקט'],
  'projects.reopenStep': ['project', 'undone', 'צעד בפרויקט'],
  'projects.postUpdate': ['project', 'edited', 'עדכון לצעד בפרויקט'],
  'projects.splitStep': ['project', 'edited', 'צעד פוצל לצעדים'],
  'projects.updateStep': ['project', 'edited', 'צעד בפרויקט'],
  'projects.addStep': ['project', 'created', 'צעד בפרויקט'],
  'shopping.setMissing': ['shopping', 'edited', 'בוטל סימון פריט שלא היה במלאי'],
  'shopping.startTrip': ['shopping', 'opened', 'קנייה'],
  'shopping.closeTrip': ['shopping', 'closed', 'קנייה'],
  'shopping.deleteTrip': ['shopping', 'deleted', 'קנייה'],
  'shopping.reopenTrip': ['shopping', 'reopened', 'קנייה'],
  'vendors.update': ['event', 'edited', 'פרטי דוכן במאגר'],
  'vendors.addPerson': ['inbox', 'added', 'גישה לדוכן'],
  'vendors.removePerson': ['inbox', 'removed', 'גישה לדוכן'],
  'events.inviteVendor': ['event', 'edited', 'הזמנה לדוכן'],
  'events.inviteVendors': ['event', 'edited', 'הזמנות לדוכנים'],
  'events.setVendor': ['event', 'edited', 'שיבוץ דוכן'],
  'events.remindVendor': ['event', 'saved', 'תזכורת לבעל דוכן'],
  'vendorRequests.close': ['event', 'closed', 'בקשה מדוכן'],
  'vendorRequests.delete': ['event', 'deleted', 'בקשה מדוכן'],
};

export function addWriteActivity(fs: Firestore, by: Person, operation: string, input: Record<string, unknown>, writes: Write[], refs: Ref[]) {
  const entry = Object.hasOwn(entries, operation) ? entries[operation] : undefined;
  if (!entry || !writes.length) return;
  const activityPath = fs.name('activity', '');
  if (writes.some((w) => (w.update as { name: string } | undefined)?.name.startsWith(activityPath))) return;
  const [kind, action, text] = entry;
  const eventId = typeof input.eventId === 'string' ? input.eventId : '';
  const parentId = kind === 'project' ? input.projectId : operation.startsWith('events.') ? eventId : input.vendorId;
  const refId = parentId || refs.find((ref) => ref.col !== 'vendor_invites')?.id || eventId;
  if (typeof refId === 'string' && refId) writes.push(activity(fs, by, kind, refId, action, text, { eventId }));
}
