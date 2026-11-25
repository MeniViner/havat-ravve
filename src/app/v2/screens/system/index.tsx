// v2 screens: system (profile, photo, search, first entry, install, offline queue, suspended, demo).
// The shell routes to these names (v2/routes.tsx, v2/App.tsx, src/app/App.tsx); keep them.
import { useState, type ReactNode } from 'react';
import type { V2Ctx } from '../../ctx';
import type { Profile, Settings } from '../../../types';
import type { Session } from '../../../firebase';
import { ToastProvider } from '../../core';
import { useInviteFor } from '../../data/system';
import { useDemo } from '../../../demo/store';
import { GuestRegister } from '../guest/forms';
import { WelcomeForm, Suspended, LinkGone } from './misc';
import { useDoc } from '../../../db';
import { linkOpen, linkAsInvite, type TeamLink } from '../../data/invite';
import { forgetVendorInvite } from '../../data/vendor';

/** L6-Me, C12-Profile */
export { ProfileScreen, ProfileEdit } from './profile';
/** A1-Photo, A2-Crop */
export { PhotoSource, PhotoCrop } from './photo';
/** C2-Search */
export { SearchScreen } from './search';
/** C9-Welcome (/welcome), C10-Install, C8-Offline (queue view; OfflineQueue is the card for T1) */
export { WelcomeScreen, InstallScreen, OfflineScreen, OfflineQueue } from './misc';
/** Z1-DemoStart, Z3-DemoSwitch (DemoSheet({open,onClose})) */
export { DemoStart, DemoSheet } from './demo';

/** X2: suspended account (blocked status). Rendered by the shell instead of the app, in its own `.v2`. */
export function SuspendedScreen({ ctx }: { ctx: { profile: Profile; settings: Settings } }): ReactNode {
  return <Suspended profile={ctx.profile} settings={ctx.settings} />;
}

/** First entry for an account without a profile. C9 for someone a manager added (role invite; the demo's ?demo=new account
 *  has one) and for a one-time team link (Q27); everyone else gets the guest registration (U13). */
export function FirstEntry(p: { user: Session; settings: Settings; link?: string }): ReactNode {
  const demo = useDemo();
  const { invite, loading } = useInviteFor(p.user.email);
  // Q27: a new account that came through a one-time team link (?k=t-…) sees the link as its invitation
  const [dropped, setDropped] = useState(false);
  const code = p.link && !dropped && !demo.on ? p.link : '';
  const team = useDoc<TeamLink>('team_links/' + (code || '_'), !!code);
  if (code) {
    if (team.loading) return null;
    if (linkOpen(team.item)) return <ToastProvider><WelcomeForm user={p.user} profile={null} invite={linkAsInvite(team.item!, p.user.email)} link={code} fields={p.settings.registrationFields} /></ToastProvider>;
    return <ToastProvider><LinkGone onContinue={() => { forgetVendorInvite(); setDropped(true); }} /></ToastProvider>;
  }
  if (loading) return null;
  if (invite) return <ToastProvider><WelcomeForm user={p.user} profile={null} invite={invite} fields={p.settings.registrationFields} /></ToastProvider>;
  return <GuestRegister user={p.user} settings={p.settings} />;
}
export type { V2Ctx };
