// What every v2 screen receives. Built once by the shell (v2/App.tsx).
import type { TeamCtx } from '../ctx';
import type { FarmEvent } from '../types';

export type V2Role = 'owner' | 'manager' | 'staff' | 'vendor';
export type V2Ctx = TeamCtx & {
  /** The effective role for navigation (owner email bootstrap counts as owner; "view as volunteer" shows 'staff'). */
  role: V2Role;
  /** Vendor accounts: the vendor document and whether this is a helper (read-only). */
  vendorId: string;
  helper: boolean;
  /** Today's YYYY-MM-DD in Israel (frozen in demo). */
  today: string;
  /** The event happening today, if any (drives the temporary "אירוע" tab). */
  eventToday: FarmEvent | null;
  /** This person is on today's event crew (or is a manager). */
  crew: boolean;
  /** C12 "לראות את האפליקציה כמו מתנדב": read-only preview of the volunteer navigation. */
  viewAsStaff: boolean;
};
/** Props of every routed screen. `params` holds the route params (":id") and the query string. */
export type ScreenProps = { ctx: V2Ctx; params: Record<string, string> };
