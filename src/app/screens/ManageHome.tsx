import type { ReactNode } from 'react';
import { Icon } from '../ui';
import { navigate } from '../router';

export function Tiles({ items }: { items: { path: string; icon: string; label: string; sub?: string; badge?: number; external?: boolean }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <a key={t.path} className="tile" href={t.external ? t.path : '/app' + t.path} target={t.external ? '_blank' : undefined} rel={t.external ? 'noopener' : undefined} onClick={(e) => { if (!t.external) { e.preventDefault(); navigate(t.path); } }}>
          <span className="tile-icon"><Icon name={t.icon} size={24} /></span>
          <b>{t.label}</b>
          {t.sub && <small>{t.sub}</small>}
          {t.badge ? <span className="tile-badge">{t.badge}</span> : null}
        </a>
      ))}
    </div>
  );
}

export function ManageHomeScreen({ inbox, pending, visitsNew, children }: { inbox: number; pending: number; visitsNew: number; children?: ReactNode }) {
  return (
    <>
      <header className="topbar"><div><h1>ניהול</h1><div className="sub">הכל במקום אחד, לפי נושא</div></div></header>
      <Tiles items={[
        { path: '/inbox', icon: 'info', label: 'התראות', sub: inbox ? `${inbox} ממתינות` : 'הכל טופל', badge: inbox },
        { path: '/manage/events', icon: 'sparkle', label: 'אירועים', sub: 'כרטיסים, כניסה, דוכנים, דוח' },
        { path: '/manage/people', icon: 'people', label: 'אנשים', sub: 'צוות, אורחים, תפקידים לפי מייל' },
        { path: '/manage/visits', icon: 'pin', label: 'ביקורים', sub: visitsNew ? `${visitsNew} בקשות חדשות` : 'תיאומים ואישורים', badge: visitsNew },
        { path: '/manage/donations', icon: 'sparkle', label: 'תרומות', sub: 'אישורים, קבלות, סיכומים' },
        { path: '/manage/calendar', icon: 'clock', label: 'יומן', sub: 'מי בחווה ומתי' },
        { path: '/manage/templates', icon: 'repeat', label: 'משימות חוזרות', sub: 'מה חוזר כל יום' },
        { path: '/manage/places', icon: 'pin', label: 'מקומות', sub: 'נקודות שמורות בחווה' },
        { path: '/manage/activity', icon: 'history', label: 'פעילות', sub: 'מי עשה מה, בכל המערכת' },
        { path: '/manage/reports', icon: 'list', label: 'דוחות', sub: 'משימות, תרומות, חובות' },
        { path: '/manage/settings', icon: 'edit', label: 'הגדרות', sub: 'תשלום, תרומות, הודעות' },
        { path: '/admin', icon: 'edit', label: 'עריכת האתר', sub: 'טקסטים ותמונות באתר', external: true },
      ]} />
      {children}
    </>
  );
}
