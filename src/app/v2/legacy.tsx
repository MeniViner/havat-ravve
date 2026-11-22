// Guest pages a team member can still open (an event page, ordering tickets, my tickets, visit, donate, contact, terms,
// account deletion). They are not redesigned in this round: they render in the legacy look inside a `.legacy` wrapper,
// which restores the guest tokens, with the legacy toast provider they rely on.
import type { ReactNode } from 'react';
import { match } from '../router';
import { ToastProvider as LegacyToasts } from '../ui';
import type { GuestCtx } from '../ctx';
import type { Profile, Settings } from '../types';
import type { Session } from '../firebase';
import { EventPage, OrderPage, LoginPage, MyTicketsPage, VisitPage, DonatePage, GuestAccountPage, TermsPage, ContactPage } from '../screens/Guest';
import { DeleteAccountPage } from '../screens/Account';
import './legacy.css';

const wrap = (node: ReactNode) => <div className="legacy"><LegacyToasts><div className="screen">{node}</div></LegacyToasts></div>;
export function teamFallback(route: string, p: { user: Session; profile: Profile; settings: Settings }): ReactNode | null {
  const ctx: GuestCtx = { user: p.user, profile: p.profile, settings: p.settings };
  let m: Record<string, string> | null;
  if ((m = match(route, '/events/:id/order'))) return wrap(<OrderPage id={m.id} ctx={ctx} />);
  if ((m = match(route, '/events/:id'))) return wrap(<EventPage id={m.id} ctx={ctx} />);
  if (route === '/me/tickets') return wrap(<MyTicketsPage ctx={ctx} />);
  if (route === '/me/account') return wrap(<GuestAccountPage ctx={ctx} />);
  if (route === '/visit') return wrap(<VisitPage ctx={ctx} />);
  if (route === '/donate') return wrap(<DonatePage ctx={ctx} />);
  if (route === '/contact') return wrap(<ContactPage ctx={ctx} />);
  if (route === '/login') return wrap(<LoginPage ctx={ctx} />);
  if (route === '/terms' || route === '/privacy') return wrap(<TermsPage />);
  if (route === '/delete-account') return wrap(<DeleteAccountPage ctx={ctx} />);
  return null;
}
export function NotFound() {
  return <div style={{ padding: 16 }}><h1 style={{ fontSize: 26, margin: '8px 0' }}>הדף לא נמצא</h1><a href="/app/tasks" style={{ color: 'var(--action)', fontWeight: 600 }}>חזרה למשימות</a></div>;
}
