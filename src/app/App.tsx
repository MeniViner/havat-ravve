import { useEffect, useState, type ReactNode } from 'react';
import { useAuth, useProfile, isOwner, isTeam, useOnline } from './store';
import { useSettings } from './data';
import { useRoute, match } from './router';
import { Icon, ToastProvider, A, Avatar, Empty, Top, useDesktop, usePageEnter } from './ui';
import type { GuestCtx } from './ctx';
import type { Profile, Settings } from './types';
import { ROLE_LABELS } from './types';
import type { Session } from './firebase';
import { useDemo } from './demo/store';
import { Guard } from './guard';
import { GuestHome, EventPage, OrderPage, LoginPage, MyTicketsPage, VisitPage, DonatePage, GuestAccountPage, TermsPage, ContactPage } from './screens/Guest';
import { InstallBanner } from './InstallBanner';
import { DeleteAccountPage, DeletionScheduledPage, useDeletionRequest } from './screens/Account';
import { V2Root } from './v2/App';
import { FirstEntry, SuspendedScreen, DemoStart } from './v2/screens/system';
import { ToastProvider as V2Toasts } from './v2/core';
import { V2DemoStrip } from './v2/DemoChrome';

// ---------- navigation ----------
type NavItem = { path: string; icon: string; label: string; badge?: number; match?: (r: string) => boolean; sub?: boolean };
const isCurrent = (i: NavItem, route: string) => i.match ? i.match(route) : i.path === '/' ? route === '/' : route.startsWith(i.path);
const isCalendarRoute = (route: string) => /^(?:\/manage)?\/calendar(?:\/|$)/.test(route);

function BottomNav({ route, items }: { route: string; items: NavItem[] }) {
  return <nav className="bottom" aria-label="ניווט ראשי"><div className="nav">{items.map((i) => <A key={i.path} to={i.path} className={isCurrent(i, route) ? 'on' : ''} aria-current={isCurrent(i, route) ? 'page' : undefined}><span className="ico"><Icon name={i.icon} /></span>{i.label}{i.badge ? <span className="badge">{i.badge > 99 ? '99+' : i.badge}</span> : null}</A>)}</div></nav>;
}
function Rail({ route, items, manage, profile, role }: { route: string; items: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string }) {
  const meTo = profile && profile.role === 'guest' && !manage && items[0]?.label === 'בית' ? '/me/account' : '/more';
  return (
    <aside className="rail" aria-label="ניווט">
      <A className="brand" to="/"><img src="/assets/rava-logo.png" alt="" />חוות רווה</A>
      {items.map((i) => <A key={i.path} to={i.path} className={isCurrent(i, route) ? 'on' : ''}><Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</A>)}
      {manage && <><div className="group">ניהול</div>{manage.map((i) => <A key={i.path} to={i.path} className={'sub ' + (isCurrent(i, route) ? 'on' : '')}><Icon name={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</A>)}</>}
      <div className="foot">
        <a href="/" className="site"><Icon name="globe" />לאתר החווה</a>
        {profile
          ? <A to={meTo} className={'me ' + (route === meTo ? 'on' : '')} aria-label={`הפרופיל שלי: ${profile.displayName}, ${role || ROLE_LABELS[profile.role]}`}><Avatar name={profile.displayName} size="sm" /><span className="who"><b>{profile.displayName}</b><small>{role || ROLE_LABELS[profile.role]}</small></span></A>
          : <A to="/login" className="me"><Icon name="user" /><span className="who"><b>כניסה</b><small>עם חשבון Google</small></span></A>}
      </div>
    </aside>
  );
}
/** Phone: one screen at a time. Desktop: rail + content, and a detail page opens as a side panel next to its list. */
function Shell({ nav, manage, profile, role, online, master, detail, narrow, center }: { nav: NavItem[]; manage?: NavItem[]; profile: Profile | null; role?: string; online: boolean; master: ReactNode; detail?: ReactNode; narrow?: boolean; center?: boolean }) {
  const route = useRoute(); const desktop = useDesktop();
  const content = (
    <>
      {!online && <div className="strip" style={{ marginTop: 8 }}><Icon name="wifiOff" size={18} />אין קליטה. מה שתעשו יישמר בטלפון ויישלח כשתחזור הרשת.</div>}
      <InstallBanner />
      {desktop ? master : (detail ?? master)}
    </>
  );
  // phone: every navigation is a new page. desktop: opening a detail panel must not replay the list behind it.
  const base = route.split('/').slice(0, route.startsWith('/manage') ? 3 : 2).join('/');
  const pageRef = usePageEnter<HTMLDivElement>(desktop && detail ? base : route);
  const cls = desktop ? ['content screen', narrow && !detail ? 'narrow' : '', center && !detail ? 'center' : '', detail ? 'haspanel' : ''].filter(Boolean).join(' ') : 'screen';
  return (
    <div className="app">
      <Rail route={route} items={nav} manage={manage} profile={profile} role={role} />
      <div className="shellmain" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: desktop ? 'row' : 'column' }}>
        <div style={{ flex: 1, minWidth: 0 }}><V2DemoStrip /><main className={cls}><Guard resetKey={route}><div ref={pageRef} className="page">{content}</div></Guard></main></div>
        {desktop && detail && <aside className="panel"><Guard resetKey={route}><div className="screen page-in" key={route}>{detail}</div></Guard></aside>}
      </div>
      {!desktop && <BottomNav route={route} items={nav} />}
    </div>
  );
}

// ---------- guest app ----------
function GuestApp({ user, profile, settings }: { user: Session | null; profile: Profile | null; settings: Settings }) {
  const route = useRoute(); const online = useOnline();
  const ctx: GuestCtx = { user, profile, settings };
  const nav: NavItem[] = [{ path: '/', icon: 'home', label: 'בית', match: (r) => r === '/' || r.startsWith('/events') || r === '/visit' || r === '/donate' || r === '/contact' }, { path: '/me', icon: 'ticket', label: 'הכרטיסים שלי', match: (r) => r === '/me' }, { path: '/me/account', icon: 'user', label: 'החשבון שלי' }];
  const screen = isCalendarRoute(route) ? <><Top title="יומן החווה" backTo="/" backLabel="בית" /><Empty title="היומן זמין לצוות החווה" /></>
    : guestRoutes(route, ctx) || <GuestHome ctx={ctx} />;
  return <Shell nav={nav} profile={profile} online={online} master={screen} narrow center />;
}
function guestRoutes(route: string, ctx: GuestCtx): ReactNode | null {
  let m: Record<string, string> | null;
  if (route === '/') return <GuestHome ctx={ctx} />;
  if ((m = match(route, '/events/:id/order'))) return <OrderPage id={m.id} ctx={ctx} />;
  if ((m = match(route, '/events/:id'))) return <EventPage id={m.id} ctx={ctx} />;
  if (route === '/login') return <LoginPage ctx={ctx} />;
  if (route === '/me') return <MyTicketsPage ctx={ctx} />;
  if (route === '/me/account') return <GuestAccountPage ctx={ctx} />;
  if (route === '/visit') return <VisitPage ctx={ctx} />;
  if (route === '/donate') return <DonatePage ctx={ctx} />;
  if (route === '/contact') return <ContactPage ctx={ctx} />;
  if (route === '/terms' || route === '/privacy') return <TermsPage />;
  if (route === '/delete-account') return <DeleteAccountPage ctx={ctx} />;
  return null;
}

function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return <div className="splash" role="status" aria-live="polite"><img src="/assets/rava-logo.png" alt="" /><div className="title">חוות רווה</div><div>{slow ? 'זה לוקח יותר מהרגיל. בודקים חיבור…' : 'רגע…'}</div></div>;
}

export default function App() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, missing, error: profileError } = useProfile(user);
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const demo = useDemo();
  const route = useRoute();
  // a scheduled deletion locks the account (screens/Account.tsx); it never blocks the first render
  const deletion = useDeletionRequest(user && profile ? user.uid : undefined);
  // the public site (same origin) reads this to show who is signed in. Real accounts only, never a demo persona.
  useEffect(() => {
    if (loading || profileLoading || demo.on) return;
    try {
      if (user && profile) localStorage.setItem('farm-me', JSON.stringify({ name: profile.displayName, role: isOwner(profile, user.email) ? ROLE_LABELS.owner : ROLE_LABELS[profile.role] }));
      else if (!user) localStorage.removeItem('farm-me');
    } catch { /* private mode */ }
  }, [loading, profileLoading, user?.uid, profile?.displayName, profile?.role, demo.on, demo.persona]);
  // Z1: the demo start page works for everyone, signed in or not, demo on or off
  if (route === '/demo') return <V2Toasts><DemoStart /></V2Toasts>;
  if (loading || (user && profileLoading)) return <Splash />;
  if (user && !profile && profileError) return <div className="splash" role="alert"><div className="title">לא הצלחנו לטעון את החשבון</div><div>{profileError}. הנתונים שלך לא נפגעו.</div><button type="button" className="btn ghost" onClick={() => location.reload()}>לנסות שוב</button></div>;
  if (user && (missing || !profile)) {
    if (route === '/terms' || route === '/privacy') return <TermsPage />; // the terms link on C9 works before the profile exists
    if (settingsLoading) return <Splash />;
    if (settingsError) return <div className="splash" role="alert"><div className="title">לא הצלחנו לטעון את שאלות ההרשמה</div><button type="button" className="btn ghost" onClick={() => location.reload()}>לנסות שוב</button></div>;
    return <ToastProvider><V2DemoStrip /><FirstEntry key={user.uid} user={user} settings={settings} /></ToastProvider>;
  }
  if (user && profile && deletion.item) return <ToastProvider><V2DemoStrip /><DeletionScheduledPage profile={profile} request={deletion.item} /></ToastProvider>;
  // X2: a suspended account (any role) sees the new suspended screen
  if (user && profile && profile.status === 'blocked') return <ToastProvider><V2DemoStrip /><SuspendedScreen ctx={{ profile, settings }} /></ToastProvider>;
  // staff, managers, owners and vendors: the redesigned app
  if (user && profile && (isTeam(profile, user.email) || (profile.role === 'vendor' && profile.status === 'active'))) return <V2Root user={user} profile={profile} settings={settings} />;
  return <ToastProvider><GuestApp user={user} profile={profile} settings={settings} /></ToastProvider>;
}
