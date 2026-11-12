// The team member's own page: details, install, demo, sign out. Notification switches come back when push really exists.
import type { TeamCtx } from '../ctx';
import { ROLE_LABELS } from '../types';
import { A, Icon } from '../ui';
import { Head } from '../kit';
import { ProfileSection, InstallHint, SignOut, DemoSection } from './More';

export function MeScreen({ ctx }: { ctx: TeamCtx }) {
  const role = ctx.owner ? ROLE_LABELS.owner : ctx.manager ? ROLE_LABELS.manager : ROLE_LABELS[ctx.profile.role];
  return (
    <>
      <Head backTo="/" backLabel="היום" title={ctx.profile.displayName} over={role} />
      <ProfileSection profile={ctx.profile} fields={ctx.settings.registrationFields} />
      <div style={{ marginTop: 26 }}>
        <A className="r-linkrow" to="/me"><div>הכרטיסים שלי <span>· אם הזמנתי לאירוע, כמו כל אורח</span></div><Icon name="chev" /></A>
        <A className="r-linkrow" to="/me/account"><div>הביקורים והתרומות שלי</div><Icon name="chev" /></A>
        <InstallHint />
        <A className="r-linkrow" to="/terms"><div>תנאי שימוש ופרטיות</div><Icon name="chev" /></A>
        <a className="r-linkrow" href="/" target="_blank" rel="noopener"><div>האתר של החווה</div><Icon name="chev" /></a>
      </div>
      <DemoSection role={ctx.owner ? 'owner' : ctx.manager ? 'manager' : ctx.profile.role} />
      <SignOut />
    </>
  );
}
