// אנשים: everyone with an account, their role and status, and the owner's actions on them (role, block, notes,
// delete, a role set ahead for an email). Every change runs through the API as the signed-in owner, so it gets the
// app's checks, its activity line ("דרך קונסולה · מני") and its notification, exactly like the app.
// Phone: rows and a sheet, as before. Computer: a table with the person beside it (desk/PeopleDesk.tsx).
import { useState } from 'react';
import { Avatar, Button, Card, Chip, ChipRow, ChoiceGroup, ConfirmSheet, DetailList, DetailRow, Field, ListCard, Row, SearchField, Sheet, Tag, TextAreaField } from '../app/v2/kit';
import { ROLE_LABELS } from '../app/types';
import { ddmm } from '../app/v2/format';
import { outHref, Section } from './shared';
import { source, type Me, type Person } from './source';
import { useRest, useWide } from './desk/route';
import { blockText, callIt, changeText, day, deleteText, FILTERS, gp, lastEntryFull, OWNER_WARN, type Role, roleWord, statusWord, useChanges, useInvite, usePeopleAccess, usePeopleKeys, usePeopleList, usePersonActions } from './desk/PeopleSpec';
import { PeopleDesk } from './desk/PeopleDesk';

const ROLES: { value: Role; label: string }[] = (['guest', 'staff', 'manager', 'owner'] as const).map((value) => ({ value, label: ROLE_LABELS[value] }));
type Props = { me: Me; people: Person[]; loading: boolean; error: string | null; reload: () => void; notify: (t: string, tone?: 'info' | 'alert') => void };

export function PeopleScreen(props: Props) {
  return useWide() ? <PeopleDesk {...props} /> : <PeoplePhone {...props} />;
}

function PeoplePhone({ me, people, loading, error, reload, notify }: Props) {
  const { filter, setFilter, q, setQ, counts, rows } = usePeopleList(people);
  // a link to one person (#/people/<uid>) opens them here too
  const [openUid, setOpenUid] = useState<string | null>(useRest('people')[0][0] || null);
  const [inviting, setInviting] = useState(false);
  const open = people.find((p) => p.uid === openUid) || null;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">אנשים והרשאות</h1>
          <p className="c-sub">מי יכול להיכנס ובאיזה תפקיד. העבודה היומיומית מול אנשים נשארת באפליקציה. שינוי כאן הוא בדיוק כמו באפליקציה: עם ההתראה ושורת היומן.</p>
        </div>
        <Button variant="neutral" icon="plus" onClick={() => setInviting(true)}>להוסיף מישהו מראש</Button>
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
                tags={<>{p.status === 'blocked' && <Tag tone="urgent">{statusWord(p)}</Tag>}{p.uid === me.uid && <Tag tone="warm">את/ה</Tag>}</>}
                meta={<>{roleWord(p)} · <span className="k-ltr">{p.email}</span></>} chevron onClick={() => setOpenUid(p.uid)} muted={p.status === 'blocked'} />
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
  const [askOwner, setAskOwner] = useState(false);
  const a = usePersonActions(p, me, onChanged, notify);
  const { busy, blocked, self, farmOwner } = a;
  const back = async (done: Promise<boolean>, close = false) => { if (await done) { setMode('view'); if (close) onClose(); } };
  const access = usePeopleAccess();
  const keys = usePeopleKeys();
  const changes = useChanges(p);
  const title = mode === 'role' ? 'שינוי תפקיד' : mode === 'notes' ? 'הערות פנימיות' : mode === 'block' ? (blocked ? 'לשחרר את החסימה?' : 'לחסום?') : mode === 'delete' ? 'למחוק את האדם?' : (p.displayName || p.email);
  return (
    <Sheet open onClose={onClose} title={title} aside={mode === 'view' ? <Tag tone={blocked ? 'urgent' : 'neutral'}>{roleWord(p)}</Tag> : undefined}>
      {mode === 'view' && (
        <div className="c-form">
          <DetailList>
            <DetailRow term="מייל">{p.email ? <a className="c-link" href={`mailto:${p.email}`}><span className="k-ltr" dir="ltr">{p.email}</span></a> : '—'}</DetailRow>
            <DetailRow term="טלפון">{p.phone ? <a className="c-link" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}><span className="k-ltr" dir="ltr">{p.phone}</span></a> : '—'}</DetailRow>
            <DetailRow term="מצב">{statusWord(p)}</DetailRow>
            <DetailRow term="מספר לקוח"><span className="k-num">{p.customerNumber ?? '—'}</span></DetailRow>
            <DetailRow term="הצטרף">{p.createdAt ? `${ddmm(p.createdAt)}.${new Date(p.createdAt).getFullYear()}` : '—'}</DetailRow>
            {access && <DetailRow term="כניסה אחרונה">{access[p.uid]?.at ? lastEntryFull(access[p.uid]) : 'עוד לא'}</DetailRow>}
            {keys && <DetailRow term="מפתח API">{keys[p.uid]?.join(', ') || 'אין'}</DetailRow>}
            {p.notes && <DetailRow term="הערות">{p.notes}</DetailRow>}
          </DetailList>
          {!!changes.data?.length && (
            <Section title="שינויי הרשאות"><ListCard>{changes.data.map((c, i) => <Row key={c.at + i} title={changeText(p, c)} meta={day(c.at)} />)}</ListCard></Section>
          )}
          <p className="c-note"><a className="c-link" href={outHref(source.demo ? '/app/manage/people' : `/app/manage/people/${encodeURIComponent(p.uid)}`)}>לכרטיס באפליקציה</a></p>
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
          {role !== 'guest' && role !== p.role && <p className="c-note">{callIt(p)} {gp(p, 'יקבל', 'תקבל')} הודעה באפליקציה על התפקיד החדש.</p>}
          {role === 'owner' && p.role !== 'owner' && <p className="c-warn">בעלים מקבלים גישה מלאה לכל החווה, כולל הקונסולה הזאת.</p>}
          <Button size="lg" block disabled={busy || role === p.role} onClick={() => (role === 'owner' ? setAskOwner(true) : back(a.setRole(role)))}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
          <ConfirmSheet open={askOwner} onClose={() => setAskOwner(false)} cancelLabel="חזרה" confirmLabel="כן, לתת תפקיד בעלים"
            title={`לתת ל${p.displayName || p.email} תפקיד בעלים?`}
            text={OWNER_WARN}
            onConfirm={async () => { await back(a.setRole('owner')); setAskOwner(false); }} />
        </div>
      )}
      {mode === 'notes' && (
        <div className="c-form">
          <TextAreaField label="הערות (רק מנהלים רואים)" value={notes} maxLength={2000} height={140} onChange={(e) => setNotes(e.target.value)} />
          <Button size="lg" block disabled={busy || notes === (p.notes || '')} onClick={() => back(a.setNotes(notes))}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'block' && (
        <div className="c-form">
          <p className="c-sub">{blockText(p)}</p>
          <Button size="lg" variant={blocked ? 'primary' : 'danger'} className={blocked ? undefined : 'c-danger'} block disabled={busy}
            onClick={() => back(a.toggleBlock())}>{blocked ? 'כן, לשחרר' : 'כן, לחסום'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="c-form">
          <p className="c-sub">{deleteText(p)}</p>
          <Button size="lg" variant="danger" className="c-danger" block disabled={busy} onClick={() => back(a.remove(), true)}>{busy ? 'מוחק…' : 'כן, למחוק'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
    </Sheet>
  );
}

function InviteSheet({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const { email, setEmail, role, setRole, busy, ok, save } = useInvite(notify, onClose);
  return (
    <Sheet open={open} onClose={onClose} title="להוסיף מישהו מראש">
      <div className="c-form">
        <p className="c-sub">למי שעוד לא נרשם: כשיתחבר עם המייל הזה הוא יקבל את התפקיד מיד. למי שכבר רשום, משנים תפקיד מהרשימה.</p>
        <Field label="מייל" type="email" ltr value={email} onChange={(e) => setEmail(e.target.value)} />
        <ChoiceGroup label="תפקיד" options={ROLES.filter((r) => r.value !== 'guest') as { value: Exclude<Role, 'guest'>; label: string }[]} value={role} onChange={setRole} />
        <Button size="lg" block disabled={busy || !ok} onClick={save}>שמירה</Button>
      </div>
    </Sheet>
  );
}
