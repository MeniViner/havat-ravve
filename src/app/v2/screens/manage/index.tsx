// v2 screens: manage. The shell routes to these names (v2/routes.tsx).
import type { V2Ctx } from '../../ctx';

export { ManageRoot, InboxScreen } from './Root';
export { PeopleScreen, PersonScreen, InviteScreen } from './People';
export { ReportsScreen, DonationsScreen, DonationScreen } from './Money';
export { VisitsScreen, VisitScreen } from './Visits';
export { SettingsScreen, SettingsPage } from './Settings';
export { ActivityScreen } from './Activity';

export type { V2Ctx };
