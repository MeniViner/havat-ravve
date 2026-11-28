// v2 screens: manage. The shell routes to these names (v2/routes.tsx).
import type { V2Ctx } from '../../ctx';

export { ManageRoot, InboxScreen } from './Root';
export { InboxMessageScreen, StallRequestScreen, StallRequestFromDay } from './InboxItem';
export { PeopleScreen, PersonScreen, ContactPersonScreen, InviteScreen } from './People';
export { ReportsScreen, DonationsScreen, DonationScreen } from './Money';
export { VisitsScreen, VisitScreen } from './Visits';
export { SettingsScreen, SettingsPage } from './Settings';
export { DemoFirstVisitScreen } from './DemoFirstVisit';
export { ActivityScreen } from './Activity';
export { InstinctLogScreen } from './InstinctLog';

export type { V2Ctx };
