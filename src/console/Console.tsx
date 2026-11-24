// The owners' console at /admin: the farm's server in one place. Sign in with Google; only an active owner gets in
// (the Worker checks it on every request, this screen only says so). Screens: מצב כללי, ניטור, סטטיסטיקות, כסף ואירועים, נתונים, אנשים, מפתחות API, מתגים, תור שליחה, משימות מתוזמנות,
// אבטחה, גיבויים.
// /admin?demo shows the same screens over made-up data, without signing in and without reading or writing anything.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Button, EmptyState, Icon, Tabs } from '../app/v2/kit';
import { readyAuth, signIn, signOutUser, inAppBrowser } from '../app/firebase';
import { useLoad, useNotice } from './shared';
import { currentTab, useWide } from './desk/route';
import { useModalTrap } from './desk/modal';
import { Crash } from './desk/Crash';
import { Sidebar } from './desk/Sidebar';
import { failedMails, setFailedMails } from './desk/counts';
import { ConsoleError, errorText, source, type Me } from './source';
import { OverviewScreen } from './Overview';
import { KeysScreen } from './Keys';
import { PeopleScreen } from './People';
import { BackupsScreen } from './Backups';
import { MonitorScreen } from './Monitor';
import { SecurityScreen } from './Security';
import { DataScreen } from './Data';
import { StatsScreen } from './Stats';
import { MoneyScreen } from './Money';
import { SwitchesScreen } from './Switches';
import { QueueScreen } from './Queue';
import { JobsScreen } from './Jobs';
import { TrafficScreen } from './Traffic';
import { SpeedScreen } from './Speed';
import { RunScreen } from './Run';
import { ImportScreen } from './Import';

type Tab = 'overview' | 'monitor' | 'stats' | 'traffic' | 'money' | 'data' | 'people' | 'keys' | 'switches' | 'queue' | 'jobs' | 'speed' | 'run' | 'import' | 'security' | 'backups';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'מצב כללי' },
  { value: 'monitor', label: 'ניטור' },
  { value: 'stats', label: 'סטטיסטיקות' },
  { value: 'traffic', label: 'ביקורים ושימוש' },
  { value: 'money', label: 'כסף ואירועים' },
  { value: 'data', label: 'נתונים' },
  { value: 'people', label: 'אנשים' },
  { value: 'keys', label: 'מפתחות API' },
  { value: 'switches', label: 'מתגים' },
  { value: 'queue', label: 'תור שליחה' },
  { value: 'jobs', label: 'משימות מתוזמנות' },
  { value: 'speed', label: 'מהירות' },
  { value: 'run', label: 'הרצת פעולה' },
  { value: 'import', label: 'ייבוא מאקסל' },
  { value: 'security', label: 'אבטחה' },
  { value: 'backups', label: 'גיבויים' },
];
const tabOf = (): Tab => { const h = currentTab(); return (TABS.some((t) => t.value === h) ? h : 'overview') as Tab; };

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
  const wide = useWide();
  useModalTrap();
  const notice = useNotice();
  const people = useLoad(() => source.people());
  const main = useRef<HTMLElement>(null);
  useEffect(() => { const on = () => { setTab(tabOf()); scrollTo(0, 0); main.current?.scrollTo(0, 0); }; addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  const go = (t: Tab) => { location.hash = '/' + t; setTab(t); scrollTo(0, 0); };
  // the sidebar's red count; the screens that read the queue set it themselves
  useEffect(() => {
    if (!wide || failedMails() !== null || tab === 'overview' || tab === 'queue') return;
    source.overview().then((o) => { if (failedMails() === null) setFailedMails(o.queues.email.failed); }).catch(() => {});
    // once per console load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide]);
  const screen = (
    <Crash key={tab}>
      {tab === 'overview' && <OverviewScreen />}
      {tab === 'people' && <PeopleScreen me={me} people={people.data || []} loading={people.loading} error={people.error} reload={people.reload} notify={notice.show} />}
      {tab === 'keys' && <KeysScreen people={people.data || []} notify={notice.show} />}
      {tab === 'backups' && <BackupsScreen notify={notice.show} />}
      {tab === 'monitor' && <MonitorScreen notify={notice.show} />}
      {tab === 'security' && <SecurityScreen />}
      {tab === 'data' && <DataScreen notify={notice.show} />}
      {tab === 'stats' && <StatsScreen />}
      {tab === 'traffic' && <TrafficScreen />}
      {tab === 'money' && <MoneyScreen />}
      {tab === 'switches' && <SwitchesScreen notify={notice.show} />}
      {tab === 'queue' && <QueueScreen notify={notice.show} />}
      {tab === 'jobs' && <JobsScreen notify={notice.show} />}
      {tab === 'speed' && <SpeedScreen />}
      {tab === 'run' && <RunScreen notify={notice.show} />}
      {tab === 'import' && <ImportScreen notify={notice.show} />}
    </Crash>
  );
  if (wide) return (
    <div className="v2 c-shell d-shell" dir="rtl">
      {source.demo && <div className="d-demo" role="status"><b>נתוני דמו</b><span>· שום דבר לא נשמר</span></div>}
      <div className="d-frame">
        <Sidebar me={me} tab={tab} />
        <main className="d-main" ref={main}>{screen}</main>
      </div>
      {notice.view}
    </div>
  );
  return (
    <div className="v2 c-shell" dir="rtl">
      {source.demo && <div className="c-demo" role="status">תצוגה עם נתונים לא אמיתיים. שום דבר לא נשמר.</div>}
      <div className="c-top">
        <div className="c-brand"><Icon name="server" size={22} /><span>חוות רווה · שרת</span></div>
        <PhoneTabs tab={tab} onChange={go} />
      </div>
      <main className="c-main">{screen}</main>
      {notice.view}
    </div>
  );
}

/** The phone's tab strip: 16 tabs scroll sideways. The open one is always scrolled into view (also on a direct link to
 *  one screen), and a fade on an edge says there are more tabs that way. */
function PhoneTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: true });
  const strip = () => wrap.current?.querySelector<HTMLElement>('.k-tabs') || null;
  const measure = () => {
    const el = strip();
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL: 0 at the start (right), negative toward the end
    setMore({ start: pos > 4, end: pos < max - 4 });
  };
  useEffect(() => {
    const el = strip();
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); removeEventListener('resize', measure); };
  }, []);
  const first = useRef(true);
  useEffect(() => {
    const el = strip();
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && on && el.scrollWidth > el.clientWidth) {
      // center the open tab inside the strip only (scrollIntoView would also move the page)
      const box = el.getBoundingClientRect(), b = on.getBoundingClientRect();
      el.scrollBy({ left: b.left + b.width / 2 - (box.left + box.width / 2), behavior: first.current ? 'auto' : 'smooth' });
    }
    first.current = false;
    measure();
  }, [tab]);
  return (
    <div ref={wrap} className={`c-tabs${more.start ? ' c-tabs--start' : ''}${more.end ? ' c-tabs--end' : ''}`}>
      <Tabs label="קונסולה" options={TABS.map(({ value, label }) => ({ value, label }))} value={tab} onChange={onChange} />
    </div>
  );
}
