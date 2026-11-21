// v2 screens: system. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';
import { OnboardingPage as LegacyOnboarding } from '../../../screens/Guest';

/** L6-Me,C12-Profile */
export function ProfileScreen(p: ScreenProps): ReactNode { return <Placeholder name="ProfileScreen" ids="L6-Me,C12-Profile" params={p.params} />; }
/** C13-ProfileEdit */
export function ProfileEdit(p: ScreenProps): ReactNode { return <Placeholder name="ProfileEdit" ids="C13-ProfileEdit" params={p.params} />; }
/** A1-Photo */
export function PhotoSource(p: ScreenProps): ReactNode { return <Placeholder name="PhotoSource" ids="A1-Photo" params={p.params} />; }
/** A2-Crop */
export function PhotoCrop(p: ScreenProps): ReactNode { return <Placeholder name="PhotoCrop" ids="A2-Crop" params={p.params} />; }
/** C2-Search */
export function SearchScreen(p: ScreenProps): ReactNode { return <Placeholder name="SearchScreen" ids="C2-Search" params={p.params} />; }
/** C9-Welcome */
export function WelcomeScreen(p: ScreenProps): ReactNode { return <Placeholder name="WelcomeScreen" ids="C9-Welcome" params={p.params} />; }
/** C10-Install */
export function InstallScreen(p: ScreenProps): ReactNode { return <Placeholder name="InstallScreen" ids="C10-Install" params={p.params} />; }
/** C8-Offline (queue view) */
export function OfflineScreen(p: ScreenProps): ReactNode { return <Placeholder name="OfflineScreen" ids="C8-Offline (queue view)" params={p.params} />; }
/** Z1-DemoStart */
export function DemoStart(p: ScreenProps): ReactNode { return <Placeholder name="DemoStart" ids="Z1-DemoStart" params={p.params} />; }

/** Z3: the demo switch sheet opened from the demo strip. */
export function DemoSheet(_: { open: boolean; onClose: () => void }): ReactNode { return null; }
/** X2: suspended account (blocked status). Rendered by the shell instead of the app. */
export function SuspendedScreen(_: { ctx: { profile: import('../../../types').Profile; settings: import('../../../types').Settings } }): ReactNode { return null; }

/** First entry for an account without a profile. C9 for someone a manager added (role invite) and for ?demo=new;
 *  everyone else keeps the legacy guest registration. Placeholder: legacy registration. */
export function FirstEntry(p: { user: import('../../../firebase').Session; settings: import('../../../types').Settings }): ReactNode {
  return <LegacyOnboarding user={p.user} fields={p.settings.registrationFields} />;
}
export type { V2Ctx };
