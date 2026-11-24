// אנשים והרשאות on a computer (K8): everyone as a table, and the chosen person beside it: their role, how to reach them,
// last entry, API key, permission changes, notes, and block or delete (each behind its confirmation).
import { useEffect, useState } from 'react';
import { ConfirmSheet } from '../../app/v2/kit';
import { initials } from '../../app/v2/format';
import { ROLE_LABELS } from '../../app/types';
import { fmt, outHref } from '../shared';
import { source, type Me, type Person, type PersonAccess } from '../source';
import { Act, Btn, Chips, Cols, type Column, Dialog, DTag, EmptyPanel, Fact, Failed, Hist, Input, LoadingPanel, Ltr, Page, Panel, saveCsv, Search, Seg, Skeleton, SubTitle, Table, TableCard, Toolbar } from './desk';
import { useSelected } from './route';
import { blockText, callIt, changeText, day, deleteText, FILTERS, gp, lastEntry, lastEntryFull, type Notify, OWNER_WARN, type Role, ROLE_VALUES, roleWord, statusWord, useChanges, useInvite, usePeopleAccess, usePeopleKeys, usePeopleList, usePersonActions } from './PeopleSpec';

const MAX = 300;
export function PeopleDesk({ me, people, loading, error, reload, notify }: { me: Me; people: Person[]; loading: boolean; error: string | null; reload: () => void; notify: Notify }) {
  const { filter, setFilter, q, setQ, counts, rows } = usePeopleList(people);
  const access = usePeopleAccess();
  const keys = usePeopleKeys();
  const [inviting, setInviting] = useState(false);
  const shown = rows.slice(0, MAX);
  const [uid, select] = useSelected('people', shown.map((p) => p.uid));
  const open = shown.find((p) => p.uid === uid) || null;
  const ready = !loading || !!people.length;
  const columns: Column<Person>[] = [
    { key: 'name', head: 'שם', cell: (p) => <span className="dd-person"><span className="dd-avatar" aria-hidden="true">{initials(callIt(p))}</span><span className="dd-person__text"><b>{callIt(p)}</b><span className="dd-mail"><Ltr>{p.email}</Ltr></span></span></span> },
    { key: 'email', head: 'מייל', soft: true, cell: (p) => <Ltr>{p.email}</Ltr> },
    { key: 'role', head: 'תפקיד', width: 134, cell: (p) => roleWord(p) },
    ...(access ? [{ key: 'last', head: 'נכנס לאחרונה', width: 154, soft: true, cell: (p: Person) => (access[p.uid]?.at ? lastEntry(access[p.uid].at!) : '—') }] : []),
    { key: 'tags', head: '', width: 114, align: 'end', cell: (p) => (p.status === 'blocked' ? <DTag tone="red">{statusWord(p)}</DTag> : p.status === 'pending' ? <DTag tone="amber">{gp(p, 'ממתין', 'ממתינה')}</DTag> : p.uid === me.uid ? <DTag>את/ה</DTag> : null) },
  ];
  const excel = () => saveCsv('havat-ravve-people.csv', ['שם', 'מייל', 'טלפון', 'תפקיד', 'מצב', 'מספר לקוח', 'הצטרף', ...(access ? ['נכנס לאחרונה'] : []), 'הערות'],
    rows.map((p) => [p.displayName, p.email, p.phone, roleWord(p), statusWord(p), p.customerNumber ?? '', p.createdAt ? p.createdAt.slice(0, 10) : '', ...(access ? [access[p.uid]?.at?.slice(0, 10) || ''] : []), p.notes || '']));
  return (
    <Page group="נתונים" title="אנשים והרשאות" sub="מי יכול להיכנס ובאיזה תפקיד. העבודה היומיומית מול אנשים נשארת באפליקציה" actions={<Btn kind="action" icon="plus" onClick={() => setInviting(true)}>להוסיף מישהו מראש</Btn>}>
      <Toolbar end={<Btn icon="download" onClick={excel} disabled={!rows.length}>אקסל</Btn>}>
        <Search value={q} onChange={setQ} placeholder="שם, מייל, טלפון או מספר" />
        <Chips label="סינון" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.v, label: ready ? `${f.l} · ${fmt(counts[f.v])}` : f.l }))} />
      </Toolbar>
      <Cols>
        <TableCard style={{ containerType: 'inline-size' }}>
          <Table label="אנשים" columns={columns} rows={ready ? shown : null} rowKey={(p) => p.uid} selected={uid} onSelect={select} loading={loading} error={error ? `לא הצלחנו לקרוא את רשימת האנשים. ${error}` : null} retry={reload} empty="אין אנשים שמתאימים לחיפוש." />
          {rows.length > MAX && <p className="dd-more dd-soft">מוצגים {MAX} הראשונים. חפשו כדי למצוא אדם מסוים.</p>}
        </TableCard>
        {open ? <PersonPanel key={open.uid} p={open} me={me} access={access ? access[open.uid] || { at: null, device: null } : null} keys={keys} reload={reload} notify={notify} />
          : ready ? <EmptyPanel>לא נבחר אדם.</EmptyPanel> : <LoadingPanel />}
      </Cols>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} notify={notify} />
    </Page>
  );
}

function PersonPanel({ p, me, access, keys, reload, notify }: { p: Person; me: Me; access: PersonAccess | null; keys: Record<string, string[]> | null; reload: () => void; notify: Notify }) {
  const a = usePersonActions(p, me, reload, notify);
  const changes = useChanges(p);
  const [role, setRole] = useState<Role | null>(null);
  const [ask, setAsk] = useState<'block' | 'delete' | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  useEffect(() => { setRole(null); }, [p.role]);
  const options = p.role === 'vendor' ? [{ value: 'guest', label: roleWord(p, 'guest') }, { value: 'vendor', label: roleWord(p) }] : ROLE_VALUES.map((v) => ({ value: v as string, label: roleWord(p, v) }));
  const sub = [roleWord(p), p.customerNumber ? `מספר ${p.customerNumber}` : '', p.createdAt ? `${gp(p, 'הצטרף', 'הצטרפה')} ב־${day(p.createdAt)}` : ''].filter(Boolean).join(' · ');
  const name = callIt(p);
  return (
    <Panel title={name} sub={sub} label="האדם" aside={p.status === 'blocked' ? <DTag tone="red">{statusWord(p)}</DTag> : undefined} footer={<>
      {/* the demo's people are not the demo app's people: there the link goes to its list */}
      <Btn onClick={() => { window.open(outHref(source.demo ? '/app/manage/people' : `/app/manage/people/${encodeURIComponent(p.uid)}`), '_blank', 'noopener'); }}>לכרטיס באפליקציה</Btn>
      {!a.self && <Btn kind={a.blocked ? 'action' : 'danger'} disabled={a.busy} onClick={() => setAsk('block')}>{a.blocked ? 'שחרור החסימה' : 'חסימה'}</Btn>}
      {!a.self && !a.farmOwner && <Btn kind="danger" disabled={a.busy} onClick={() => setAsk('delete')}>מחיקה</Btn>}
    </>}>
      <div className="dd-role">
        <span className="dd-role__label">תפקיד</span>
        <Seg label="תפקיד" value={p.role as string} options={options} disabled={a.self || a.busy} onChange={(v) => { if (v !== p.role) setRole(v as Role); }} />
        <span className="dd-role__note">{a.self ? 'את החשבון שלך אי אפשר לשנות מכאן.' : p.role === 'vendor' ? 'בעל דוכן יכול רק לחזור להיות אורח. מצרפים דוכן דרך הזמנת דוכן באפליקציה.' : 'שינוי תפקיד נרשם ביומן האבטחה, והאדם מקבל התראה.'}</span>
      </div>
      <Fact label="מייל">{p.email ? <a className="dd-link" href={`mailto:${p.email}`}><Ltr>{p.email}</Ltr></a> : '—'}</Fact>
      <Fact label="טלפון">{p.phone ? <a className="dd-link" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}><Ltr>{p.phone}</Ltr></a> : '—'}</Fact>
      {p.status === 'pending' && <Fact label="מצב">{statusWord(p)}</Fact>}
      {access && <Fact label="כניסה אחרונה">{access.at ? lastEntryFull(access) : 'עוד לא'}</Fact>}
      {keys && <Fact label="מפתח API">{keys[p.uid]?.join(', ') || 'אין'}</Fact>}
      <SubTitle>שינויי הרשאות</SubTitle>
      {changes.error && !changes.data && <Failed text="לא הצלחנו לקרוא את השינויים." retry={changes.reload} />}
      {!changes.data && !changes.error && <div className="dd-load"><Skeleton lines={2} /></div>}
      {changes.data && !changes.data.length && <p className="dd-none">לא נרשמו שינויים.</p>}
      {changes.data?.map((c, i) => <Hist key={c.at + i} when={day(c.at)}>{changeText(p, c)}</Hist>)}
      <div className="dd-notes"><h3>הערות פנימיות</h3><Act onClick={() => setNotes(p.notes || '')} disabled={a.self || a.busy}>{p.notes ? 'לערוך' : 'להוסיף'}</Act></div>
      {p.notes && <p className="dd-notes__text">{p.notes}</p>}
      <Dialog open={notes !== null} onClose={() => setNotes(null)} title="הערות פנימיות" sub={`${name} · רק מנהלים רואים`} width={480} footer={<>
        <Btn kind="primary" disabled={a.busy || notes === (p.notes || '') || (notes || '').length > 2000} onClick={async () => { if (await a.setNotes(notes || '')) setNotes(null); }}>{a.busy ? 'שומר…' : 'שמירה'}</Btn><Btn onClick={() => setNotes(null)}>ביטול</Btn>
      </>}>
        <Input label="הערות" labelHidden multiline value={notes || ''} onChange={setNotes} error={(notes || '').length > 2000 ? 'עד 2,000 תווים' : undefined} />
      </Dialog>
      <ConfirmSheet open={role !== null} onClose={() => setRole(null)} tone={role === 'owner' ? 'danger' : 'primary'} cancelLabel="חזרה"
        title={role === 'owner' ? `לתת ל${name} תפקיד בעלים?` : `לשנות את התפקיד של ${name} ל${role ? roleWord(p, role) : ''}?`}
        text={role === 'owner' ? `${OWNER_WARN} ${name} ${gp(p, 'יקבל', 'תקבל')} הודעה באפליקציה על התפקיד החדש.` : role === 'guest' ? `${name} ${gp(p, 'לא יראה', 'לא תראה')} יותר את אזור הצוות באפליקציה.` : `${name} ${gp(p, 'יקבל', 'תקבל')} הודעה באפליקציה על התפקיד החדש.`}
        confirmLabel={role === 'owner' ? 'כן, לתת תפקיד בעלים' : 'כן, לשנות'} onConfirm={async () => { await a.setRole(role!); setRole(null); }} />
      <ConfirmSheet open={ask === 'block'} onClose={() => setAsk(null)} tone={a.blocked ? 'primary' : 'danger'} cancelLabel="חזרה" title={a.blocked ? 'לשחרר את החסימה?' : 'לחסום?'} text={blockText(p)} confirmLabel={a.blocked ? 'כן, לשחרר' : 'כן, לחסום'}
        onConfirm={async () => { await a.toggleBlock(); setAsk(null); }} />
      <ConfirmSheet open={ask === 'delete'} onClose={() => setAsk(null)} cancelLabel="חזרה" title="למחוק את האדם?" text={deleteText(p)} confirmLabel="כן, למחוק" onConfirm={async () => { if (await a.remove()) setAsk(null); }} />
    </Panel>
  );
}

function InviteDialog({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: Notify }) {
  const i = useInvite(notify, onClose);
  return (
    <Dialog open={open} onClose={onClose} title="להוסיף מישהו מראש" width={480} footer={<><Btn kind="primary" disabled={i.busy || !i.ok} onClick={i.save}>{i.busy ? 'שומר…' : 'שמירה'}</Btn><Btn onClick={onClose}>ביטול</Btn></>}>
      <p className="dd-soft">למי שעוד לא נרשם: כשיתחבר עם המייל הזה הוא יקבל את התפקיד מיד. למי שכבר רשום, משנים תפקיד מהרשימה.</p>
      <Input label="מייל" type="email" ltr value={i.email} onChange={i.setEmail} />
      <div className="dd-role"><span className="dd-role__label">תפקיד</span><Seg label="תפקיד" value={i.role} onChange={i.setRole} options={(['staff', 'manager', 'owner'] as const).map((v) => ({ value: v, label: ROLE_LABELS[v] }))} /></div>
      {i.role === 'owner' && <p className="dd-soft">{OWNER_WARN}</p>}
    </Dialog>
  );
}
