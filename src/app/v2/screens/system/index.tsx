// v2 screens: system (profile, photo, search, first entry, install, offline queue, suspended, demo).
// The shell routes to these names (v2/routes.tsx, v2/App.tsx, src/app/App.tsx); keep them.
import type { ReactNode } from 'react';
import type { V2Ctx } from '../../ctx';
import type { Profile, Settings } from '../../../types';
import type { Session } from '../../../firebase';
import { ToastProvider } from '../../core';
import { useInviteFor } from '../../data/system';
import { GuestRegister } from '../guest/forms';
import { WelcomeForm, Suspended } from './misc';

/** L6-Me, C12-Profile */
export { ProfileScreen, ProfileEdit } from './profile';
/** A1-Photo, A2-Crop */
export { PhotoSource, PhotoCrop } from './photo';
/** C2-Search */
export { SearchScreen } from './search';
/** C9-Welcome (/welcome), C10-Install, C8-Offline (queue view; OfflineQueue is the card for T1) */
export { WelcomeScreen, InstallScreen, OfflineScreen, OfflineQueue } from './misc';
/** The automatic install invitation (old InstallBanner), for the shell's top chrome: <InstallBanner /> */
export { InstallBanner, useInstallBanner } from './misc';
/** Z1-DemoStart, Z3-DemoSwitch (DemoSheet({open,onClose})) */
export { DemoStart, DemoSheet } from './demo';

/** X2: suspended account (blocked status). Rendered by the shell instead of the app, in its own `.v2`. */
export function SuspendedScreen({ ctx }: { ctx: { profile: Profile; settings: Settings } }): ReactNode {
  return <Suspended profile={ctx.profile} settings={ctx.settings} />;
}

/** First entry for an account without a profile. C9 for someone a manager added (role invite; the demo's ?demo=new account
 *  has one); everyone else gets the guest registration (U13). */
export function FirstEntry(p: { user: Session; settings: Settings }): ReactNode {
  const { invite, loading } = useInviteFor(p.user.email);
  if (loading) return null;
  if (invite) return <ToastProvider><WelcomeForm user={p.user} profile={null} invite={invite} fields={p.settings.registrationFields} /></ToastProvider>;
  return <GuestRegister user={p.user} settings={p.settings} />;
}
export type { V2Ctx };
