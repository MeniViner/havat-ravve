// The owners' switches from the console (/admin → מתגים), as the app sees them: settings/switches, which only the
// Worker writes. App.tsx listens once and publishes them here; db.ts asks readOnlyLock() before any write, and the
// team's top strip (v2/App.tsx Frame) shows the read-only line. Owners are never locked out: they turn it back off.
// The demo never reads them (useDoc serves the demo store, where the document does not exist).
import { useSyncExternalStore } from 'react';

export type AppSwitches = { maintenance: boolean; maintenanceText: string; registrationClosed: boolean; readOnly: boolean };
export const NO_SWITCHES: AppSwitches = { maintenance: false, maintenanceText: '', registrationClosed: false, readOnly: false };
export const READ_ONLY_TEXT = 'המערכת במצב קריאה בלבד כרגע. אפשר לצפות בהכל, ושינויים יחזרו לעבוד בקרוב.';

/** locked: read-only applies to the person signed in (everyone but owners). */
let current: AppSwitches & { locked: boolean } = { ...NO_SWITCHES, locked: false };
const subs = new Set<() => void>();

/** From App.tsx: the document as read, and whether the signed-in person is an owner (owners keep working). */
export function publishSwitches(doc: Partial<AppSwitches> | null, owner: boolean) {
  const next = {
    maintenance: doc?.maintenance === true,
    maintenanceText: typeof doc?.maintenanceText === 'string' ? doc.maintenanceText.slice(0, 300) : '',
    registrationClosed: doc?.registrationClosed === true,
    readOnly: doc?.readOnly === true,
    locked: doc?.readOnly === true && !owner,
  };
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  subs.forEach((f) => f());
}

export const useAppSwitches = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
/** db.ts: a write while the farm is read-only, by anyone but an owner, is refused before it reaches Firestore. */
export const readOnlyLock = (): string | null => (current.locked ? READ_ONLY_TEXT : null);
