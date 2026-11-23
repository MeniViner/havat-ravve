// Guest pages a team member or vendor can still open from the team app (an event page, ordering tickets, my tickets as a
// guest, visit, donate, contact, terms, account deletion). They are the v2 guest screens (screens/guest), with the team's
// paths: tickets at /me/tickets, and /me is the team profile.
import type { ReactNode } from 'react';
import type { Profile, Settings } from '../types';
import type { Session } from '../firebase';
import { guestScreen } from './screens/guest';
import './legacy.css';

export function teamFallback(route: string, p: { user: Session; profile: Profile; settings: Settings }): ReactNode | null {
  return guestScreen(route, { user: p.user, profile: p.profile, settings: p.settings, team: true });
}
export function NotFound() {
  return <div style={{ padding: 16 }}><h1 style={{ fontSize: 26, margin: '8px 0' }}>הדף לא נמצא</h1><a href="/app/tasks" style={{ color: 'var(--action)', fontWeight: 600 }}>חזרה למשימות</a></div>;
}
