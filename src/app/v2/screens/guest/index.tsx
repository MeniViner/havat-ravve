// The guest side on the v2 kit (U1-U14): its shell (demo strip, offline strip, the three-tab nav
// בית · הכרטיסים שלי · החשבון שלי) and its routes. A team member opens the same screens from the team app
// (`guestScreen(route, { team: true })`, src/app/v2/App.tsx): their tickets are at /me/tickets and their /me is the team profile.
import { useEffect, useState, type ReactNode } from 'react';
import { useRoute, match, navigate, param } from '../../../router';
import { useSync } from '../../../db';
import { useOnline } from '../../../store';
import { leaveDemoTarget } from '../../../demo/intro';
import { useDemo, useDemoStates, setDemo, PERSONA_ROLE, SCENARIOS } from '../../../demo/store';
import { useClockVersion } from '../../../clock';
import type { Profile, Settings } from '../../../types';
import type { Session } from '../../../firebase';
import { ToastProvider, useToast, ChromeProvider, AppScreen } from '../../core';
import { BottomNav, DemoStrip, Strip, EmptyState, Button, TopBar } from '../../kit';
import { DemoSheet, InstallScreen } from '../system';
import { AppearanceScreen } from '../system/appearance';
import { Guard } from '../../../guard';
import { V2DemoStrip } from '../../DemoChrome';
import { READ_ONLY_TEXT, useAppSwitches } from '../../../switches';
import type { GuestCtx } from './data';
import { GuestHome, EventPage } from './home';
import { OrderPage, PayPage } from './order';
import { TicketsPage, OrderDetail, PastPage } from './tickets';
import { AccountPage, SignInPage, ItemsPage, EditPage, MessagesPage, VisitPage, DonationPage, StallPage } from './account';
import { PublicVendorRegistration } from '../vendor/registration';
import { VisitForm, DonateForm, ContactForm } from './forms';
import { TermsPage, DeleteAccountPage } from './pages';
import './guest.css';

export { GuestRegister } from './forms';
export { BlockedPage, DeletionScheduledPage, TermsPage, useDeletionRequest } from './pages';
export type { GuestCtx };

/** The guest screens by route, for the guest shell and for a team member (null: not a guest page). */
export function guestScreen(route: string, ctx: GuestCtx): ReactNode | null {
  let m: Record<string, string> | null;
  const p = { ctx };
  if (route === '/vendor-registration') return <PublicVendorRegistration ctx={ctx} eventId={param('event') || ''} />;
  if (route === '/' && !ctx.team) return <GuestHome {...p} />;
  if ((m = match(route, '/events/:id/order'))) return <OrderPage {...p} id={m.id} />;
  if ((m = match(route, '/events/:id'))) return <EventPage {...p} id={m.id} />;
  if (route === '/login') return <SignInPage {...p} next={param('next') || (ctx.team ? '/me/tickets' : '/me')} />;
  if (route === (ctx.team ? '/me/tickets' : '/me')) return <TicketsPage {...p} />;
  if ((m = match(route, '/me/orders/:id/pay'))) return <PayPage {...p} orderId={m.id} />;
  if ((m = match(route, '/me/orders/:id'))) return <OrderDetail {...p} orderId={m.id} />;
  if (route === '/me/past') return <PastPage {...p} />;
  if (route === '/me/items') return <ItemsPage {...p} />;
  if ((m = match(route, '/me/visits/:id'))) return <VisitPage {...p} id={m.id} />;
  if ((m = match(route, '/me/donations/:id'))) return <DonationPage {...p} id={m.id} />;
  if ((m = match(route, '/me/stall/:id'))) return <StallPage {...p} id={m.id} />;
  if (!ctx.team && route === '/me/account') return <AccountPage {...p} />;
  if (!ctx.team && route === '/me/appearance') return ctx.profile ? <AppearanceScreen parent="/me/account" /> : <AccountPage {...p} />;
  if (!ctx.team && route === '/me/edit') return <EditPage {...p} />;
  if (route === '/me/messages') return <MessagesPage {...p} />;
  if (route === '/visit') return <VisitForm {...p} />;
  if (route === '/donate') return <DonateForm {...p} />;
  if (route === '/contact') return <ContactForm {...p} />;
  if (route === '/terms' || route === '/privacy') return <TermsPage />;
  if (route === '/delete-account') return <DeleteAccountPage {...p} />;
  return null;
}

type Tab = 'home' | 'tickets' | 'account';
const tabOf = (route: string): Tab => (
  route === '/' || route.startsWith('/events') || ['/visit', '/donate', '/contact'].includes(route) ? 'home'
    : route === '/me' || route.startsWith('/me/orders') || route === '/me/past' ? 'tickets' : 'account'
);
const isCalendarRoute = (route: string) => /^(?:\/manage)?\/calendar(?:\/|$)/.test(route);

function Shell({ ctx }: { ctx: GuestCtx }) {
  useClockVersion();
  const route = useRoute(); const demo = useDemo(); const states = useDemoStates(); const online = useOnline(); const sync = useSync(); const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const offline = !online || (demo.on && states.offline);
  useEffect(() => { if (sync.failure) toast.refused(sync.failure.text.startsWith('לא נשמר') ? sync.failure.text : `לא נשמר. ${sync.failure.text}`); }, [sync.failure?.id]);
  // the owners turned on read-only from the console (switches.ts), as in the team shell
  const locked = useAppSwitches().locked && !demo.on;
  const top = (demo.on || offline || locked) ? <>
    {locked && <Strip icon="blocked">{READ_ONLY_TEXT}</Strip>}
    {demo.on && <DemoStrip roleName={PERSONA_ROLE[demo.persona]} day={SCENARIOS[demo.scenario].label} expanded={sheet} onSwitch={() => setSheet(true)} onExit={() => { setDemo({ on: false }); navigate(leaveDemoTarget(), true); }} />}
    {offline && <Strip icon="offline">{sync.pending ? `אין קליטה. ${sync.pending} פעולות שמורות בטלפון` : 'אין קליטה. הכרטיסים שלך עובדים גם בלי קליטה'}</Strip>}
  </> : null;
  const tab = tabOf(route);
  const nav = <BottomNav items={[
    { key: 'home', label: 'בית', icon: 'home', active: tab === 'home', onClick: () => navigate('/') },
    { key: 'tickets', label: 'הכרטיסים שלי', icon: 'ticket', active: tab === 'tickets', onClick: () => navigate('/me') },
    { key: 'account', label: 'החשבון שלי', icon: 'user', active: tab === 'account', onClick: () => navigate('/me/account') },
  ]} />;
  let screen = guestScreen(route, ctx);
  if (!screen && route === '/install') screen = <InstallScreen ctx={null as never} params={{}} />;
  if (!screen && route === '/farm/map') {
    screen = ctx.user
      ? <AppScreen variant="detail"><TopBar className="guest-pull" back={{ label: 'בית', onClick: () => navigate('/') }} /><EmptyState variant="fill" icon="pin" title="מפת החווה זמינה לצוות החווה" /></AppScreen>
      : <SignInPage ctx={ctx} next="/farm/map" />;
  }
  if (!screen && isCalendarRoute(route)) screen = (
    <AppScreen variant="detail"><TopBar className="guest-pull" back={{ label: 'בית', onClick: () => navigate('/') }} /><EmptyState variant="fill" icon="calendar" title="היומן זמין לצוות החווה" /></AppScreen>
  );
  if (!screen) screen = <GuestHome ctx={ctx} />;
  return (
    <ChromeProvider value={{ top, nav }}>
      <Guard resetKey={route} fallback={() => (
        <AppScreen variant="plain">
          <EmptyState variant="fill" icon="help" title="המסך הזה נתקע" text="שאר האפליקציה עובדת. אפשר לחזור אחורה או לטעון מחדש."
            action={<Button variant="outline" onClick={() => location.reload()}>טעינה מחדש</Button>} />
        </AppScreen>
      )}>{screen}</Guard>
      {demo.on && <DemoSheet open={sheet} onClose={() => setSheet(false)} />}
    </ChromeProvider>
  );
}

/** A guest page outside the shell (first sign-in, a scheduled deletion, a blocked guest): toasts and the demo strip, no nav. */
export function GuestFrame({ children }: { children: ReactNode }) {
  const demo = useDemo();
  return <ToastProvider><ChromeProvider value={{ top: demo.on ? <V2DemoStrip /> : null, nav: null }}>{children}</ChromeProvider></ToastProvider>;
}

/** Entry used by src/app/App.tsx for guests and signed-out visitors. */
export function GuestRoot({ user, profile, settings }: { user: Session | null; profile: Profile | null; settings: Settings }) {
  return <ToastProvider><Shell ctx={{ user, profile, settings, team: false }} /></ToastProvider>;
}
