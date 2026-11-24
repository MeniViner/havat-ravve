// The red count beside "תור שליחה" in the sidebar: mails that failed. Set by whichever screen last read the queue.
import { useSyncExternalStore } from 'react';

let failed: number | null = null;
const listeners = new Set<() => void>();
export const failedMails = () => failed;
export function setFailedMails(n: number | null) { if (n === failed) return; failed = n; listeners.forEach((l) => l()); }
export const useFailedMails = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => failed);
