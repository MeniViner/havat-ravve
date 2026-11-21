// v2 screens: manage. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** M1-Root */
export function ManageRoot(p: ScreenProps): ReactNode { return <Placeholder name="ManageRoot" ids="M1-Root" params={p.params} />; }
/** M2-Inbox */
export function InboxScreen(p: ScreenProps): ReactNode { return <Placeholder name="InboxScreen" ids="M2-Inbox" params={p.params} />; }
/** M8-People */
export function PeopleScreen(p: ScreenProps): ReactNode { return <Placeholder name="PeopleScreen" ids="M8-People" params={p.params} />; }
/** M9-Person */
export function PersonScreen(p: ScreenProps): ReactNode { return <Placeholder name="PersonScreen" ids="M9-Person" params={p.params} />; }
/** M10-Reports */
export function ReportsScreen(p: ScreenProps): ReactNode { return <Placeholder name="ReportsScreen" ids="M10-Reports" params={p.params} />; }
/** N1-Visits */
export function VisitsScreen(p: ScreenProps): ReactNode { return <Placeholder name="VisitsScreen" ids="N1-Visits" params={p.params} />; }
/** N2-Visit */
export function VisitScreen(p: ScreenProps): ReactNode { return <Placeholder name="VisitScreen" ids="N2-Visit" params={p.params} />; }
/** N3-Donations */
export function DonationsScreen(p: ScreenProps): ReactNode { return <Placeholder name="DonationsScreen" ids="N3-Donations" params={p.params} />; }
/** N4-Donation */
export function DonationScreen(p: ScreenProps): ReactNode { return <Placeholder name="DonationScreen" ids="N4-Donation" params={p.params} />; }
/** N5-Settings */
export function SettingsScreen(p: ScreenProps): ReactNode { return <Placeholder name="SettingsScreen" ids="N5-Settings" params={p.params} />; }
/** N6-Payments,N7-Messages,G1-Amounts,G2-VisitTypes,G3-Questions,G4-Contact,G5-Managers */
export function SettingsPage(p: ScreenProps): ReactNode { return <Placeholder name="SettingsPage" ids="N6-Payments,N7-Messages,G1-Amounts,G2-VisitTypes,G3-Questions,G4-Contact,G5-Managers" params={p.params} />; }
/** N13-Invite */
export function InviteScreen(p: ScreenProps): ReactNode { return <Placeholder name="InviteScreen" ids="N13-Invite" params={p.params} />; }
/** N14-Activity */
export function ActivityScreen(p: ScreenProps): ReactNode { return <Placeholder name="ActivityScreen" ids="N14-Activity" params={p.params} />; }

export type { V2Ctx };
