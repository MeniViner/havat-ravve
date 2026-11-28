import { useEffect, useState } from 'react';
import { useAuth, useProfile, isOwner, isTeam } from './store';
import { useSettings, useSwitchesDoc } from './data';
import { publishSwitches, useAppSwitches } from './switches';
import { signOutUser } from './firebase';
import { useAndroidPushRefresh } from './v2/data/push';
import { useRoute } from './router';
import { useUsage } from './usage';
import { ROLE_LABELS } from './types';
import type { Session } from './firebase';
import { currentDemoRole, setDemoAccess, useDemo, type DemoAccessRole } from './demo/store';
import { V2Root } from './v2/App';
import { PushEntryPrompt } from './v2/PushEntryPrompt';
import { FirstEntry, SuspendedScreen, DemoStart } from './v2/screens/system';
import { GuestRoot, GuestFrame, TermsPage, BlockedPage, DeletionScheduledPage, useDeletionRequest } from './v2/screens/guest';
import { ToastProvider as V2Toasts } from './v2/core';
import { V2DemoStrip } from './v2/DemoChrome';
import { pendingVendorInvite, forgetVendorInvite, claimVendorInvite } from './v2/data/vendor';
import { isTeamLink, claimTeamLink } from './v2/data/invite';

/** A vendor access link (?k=...) on first sign-in or on a guest account: claim it, then the vendor app opens by itself
 *  (the profile listener sees role 'vendor'). If the claim fails, say why and continue as a guest. */
const claiming = new Map<string, Promise<unknown>>(); // one claim per link, even when the effect runs twice (StrictMode, a remount)
function VendorClaim({ user, code }: { user: Session; code: string }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const key = user.uid + ':' + code;
    const claim = claiming.get(key) || claimVendorInvite(user, code);
    claiming.set(key, claim);
    claim.then(() => forgetVendorInvite()).catch((e: Error) => { forgetVendorInvite(); claiming.delete(key); if (live) setError(e.message || 'הקישור לא תקין'); });
    return () => { live = false; };
  }, [user.uid, code]);
  if (!error) return <Splash />;
  return <div className="splash" role="alert"><div className="title">לא הצלחנו לחבר את הדוכן</div><div>{error}</div><button type="button" className="btn ghost" onClick={() => location.replace('/app')}>המשך</button></div>;
}

/** Q27: a guest account that opens a one-time team link (?k=t-…): the role is given once, then the team app opens by itself.
 *  A new account claims the link in its first entry (FirstEntry) instead. */
function TeamClaim({ user, code }: { user: Session; code: string }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const key = user.uid + ':' + code;
    const claim = claiming.get(key) || claimTeamLink(user, code);
    claiming.set(key, claim);
    claim.then(() => forgetVendorInvite()).catch((e: Error) => { forgetVendorInvite(); claiming.delete(key); if (live) setError(e.message || 'הקישור לא תקין'); });
    return () => { live = false; };
  }, [user.uid, code]);
  if (!error) return <Splash />;
  return <div className="splash" role="alert"><div className="title">לא הצלחנו לצרף אותך לצוות</div><div>{error}</div><button type="button" className="btn ghost" onClick={() => location.replace('/app')}>המשך</button></div>;
}

/** The owners turned on maintenance from the console: everyone but owners waits here. */
function MaintenancePage({ text }: { text: string }) {
  return (
    <div className="splash" role="status">
      <img src="/assets/rava-logo.png" alt="" />
      <div className="title">האפליקציה בתחזוקה</div>
      <div className="splash-text">{text || 'אנחנו עובדים על שיפור קטן. נחזור בקרוב.'}</div>
      <button type="button" className="btn ghost" onClick={() => location.reload()}>לבדוק שוב</button>
      <a className="splash-text" href="/admin" style={{ textDecoration: 'underline' }}>כניסת בעלים</a>
    </div>
  );
}

/** Registration closed from the console: someone without an account sees this instead of the sign-up questions. */
function RegistrationClosedPage() {
  return (
    <div className="splash" role="status">
      <img src="/assets/rava-logo.png" alt="" />
      <div className="title">ההרשמה סגורה כרגע</div>
      <div className="splash-text">אפשר לחזור לכאן בהמשך. מי שכבר רשום/ה נכנס/ת כרגיל.</div>
      <button type="button" className="btn ghost" onClick={() => signOutUser().then(() => location.replace('/'))}>יציאה</button>
    </div>
  );
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return <div className="splash" role="status" aria-live="polite"><img src="/assets/rava-logo.png" alt="" /><div className="title">חוות רווה</div><div>{slow ? 'זה לוקח יותר מהרגיל. בודקים חיבור…' : 'רגע…'}</div></div>;
}

export default function App() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, missing, error: profileError } = useProfile(user);
  useAndroidPushRefresh(user ? profile : null);
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const demo = useDemo();
  const route = useRoute();
  // remember a vendor access code from the link before the Google sign-in redirect drops the query
  const [invite] = useState(() => pendingVendorInvite());
  // a scheduled deletion locks the account (v2/screens/guest/pages.tsx); it never blocks the first render
  const deletion = useDeletionRequest(user && profile ? user.uid : undefined);
  // the owners' switches from the console: maintenance, closed registration, read-only (owners keep working)
  const switchesDoc = useSwitchesDoc();
  const owner = !!user && isOwner(profile, user);
  useEffect(() => { publishSwitches(demo.on ? null : switchesDoc.item, owner); }, [switchesDoc.item, owner, demo.on]);
  useEffect(() => {
    if (!loading && !profileLoading && !demo.on && profile && user && !owner) {
      void import('./survey/native').then(m => m.disconnectSurvey(user.uid)).catch(() => {});
    }
  }, [loading, profileLoading, demo.on, profile?.role, profile?.status, user?.uid, owner]);
  const sw = useAppSwitches();
  // the public site (same origin) reads this to show who is signed in. Real accounts only, never a demo persona.
  useEffect(() => {
    if (loading || profileLoading || demo.on) return;
    try {
      if (user && profile) localStorage.setItem('farm-me', JSON.stringify({ name: profile.displayName, role: owner ? ROLE_LABELS.owner : ROLE_LABELS[profile.role] }));
      else if (!user) localStorage.removeItem('farm-me');
    } catch { /* private mode */ }
  }, [loading, profileLoading, user?.uid, profile?.displayName, profile?.role, owner, demo.on, demo.persona]);
  // the owners' console counts app usage (usage.ts): opens and screens only, never in the demo
  useUsage(route, !loading && !(user && profileLoading), user ? (owner ? 'owner' : profile?.role || 'guest') : null, demo.on);
  if (loading || (user && profileLoading)) return <Splash />;
  if (sw.maintenance && !owner && !demo.on && route !== '/terms' && route !== '/privacy') return <MaintenancePage text={sw.maintenanceText} />;
  if (user && !profile && profileError) return <div className="splash" role="alert"><div className="title">לא הצלחנו לטעון את החשבון</div><div>{profileError}. הנתונים שלך לא נפגעו.</div><button type="button" className="btn ghost" onClick={() => location.reload()}>לנסות שוב</button></div>;
  const teamLink = isTeamLink(invite);
  if (user && invite && !teamLink && !demo.on && (missing || !profile || profile.role === 'guest') && pendingVendorInvite()) return <VendorClaim user={user} code={invite} />;
  if (user && profile && teamLink && !demo.on && profile.role === 'guest' && profile.status === 'active' && pendingVendorInvite()) return <TeamClaim user={user} code={invite} />;
  if (user && (missing || !profile)) {
    if (route === '/contact') return <GuestRoot user={user} profile={null} settings={settings} />;
    if (route === '/terms' || route === '/privacy') return <GuestFrame><TermsPage /></GuestFrame>; // the terms link on C9 / U13 works before the profile exists
    if (settingsLoading) return <Splash />;
    if (settingsError) return <div className="splash" role="alert"><div className="title">לא הצלחנו לטעון את שאלות ההרשמה</div><button type="button" className="btn ghost" onClick={() => location.reload()}>לנסות שוב</button></div>;
    if (sw.registrationClosed && !demo.on && !user.bootstrapOwner) return <RegistrationClosedPage />;
    return <GuestFrame><FirstEntry key={user.uid} user={user} settings={settings} link={teamLink && !demo.on && pendingVendorInvite() ? invite : undefined} /></GuestFrame>;
  }
  if (route === '/demo') {
    const role: DemoAccessRole | null = demo.on ? currentDemoRole()
      : profile?.status === 'active' && user ? (owner ? 'owner' : profile.role === 'manager' || profile.role === 'staff' ? profile.role : null) : null;
    if (!demo.on && deletion.item) return <GuestFrame><DeletionScheduledPage profile={profile!} request={deletion.item} /></GuestFrame>;
    return <V2Toasts><DemoStart role={role} authorize={() => { if (!demo.on && user) setDemoAccess(user.uid, role); }} /></V2Toasts>;
  }
  if (user && profile && deletion.item) return <GuestFrame><DeletionScheduledPage profile={profile} request={deletion.item} /></GuestFrame>;
  // X2: a suspended team member or vendor sees the new suspended screen; a suspended guest keeps the guest page
  // (a personal greeting, WhatsApp with the text filled in, and the line that the site stays open to view)
  if (user && profile && profile.status === 'blocked') {
    if (profile.role === 'guest' && !user.bootstrapOwner) return <GuestFrame><BlockedPage profile={profile} settings={settings} /></GuestFrame>;
    return <><V2DemoStrip /><SuspendedScreen ctx={{ profile, settings }} /></>;
  }
  // staff, managers, owners and vendors: the redesigned app
  const screen = user && profile && (isTeam(profile, user) || (profile.role === 'vendor' && profile.status === 'active'))
    ? <V2Root user={user} profile={profile} settings={settings} /> : <GuestRoot user={user} profile={profile} settings={settings} />;
  return <>{screen}{!demo.on && user && profile?.status === 'active' && <PushEntryPrompt key={profile.uid} profile={profile} />}</>;

}
