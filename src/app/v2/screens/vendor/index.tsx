// v2 screens: vendor. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** D3-Home,D10-Empty,D11-HelperHome,D5-Day,D6-DayLive */
export function VendorHome(p: ScreenProps): ReactNode { return <Placeholder name="VendorHome" ids="D3-Home,D10-Empty,D11-HelperHome,D5-Day,D6-DayLive" params={p.params} />; }
/** D1-Invite */
export function VendorInvite(p: ScreenProps): ReactNode { return <Placeholder name="VendorInvite" ids="D1-Invite" params={p.params} />; }
/** D2-Confirm */
export function VendorNeeds(p: ScreenProps): ReactNode { return <Placeholder name="VendorNeeds" ids="D2-Confirm" params={p.params} />; }
/** D4-Event */
export function VendorEvent(p: ScreenProps): ReactNode { return <Placeholder name="VendorEvent" ids="D4-Event" params={p.params} />; }
/** D9-Summary */
export function VendorSummary(p: ScreenProps): ReactNode { return <Placeholder name="VendorSummary" ids="D9-Summary" params={p.params} />; }
/** D7-Stall */
export function VendorStall(p: ScreenProps): ReactNode { return <Placeholder name="VendorStall" ids="D7-Stall" params={p.params} />; }
/** D8-Helper */
export function HelperForm(p: ScreenProps): ReactNode { return <Placeholder name="HelperForm" ids="D8-Helper" params={p.params} />; }
/** V1-Pool */
export function VendorPool(p: ScreenProps): ReactNode { return <Placeholder name="VendorPool" ids="V1-Pool" params={p.params} />; }
/** V2-Vendor */
export function VendorCard(p: ScreenProps): ReactNode { return <Placeholder name="VendorCard" ids="V2-Vendor" params={p.params} />; }
/** V6-VendorApp */
export function VendorAccess(p: ScreenProps): ReactNode { return <Placeholder name="VendorAccess" ids="V6-VendorApp" params={p.params} />; }
/** N8-Vendors */
export function EventVendors(p: ScreenProps): ReactNode { return <Placeholder name="EventVendors" ids="N8-Vendors" params={p.params} />; }
/** V7-VendorsDay */
export function VendorsToday(p: ScreenProps): ReactNode { return <Placeholder name="VendorsToday" ids="V7-VendorsDay" params={p.params} />; }

export type { V2Ctx };
