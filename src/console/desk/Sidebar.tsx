// The console's sidebar on a computer: five groups, always all visible, the same on every screen.
import { signOutUser } from '../../app/firebase';
import { initials } from '../../app/v2/kit';
import { outHref } from '../shared';
import { source, type Me } from '../source';
import { useFailedMails } from './counts';
import { DIcon } from './icons';

type Item = { tab: string; label: string; icon: string };
export const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'מצב', items: [{ tab: 'overview', label: 'מצב כללי', icon: 'server' }, { tab: 'monitor', label: 'ניטור', icon: 'pulse' }, { tab: 'speed', label: 'מהירות', icon: 'bolt' }] },
  { title: 'החווה במספרים', items: [{ tab: 'stats', label: 'סטטיסטיקות', icon: 'chart' }, { tab: 'traffic', label: 'ביקורים ושימוש', icon: 'eye' }, { tab: 'money', label: 'כסף ואירועים', icon: 'coin' }] },
  { title: 'נתונים', items: [{ tab: 'data', label: 'דפדוף בנתונים', icon: 'grid' }, { tab: 'people', label: 'אנשים והרשאות', icon: 'people' }, { tab: 'import', label: 'ייבוא מאקסל', icon: 'upload' }, { tab: 'backups', label: 'גיבויים', icon: 'box' }] },
  { title: 'שליחה ותזמון', items: [{ tab: 'queue', label: 'תור שליחה', icon: 'mail' }, { tab: 'jobs', label: 'משימות מתוזמנות', icon: 'calendar' }, { tab: 'switches', label: 'מתגים', icon: 'toggle' }] },
  { title: 'גישה ואבטחה', items: [{ tab: 'keys', label: 'מפתחות API', icon: 'key' }, { tab: 'run', label: 'הרצת פעולה', icon: 'play' }, { tab: 'security', label: 'יומן אבטחה', icon: 'shield' }] },
];

export function Sidebar({ me, tab }: { me: Me; tab: string }) {
  const failed = useFailedMails();
  return (
    <aside className="d-side">
      <a className="d-brand" href="#/overview">
        <span className="d-brand__mark"><DIcon name="farm" size={18} /></span>
        <span className="d-brand__text"><b>חוות רווה</b><span>קונסולת הבעלים</span></span>
      </a>
      <nav className="d-nav" aria-label="קונסולה">
        {GROUPS.map((g) => (
          <div key={g.title} className="d-nav__group" role="group" aria-label={g.title}>
            <span className="d-nav__head" aria-hidden="true">{g.title}</span>
            {g.items.map((i) => (
              <a key={i.tab} className="d-nav__item" href={`#/${i.tab}`} aria-current={tab === i.tab ? 'page' : undefined}>
                <DIcon name={i.icon} size={18} /><span>{i.label}</span>
                {i.tab === 'queue' && !!failed && <span className="d-nav__count" aria-label={`${failed} נכשלו`}>{failed}</span>}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="d-side__foot">
        <div className="d-side__links"><a className="d-act" href={outHref('/app')}>לאפליקציה</a><a className="d-act" href={outHref('/edit')}>לעריכת האתר</a></div>
        <div className="d-me">
          <span className="d-me__avatar" aria-hidden="true">{initials(me.name)}</span>
          <span className="d-me__text"><b>{me.name}</b><span>בעלים</span></span>
          <button type="button" className="d-iconbtn" aria-label="יציאה" onClick={() => { if (source.demo) location.assign('/admin'); else signOutUser(); }}><DIcon name="exit" size={18} /></button>
        </div>
      </div>
    </aside>
  );
}
