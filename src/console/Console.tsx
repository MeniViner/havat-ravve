// The owners' console at /admin: the farm's server in one place. Sign in with Google; only an active owner gets in
// (the Worker checks it on every request, this screen only says so). Screens: מצב השרת, אנשים, מפתחות API.
// /admin?demo shows the same screens over made-up data, without signing in and without reading or writing anything.
import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Avatar, Button, EmptyState, Icon, type IconName, Tabs } from '../app/v2/kit';
import { readyAuth, signIn, signOutUser, inAppBrowser } from '../app/firebase';
import { useLoad, useNotice } from './shared';
import { ConsoleError, errorText, source, type Me } from './source';
import { OverviewScreen } from './Overview';
import { KeysScreen } from './Keys';
import { PeopleScreen } from './People';
import { BackupsScreen } from './Backups';
import { MonitorScreen } from './Monitor';
import { SecurityScreen } from './Security';
import { DataScreen } from './Data';

type Tab = 'overview' | 'monitor' | 'data' | 'people' | 'keys' | 'security' | 'backups';
const TABS: { value: Tab; label: string; icon: IconName }[] = [
  { value: 'overview', label: 'מצב השרת', icon: 'server' },
  { value: 'monitor', label: 'ניטור', icon: 'chart' },
  { value: 'data', label: 'נתונים', icon: 'grid' },
  { value: 'people', label: 'אנשים', icon: 'people' },
  { value: 'keys', label: 'מפתחות API', icon: 'key' },
  { value: 'security', label: 'אבטחה', icon: 'blocked' },
  { value: 'backups', label: 'גיבויים', icon: 'box' },
];
const tabOf = (): Tab => { const h = location.hash.replace(/^#\/?/, ''); return (TABS.some((t) => t.value === h) ? h : 'overview') as Tab; };

export function Console() {
  const [user, setUser] = useState<User | null | undefined>(source.demo ? null : undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (source.demo) { source.me().then(setMe); return; }
    let off = () => {};
    readyAuth().then((auth) => { off = onAuthStateChanged(auth, setUser); });
    return () => off();
  }, []);
  useEffect(() => {
    if (source.demo || !user) { if (!source.demo) setMe(null); return; }
    setRefused(null);
    source.me().then(setMe).catch((e) => setRefused(e instanceof ConsoleError && e.code === 'FORBIDDEN' ? 'forbidden' : errorText(e)));
  }, [user]);

  if (!source.demo && user === undefined) return <Frame><p className="c-soft c-center">רגע…</p></Frame>;
  if (!source.demo && !user) return <SignIn />;
  if (refused) return (
    <Frame>
      <EmptyState variant="blocked" title={refused === 'forbidden' ? 'הקונסולה רק לבעלי החווה' : 'לא הצלחנו להיכנס'}
        text={refused === 'forbidden' ? `נכנסת בתור ${user?.email}. כדי להיכנס צריך חשבון של בעלים.` : refused}
        action={<Button variant="neutral" icon="exit" onClick={() => signOutUser()}>החלפת חשבון</Button>} />
    </Frame>
  );
  if (!me) return <Frame><p className="c-soft c-center">בודק הרשאות…</p></Frame>;
  return <Shell me={me} />;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="v2 c-frame" dir="rtl"><div className="c-frame__card">{children}</div></div>;
}

function SignIn() {
  const [err, setErr] = useState('');
  const go = async () => { setErr(''); try { await signIn(); } catch (e) { setErr(String((e as { code?: string })?.code || e)); } };
  return (
    <Frame>
      <div className="c-brand"><Icon name="server" size={28} /><span>חוות רווה</span></div>
      <h1 className="c-h1">קונסולת השרת</h1>
      <p className="c-sub">המקום של בעלי החווה לשרת: מצב, אנשים ומפתחות API.</p>
      {inAppBrowser()
        ? <p className="c-warn">Google לא מאפשר להתחבר מתוך הדפדפן של וואטסאפ או אינסטגרם. פתחו את הקישור בכרום או בספארי.</p>
        : <Button size="lg" block onClick={go}>כניסה עם Google</Button>}
      {err && <p className="c-err" role="alert">הכניסה לא הצליחה ({err})</p>}
      <p className="c-note"><a className="c-link" href="/edit">לעריכת האתר</a> · <a className="c-link" href="/app">לאפליקציה</a></p>
    </Frame>
  );
}

function Shell({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>(tabOf);
  const notice = useNotice();
  const people = useLoad(() => source.people());
  useEffect(() => { const on = () => setTab(tabOf()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  const go = (t: Tab) => { location.hash = '/' + t; setTab(t); scrollTo(0, 0); };
  return (
    <div className="v2 c-shell" dir="rtl">
      {source.demo && <div className="c-demo" role="status">תצוגה עם נתונים לא אמיתיים. שום דבר לא נשמר.</div>}
      <aside className="c-side">
        <div className="c-brand"><Icon name="server" size={24} /><span>חוות רווה · שרת</span></div>
        <nav className="c-nav" aria-label="קונסולה">
          {TABS.map((t) => (
            <button key={t.value} type="button" className="c-nav__item" aria-current={tab === t.value ? 'page' : undefined} onClick={() => go(t.value)}>
              <Icon name={t.icon} size={20} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="c-side__links">
          <a className="c-link" href="/app">לאפליקציה</a>
          <a className="c-link" href="/edit">לעריכת האתר</a>
        </div>
        <div className="c-me">
          <Avatar name={me.name} size={36} tone="me" />
          <span className="c-me__name">{me.name}</span>
          {!source.demo && <Button variant="quiet" icon="exit" onClick={() => signOutUser()}>יציאה</Button>}
        </div>
      </aside>
      <div className="c-top">
        <div className="c-brand"><Icon name="server" size={22} /><span>חוות רווה · שרת</span></div>
        <Tabs label="קונסולה" options={TABS.map(({ value, label }) => ({ value, label }))} value={tab} onChange={go} />
      </div>
      <main className="c-main">
        {tab === 'overview' && <OverviewScreen />}
        {tab === 'people' && <PeopleScreen me={me} people={people.data || []} loading={people.loading} error={people.error} reload={people.reload} notify={notice.show} />}
        {tab === 'keys' && <KeysScreen people={people.data || []} notify={notice.show} />}
        {tab === 'backups' && <BackupsScreen notify={notice.show} />}
        {tab === 'monitor' && <MonitorScreen notify={notice.show} />}
        {tab === 'security' && <SecurityScreen />}
        {tab === 'data' && <DataScreen notify={notice.show} />}
      </main>
      {notice.view}
    </div>
  );
}
