// אנשים: everyone with an account, their role and status, and the owner's actions on them (role, block, notes,
// delete, a role set ahead for an email). Every change runs through the API as the signed-in owner, so it gets the
// app's checks, its activity line ("דרך קונסולה · מני") and its notification, exactly like the app.
import { useMemo, useState } from 'react';
import { Avatar, Button, Card, Chip, ChipRow, ChoiceGroup, ConfirmSheet, DetailList, DetailRow, Field, ListCard, Row, SearchField, Sheet, Tag, TextAreaField } from '../app/v2/kit';
import { ROLE_LABELS } from '../app/types';
import { ddmm } from '../app/v2/format';
import { Section } from './shared';
import { errorText, source, type Me, type Person } from './source';

type Filter = 'all' | 'team' | 'guests' | 'vendors' | 'blocked';
const FILTERS: { v: Filter; l: string }[] = [{ v: 'all', l: 'כולם' }, { v: 'team', l: 'צוות' }, { v: 'guests', l: 'אורחים' }, { v: 'vendors', l: 'דוכנים' }, { v: 'blocked', l: 'חסומים' }];
const ROLE_ORDER = ['owner', 'manager', 'staff', 'vendor', 'guest'];
const OWNER_EMAIL = 'meniviner@gmail.com';
type Role = 'guest' | 'staff' | 'manager' | 'owner';
const ROLES: { value: Role; label: string }[] = (['guest', 'staff', 'manager', 'owner'] as const).map((value) => ({ value, label: ROLE_LABELS[value] }));

export function PeopleScreen({ me, people, loading, error, reload, notify }: { me: Me; people: Person[]; loading: boolean; error: string | null; reload: () => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const counts = useMemo(() => ({
    all: people.length, team: people.filter((p) => ['owner', 'manager', 'staff'].includes(p.role)).length, guests: people.filter((p) => p.role === 'guest').length,
    vendors: people.filter((p) => p.role === 'vendor').length, blocked: people.filter((p) => p.status === 'blocked').length,
  }), [people]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .filter((p) => filter === 'all' || (filter === 'team' ? ['owner', 'manager', 'staff'].includes(p.role) : filter === 'guests' ? p.role === 'guest' : filter === 'vendors' ? p.role === 'vendor' : p.status === 'blocked'))
      .filter((p) => !t || `${p.displayName} ${p.email} ${p.phone} ${p.customerNumber ?? ''}`.toLowerCase().includes(t))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.displayName.localeCompare(b.displayName, 'he'));
  }, [people, filter, q]);
  const open = people.find((p) => p.uid === openUid) || null;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">אנשים</h1>
          <p className="c-sub">כל מי שיש לו חשבון באפליקציה. שינוי כאן הוא בדיוק כמו באפליקציה: עם ההתראה ושורת היומן.</p>
        </div>
        <Button variant="neutral" icon="plus" onClick={() => setInviting(true)}>תפקיד מראש למייל</Button>
      </div>
      <div className="c-filters">
        <SearchField label="חיפוש אדם" placeholder="שם, מייל, טלפון או מספר לקוח" value={q} onChange={(e) => setQ(e.target.value)} active={!!q} />
        <ChipRow label="סינון">{FILTERS.map((f) => <Chip key={f.v} selected={filter === f.v} onClick={() => setFilter(f.v)}>{f.l} <span className="k-num">{counts[f.v]}</span></Chip>)}</ChipRow>
      </div>
      {error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את רשימת האנשים. {error}</Card>}
      {loading && !people.length && <Card pad="md" className="c-soft">טוען…</Card>}
      {!loading && !rows.length && !error && <Card pad="md" className="c-soft">אין אנשים שמתאימים לחיפוש.</Card>}
      {!!rows.length && (
        <Section title={`${rows.length} אנשים`}>
          <ListCard>
            {rows.slice(0, 300).map((p) => (
              <Row key={p.uid} leading={<Avatar name={p.displayName} size={40} tone={p.uid === me.uid ? 'me' : 'default'} />} title={p.displayName || p.email}
                tags={<>{p.status === 'blocked' && <Tag tone="urgent">חסום</Tag>}{p.uid === me.uid && <Tag tone="warm">את/ה</Tag>}</>}
                meta={<>{ROLE_LABELS[p.role]} · <span className="k-ltr">{p.email}</span></>} chevron onClick={() => setOpenUid(p.uid)} muted={p.status === 'blocked'} />
            ))}
          </ListCard>
          {rows.length > 300 && <p className="c-note">מוצגים 300 הראשונים. חפשו כדי למצוא אדם מסוים.</p>}
        </Section>
      )}
      {open && <PersonSheet p={open} me={me} onClose={() => setOpenUid(null)} onChanged={reload} notify={notify} />}
      <InviteSheet open={inviting} onClose={() => setInviting(false)} notify={notify} />
    </>
  );
}

type Mode = 'view' | 'role' | 'notes' | 'block' | 'delete';
function PersonSheet({ p, me, onClose, onChanged, notify }: { p: Person; me: Me; onClose: () => void; onChanged: () => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [mode, setMode] = useState<Mode>('view');
  const [role, setRole] = useState<Role>(p.role === 'vendor' ? 'guest' : p.role);
  const [notes, setNotes] = useState(p.notes || '');
  const [busy, setBusy] = useState(false);
  const [askOwner, setAskOwner] = useState(false);
  const self = p.uid === me.uid;
  const farmOwner = p.email.toLowerCase() === OWNER_EMAIL;
  const run = async (op: string, body: Record<string, unknown>, done: string, close = false) => {
    setBusy(true);
    try {
      await source.action(op, { uid: p.uid, ifUpdatedAt: p.updatedAt, ...body });
      notify(done);
      setMode('view');
      onChanged();
      if (close) onClose();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const blocked = p.status === 'blocked';
  const title = mode === 'role' ? 'שינוי תפקיד' : mode === 'notes' ? 'הערות פנימיות' : mode === 'block' ? (blocked ? 'לשחרר את החסימה?' : 'לחסום?') : mode === 'delete' ? 'למחוק את האדם?' : (p.displayName || p.email);
  return (
    <Sheet open onClose={onClose} title={title} aside={mode === 'view' ? <Tag tone={blocked ? 'urgent' : 'neutral'}>{ROLE_LABELS[p.role]}</Tag> : undefined}>
      {mode === 'view' && (
        <div className="c-form">
          <DetailList>
            <DetailRow term="מייל"><span className="k-ltr" dir="ltr">{p.email}</span></DetailRow>
            <DetailRow term="טלפון"><span className="k-ltr" dir="ltr">{p.phone || '—'}</span></DetailRow>
            <DetailRow term="מצב">{blocked ? 'חסום' : p.status === 'pending' ? 'ממתין לאישור' : 'פעיל'}</DetailRow>
            <DetailRow term="מספר לקוח"><span className="k-num">{p.customerNumber ?? '—'}</span></DetailRow>
            <DetailRow term="הצטרף">{p.createdAt ? `${ddmm(p.createdAt)}.${new Date(p.createdAt).getFullYear()}` : '—'}</DetailRow>
            {p.notes && <DetailRow term="הערות">{p.notes}</DetailRow>}
          </DetailList>
          {self && <p className="c-note">את החשבון שלך אי אפשר לשנות מכאן.</p>}
          {!self && (
            <div className="c-grid2">
              <Button variant="neutral" icon="people" onClick={() => setMode('role')}>שינוי תפקיד</Button>
              <Button variant="neutral" icon="edit" onClick={() => { setNotes(p.notes || ''); setMode('notes'); }}>הערות</Button>
              <Button variant={blocked ? 'outline' : 'neutral'} icon="blocked" onClick={() => setMode('block')}>{blocked ? 'שחרור החסימה' : 'חסימה'}</Button>
              {!farmOwner && <Button variant="danger" className="c-danger" onClick={() => setMode('delete')}>מחיקה</Button>}
            </div>
          )}
        </div>
      )}
      {mode === 'role' && (
        <div className="c-form">
          {p.role === 'vendor' && <p className="c-note">בעל דוכן יכול רק לחזור להיות אורח. מצרפים דוכן דרך הזמנת דוכן באפליקציה.</p>}
          <ChoiceGroup options={p.role === 'vendor' ? ROLES.filter((r) => r.value === 'guest') : ROLES} value={role} onChange={setRole} />
          {role !== 'guest' && role !== p.role && <p className="c-note">{p.displayName} יקבל/תקבל הודעה באפליקציה על התפקיד החדש.</p>}
          {role === 'owner' && p.role !== 'owner' && <p className="c-warn">בעלים מקבלים גישה מלאה לכל החווה, כולל הקונסולה הזאת.</p>}
          <Button size="lg" block disabled={busy || role === p.role} onClick={() => (role === 'owner' ? setAskOwner(true) : run('people.setRole', { role }, 'התפקיד עודכן'))}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
          <ConfirmSheet open={askOwner} onClose={() => setAskOwner(false)} cancelLabel="חזרה" confirmLabel="כן, לתת תפקיד בעלים"
            title={`לתת ל${p.displayName || p.email} תפקיד בעלים?`}
            text="בעלים רואים ומשנים הכל באפליקציה, ונכנסים גם לקונסולה הזאת: אנשים ותפקידים, מפתחות API, מתגים, גיבויים ומחיקת נתונים."
            onConfirm={async () => { await run('people.setRole', { role: 'owner' }, 'התפקיד עודכן'); setAskOwner(false); }} />
        </div>
      )}
      {mode === 'notes' && (
        <div className="c-form">
          <TextAreaField label="הערות (רק מנהלים רואים)" value={notes} maxLength={2000} height={140} onChange={(e) => setNotes(e.target.value)} />
          <Button size="lg" block disabled={busy || notes === (p.notes || '')} onClick={() => run('people.setNotes', { notes }, 'ההערות נשמרו')}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'block' && (
        <div className="c-form">
          <p className="c-sub">{blocked ? `${p.displayName} יוכל/תוכל להיכנס לאפליקציה שוב.` : `${p.displayName} לא יוכל/תוכל להיכנס לאפליקציה עד שתשחררו.`}</p>
          <Button size="lg" variant={blocked ? 'primary' : 'danger'} className={blocked ? undefined : 'c-danger'} block disabled={busy}
            onClick={() => run('people.setStatus', { status: blocked ? 'active' : 'blocked' }, blocked ? 'החסימה שוחררה' : 'נחסם/ה')}>{blocked ? 'כן, לשחרר' : 'כן, לחסום'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="c-form">
          <p className="c-sub">החשבון של {p.displayName} יימחק מהאפליקציה. כרטיסים, תרומות וביקורים נשארים. אם יתחבר/תתחבר שוב, יתחיל/תתחיל מההתחלה. כדי רק למנוע כניסה, עדיף לחסום.</p>
          <Button size="lg" variant="danger" className="c-danger" block disabled={busy} onClick={() => run('people.delete', {}, 'נמחק/ה', true)}>{busy ? 'מוחק…' : 'כן, למחוק'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
    </Sheet>
  );
}

function InviteSheet({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'guest'>>('staff');
  const [busy, setBusy] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const save = async () => {
    setBusy(true);
    try {
      await source.action('invites.setRole', { email: email.trim().toLowerCase(), role });
      notify(`${email.trim()} יקבל/תקבל את התפקיד כשיירשם/תירשם`);
      setEmail(''); onClose();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="תפקיד מראש למייל">
      <div className="c-form">
        <p className="c-sub">למי שעוד לא נרשם: כשיתחבר עם המייל הזה הוא יקבל את התפקיד מיד. למי שכבר רשום, משנים תפקיד מהרשימה.</p>
        <Field label="מייל" type="email" ltr value={email} onChange={(e) => setEmail(e.target.value)} />
        <ChoiceGroup label="תפקיד" options={ROLES.filter((r) => r.value !== 'guest') as { value: Exclude<Role, 'guest'>; label: string }[]} value={role} onChange={setRole} />
        <Button size="lg" block disabled={busy || !ok} onClick={save}>שמירה</Button>
      </div>
    </Sheet>
  );
}
