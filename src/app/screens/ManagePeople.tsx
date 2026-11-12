// Manager: people, role by Google account, recurring tasks, saved places.
import { useMemo, useState } from 'react';
import type { Profile, Role, Template, Place, Task } from '../types';
import { ROLE_LABELS, PAYMENT_LABELS, TAB_LABELS, DAY_LABELS, VISIT_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { A, useDesktop, useToast, fmtDate, fmtMonthYear, firstName, relTime, whenText, todayISO, addDays, money } from '../ui';
import { Head, Sect, Tabs, Btn, Form, Field, Tick, Empty, useSticky, deferDelete } from '../kit';
import { back, navigate } from '../router';
import { usePerson, usePeople, setUserRole, setUserNotes, useRoleInvites, inviteByEmail, removeRoleInvite, saveTemplate, deleteTemplate, useTemplateTasks, useHistoryTasks, editTask, deleteTask, usePlace, addPlace, updatePlace, deletePlace, useTasksAtPlace, getPosition, type NewTemplate } from '../store';
import { useMyTickets, useMyVisits, useMyDonations, useMyTabs, waLink, telLink, useOpenTickets, useOpenTabs } from '../data';
import { useActivityForUser, ACTION_LABELS } from '../activity';
import { mapsLink } from './Tasks';
import { Line, St, Loading, fullDate, hit, asPhone, exportCsv, useSorted, SortTh, rowKeys, isPaid } from './Manage';

// ---------- people ----------
type PFilter = 'all' | 'team' | 'guests' | 'debt' | 'blocked';
const STATUS_HE: Record<string, string> = { active: 'פעיל', pending: 'ממתין', blocked: 'חסום' };
/** Open money per person: unpaid tickets and open stall tabs. */
function useDebts() {
  const tickets = useOpenTickets(true).items; const tabs = useOpenTabs(true).items;
  return useMemo(() => { const m = new Map<string, number>(); for (const t of tickets) if (t.status === 'valid') m.set(t.ownerUid, (m.get(t.ownerUid) || 0) + t.price); for (const t of tabs) if (t.guestUid) m.set(t.guestUid, (m.get(t.guestUid) || 0) + t.total); return m; }, [tickets, tabs]);
}
const PAGE = 100;
export function PeopleScreen({ ctx, people, selectedId }: { ctx: TeamCtx; people: Profile[]; selectedId?: string }) {
  const desktop = useDesktop(); const invites = useRoleInvites(true); const debts = useDebts();
  const [q, setQ] = useSticky('people-q', ''); const [filter, setFilter] = useSticky<PFilter>('people-filter', 'all');
  const [shown, setShown] = useState(PAGE);
  const { sort, toggle, apply } = useSorted<Profile>('name');
  const inFilter = (p: Profile, f: PFilter) => f === 'team' ? p.role !== 'guest' : f === 'guests' ? p.role === 'guest' : f === 'debt' ? debts.has(p.uid) : f === 'blocked' ? p.status === 'blocked' : true;
  const list = useMemo(() => people.filter((p) => inFilter(p, filter)).filter((p) => hit(q, p.displayName, p.email, p.phone, p.customerNumber, ...Object.values(p.fields || {}))), [people, q, filter, debts]);
  const sorted = desktop ? apply(list, (p, k) => k === 'n' ? p.customerNumber : k === 'created' ? p.createdAt : k === 'role' ? ROLE_LABELS[p.role] : k === 'debt' ? debts.get(p.uid) || 0 : p.displayName) : [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  const letters = useMemo(() => { const m = new Map<string, Profile[]>(); for (const p of sorted.slice(0, shown)) { const l = p.displayName.trim()[0] || '?'; m.set(l, [...(m.get(l) || []), p]); } return [...m.entries()]; }, [sorted, shown]);
  const known = new Set(people.map((p) => p.email.toLowerCase()));
  const waiting = invites.items.filter((i) => !known.has(i.email.toLowerCase()));
  const fields = ctx.settings.registrationFields;
  const csv = () => exportCsv(filter === 'all' && !q ? 'אנשים.csv' : 'אנשים - סינון.csv', ['מספר', 'שם', 'טלפון', 'מייל', 'תפקיד', 'מצב', 'חוב פתוח', 'נרשם', ...fields.map((f) => f.label)], sorted.map((p) => [p.customerNumber, p.displayName, asPhone(p.phone), p.email, ROLE_LABELS[p.role], STATUS_HE[p.status] || p.status, debts.get(p.uid) || 0, fullDate(p.createdAt), ...fields.map((f) => p.fields?.[f.id] || '')]));
  const n = (f: PFilter) => people.filter((p) => inFilter(p, f)).length;
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="אנשים" over={`${people.length} נרשמו`} />
      <div className="rm-tools">
        <input className="r-input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="חיפוש: שם, טלפון, מייל, מספר" aria-label="חיפוש אנשים" />
        <Btn small kind="ghost" to="/manage/people/invite">תפקיד לפי מייל</Btn>
        <Btn small kind="quiet" onClick={csv}>ייצוא לאקסל{filter !== 'all' || q ? ` (${sorted.length})` : ''}</Btn>
      </div>
      <Tabs label="את מי להציג" value={filter} onChange={(f) => { setFilter(f); setShown(PAGE); }} items={[{ id: 'all', label: 'כולם', n: n('all') }, { id: 'team', label: 'צוות', n: n('team') }, { id: 'guests', label: 'אורחים', n: n('guests') }, { id: 'debt', label: 'עם חוב', n: n('debt') }, { id: 'blocked', label: 'חסומים', n: n('blocked') }]} />
      {waiting.length > 0 && !q && filter === 'all' && <Line to="/manage/people/invite" title={`${waiting.length} כתובות קיבלו תפקיד ועוד לא נכנסו`} meta={waiting.slice(0, 2).map((i) => i.email).join(', ')} />}
      {sorted.length === 0 ? <Empty title="לא נמצא אף אחד">{q ? 'נסו חלק מהשם או מהטלפון.' : ''}</Empty>
        : desktop ? (
          <table className="r-table">
            <thead><tr><SortTh k="n" sort={sort} onSort={toggle}>מספר</SortTh><SortTh k="name" sort={sort} onSort={toggle}>שם</SortTh><th>טלפון</th><th className="rm-opt">מייל</th><SortTh k="role" sort={sort} onSort={toggle}>תפקיד</SortTh><SortTh k="created" sort={sort} onSort={toggle}>נרשם</SortTh><SortTh k="debt" sort={sort} onSort={toggle}>חוב</SortTh></tr></thead>
            <tbody>{sorted.slice(0, shown).map((p) => (
              <tr key={p.uid} className={p.uid === selectedId ? 'sel' : ''} {...rowKeys(() => navigate(`/manage/people/${p.uid}`, false, true))}>
                <td>{p.customerNumber}</td><td><span className="r-t">{p.displayName}</span>{p.status === 'blocked' && <> <St tone="rust">חסום</St></>}</td>
                <td><span className="rm-ltr">{p.phone}</span></td><td className="rm-opt"><span className="rm-ltr">{p.email}</span></td>
                <td>{p.role === 'guest' ? ROLE_LABELS.guest : <b>{ROLE_LABELS[p.role]}</b>}</td><td>{fmtMonthYear(p.createdAt)}</td>
                <td>{debts.get(p.uid) ? <St tone="rust">{money(debts.get(p.uid)!)}</St> : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : letters.map(([l, ps]) => <div key={l}><div className="rm-letter" aria-hidden="true">{l}</div>{ps.map((p) => <Line key={p.uid} to={`/manage/people/${p.uid}`} title={p.displayName} meta={<>{p.status === 'blocked' ? <St tone="rust">חסום · </St> : p.role !== 'guest' ? <b>{ROLE_LABELS[p.role]} · </b> : null}<span className="rm-ltr">{p.phone || p.email}</span>{debts.get(p.uid) ? <St tone="rust"> · חוב {money(debts.get(p.uid)!)}</St> : null}</>} end={<St tone="soft">{p.customerNumber}</St>} />)}</div>)}
      {sorted.length > shown && <div className="r-actions"><Btn kind="ghost" onClick={() => setShown(shown + PAGE)}>להציג עוד {Math.min(PAGE, sorted.length - shown)} (מתוך {sorted.length})</Btn></div>}
    </>
  );
}

const ROLE_HELP: Record<Role, string> = { guest: 'כרטיסים, ביקורים ותרומות. בלי גישה למשימות ולניהול.', staff: 'משימות, קניות, כניסה לאירוע ודוכן.', manager: 'כל הניהול: אנשים, אירועים, תרומות, דוחות.', owner: 'גם מינוי מנהלים ובעלים, חסימות ופרטי התשלום.' };
export function PersonScreen({ uid, ctx }: { uid: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: p, loading } = usePerson(uid);
  const tickets = useMyTickets(uid, true); const visits = useMyVisits(uid, true); const donations = useMyDonations(uid, true); const tabs = useMyTabs(uid, true);
  const log = useActivityForUser(uid, true);
  const toast = useToast();
  const [notes, setNotes] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ role?: Role; block?: boolean } | null>(null);
  if (loading) return <><Head backTo="/manage/people" backLabel="אנשים" title="" /><Loading /></>;
  if (!p) return <><Head backTo="/manage/people" backLabel="אנשים" title="האדם לא נמצא" /><Empty title="ייתכן שהוסר" /></>;
  const self = p.uid === ctx.actor.uid;
  // the same limits the rules enforce: only an owner touches owners and managers
  const canRole = !self && (ctx.owner || (p.role !== 'owner' && p.role !== 'manager'));
  const roles: Role[] = (ctx.owner ? ['guest', 'staff', 'manager', 'owner'] : ['guest', 'staff']).filter((r) => r !== p.role) as Role[];
  const fail = (e: unknown) => toast({ text: (e as { code?: string })?.code === 'permission-denied' || /הרשאה/.test((e as Error)?.message || '') ? 'אין לך הרשאה לשינוי הזה' : 'לא נשמר. בדקו את הקליטה ונסו שוב.', kind: 'error' });
  const apply = (role: Role, status: Profile['status'], text: string) => {
    const before = { role: p.role, status: p.status };
    setAsk(null);
    setUserRole(ctx.actor, p, role, status).then(() => toast({ text, actions: [{ label: 'ביטול', onClick: () => { setUserRole(ctx.actor, { ...p, role, status }, before.role, before.status).catch(fail); } }] }, 7000)).catch(fail);
  };
  const saveNotes = () => { if (notes === null) return; setUserNotes(p, notes.trim()).then(() => { setNotes(null); toast({ text: 'ההערה נשמרה' }, 2000); }).catch(fail); };
  const orders = [...new Map(tickets.items.map((t) => [t.orderId, tickets.items.filter((x) => x.orderId === t.orderId)])).values()];
  const history = [
    ...log.items.map((a) => ({ at: a.at, text: `${ACTION_LABELS[a.action] || a.action}: ${a.text}`, by: a.by.uid !== p.uid ? firstName(a.by.name) : '' })),
    // role changes are written to both places; show the profile's own entry only when the activity log has none for that moment
    ...(p.log || []).filter((l) => !log.items.some((a) => Math.abs(new Date(a.at).getTime() - new Date(l.at).getTime()) < 10_000)).map((l) => ({ at: l.at, text: l.text, by: firstName(l.by.name) })),
    { at: p.createdAt, text: 'הרשמה לאפליקציה', by: '' },
  ].sort((a, b) => b.at.localeCompare(a.at));
  const nothing = !orders.length && !tabs.items.length && !visits.items.length && !donations.items.length;
  return (
    <>
      <Head backTo="/manage/people" backLabel="אנשים" title={p.displayName} over={`${ROLE_LABELS[p.role]} · מספר ${p.customerNumber} · מ${fmtMonthYear(p.createdAt)}${p.status === 'blocked' ? ' · חסום' : ''}`} />
      {p.phone && <div className="r-actions" style={{ paddingTop: 0 }}><a className="r-btn ghost sm" href={telLink(p.phone)}>להתקשר</a><a className="r-btn ghost sm" href={waLink(p.phone)} target="_blank" rel="noopener">וואטסאפ</a></div>}
      <dl className="r-facts">
        <div><dt>טלפון</dt><dd><span className="rm-ltr">{p.phone || '—'}</span></dd></div>
        <div><dt>מייל</dt><dd style={{ fontSize: 16 }}><span className="rm-ltr">{p.email}</span></dd></div>
        {ctx.settings.registrationFields.map((f) => <div key={f.id}><dt>{f.label}</dt><dd>{p.fields?.[f.id] || '—'}</dd></div>)}
      </dl>

      <Sect title="תפקיד" />
      <p className="rm-lead" style={{ color: 'var(--r-ink)' }}><b>{ROLE_LABELS[p.role]}.</b> {ROLE_HELP[p.role]}</p>
      {self && <p className="rm-lead">את התפקיד של עצמך אי אפשר לשנות מכאן.</p>}
      {!self && !canRole && <p className="rm-lead">רק בעלים יכולים לשנות תפקיד של מנהלים ובעלים.</p>}
      {canRole && !ask && <div className="r-actions" style={{ paddingTop: 10 }}>
        {roles.map((r) => <Btn key={r} small kind="ghost" onClick={() => setAsk({ role: r })}>לשנות ל{ROLE_LABELS[r]}</Btn>)}
        {(ctx.owner || p.role === 'guest' || p.role === 'staff') && <Btn small kind="danger" onClick={() => setAsk({ block: true })}>{p.status === 'blocked' ? 'לשחרר חסימה' : 'לחסום'}</Btn>}
      </div>}
      {ask?.role && <div className="rm-confirm" role="alertdialog" aria-label="אישור שינוי תפקיד">
        <div><b>{p.displayName}: מ{ROLE_LABELS[p.role]} ל{ROLE_LABELS[ask.role]}?</b><br />{ROLE_HELP[ask.role]}</div>
        <div className="rm-do"><Btn small onClick={() => apply(ask.role!, p.status, `${p.displayName} עכשיו ${ROLE_LABELS[ask.role!]}`)}>כן, לשנות</Btn><Btn small kind="quiet" onClick={() => setAsk(null)}>ביטול</Btn></div>
      </div>}
      {ask?.block && <div className="rm-confirm" role="alertdialog" aria-label="אישור חסימה">
        <div>{p.status === 'blocked' ? <><b>לשחרר את החסימה של {p.displayName}?</b><br />האפליקציה תיפתח שוב כרגיל.</> : <><b>לחסום את {p.displayName}?</b><br />האפליקציה תיסגר בפניו/ה לגמרי: בלי הזמנות, בלי כרטיסים, בלי משימות. הכרטיסים שכבר הוזמנו נשארים רשומים.</>}</div>
        <div className="rm-do"><Btn small onClick={() => apply(p.role, p.status === 'blocked' ? 'active' : 'blocked', p.status === 'blocked' ? `${p.displayName}: החסימה שוחררה` : `${p.displayName} נחסם/ה`)}>{p.status === 'blocked' ? 'כן, לשחרר' : 'כן, לחסום'}</Btn><Btn small kind="quiet" onClick={() => setAsk(null)}>ביטול</Btn></div>
      </div>}

      <Sect title="כרטיסים, דוכן, ביקורים, תרומות" />
      {nothing && <p className="rm-lead">עוד אין פעילות.</p>}
      {orders.map((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); const came = valid.filter((x) => x.entries > 0).length; return <Line key={t.orderId} to={`/manage/events/${t.eventId}/guests`} title={`${t.eventTitle} · ${valid.length || o.length} כרטיסים`} meta={!valid.length ? 'ההזמנה בוטלה' : `${PAYMENT_LABELS[t.paymentStatus]}${came ? ` · נכנסו ${came}` : ` · הוזמן ${relTime(t.createdAt)}`}`} end={valid.length && !isPaid(t.paymentStatus) && t.paymentStatus !== 'free' ? <St tone="rust">{money(t.price * valid.length)}</St> : undefined} />; })}
      {tabs.items.map((t) => <Line key={t.id} to={`/manage/events/${t.eventId}/tabs/${t.id}`} title={`דוכן · ${t.eventTitle}`} meta={t.status === 'claimed' ? 'סימנ/ה שהעביר/ה, מחכה לאישור' : TAB_LABELS[t.status]} end={<St tone={t.status === 'paid' || t.status === 'waived' ? 'soft' : 'rust'}>{money(t.total)}</St>} />)}
      {visits.items.map((v) => <Line key={v.id} to={`/manage/visits/${v.id}`} title={`ביקור · ${fullDate(v.date)} · ${v.people} אנשים`} meta={VISIT_LABELS[v.status]} />)}
      {donations.items.map((d) => <Line key={d.id} to={`/manage/donations/${d.id}`} title={`תרומה · ${d.label || fullDate(d.createdAt)}`} meta={`${PAYMENT_LABELS[d.paymentStatus]} · ${fullDate(d.createdAt)}`} end={<St tone={isPaid(d.paymentStatus) ? 'ok' : 'gold'}>{money(d.amount)}</St>} />)}

      <Sect title="הערות מנהלים" />
      <Form onSubmit={saveNotes}>
        <Field label="רק מנהלים רואים">{(id) => <textarea id={id} className="r-input" value={notes ?? p.notes ?? ''} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="מה כדאי לזכור על האדם הזה" />}</Field>
        {notes !== null && notes !== (p.notes || '') && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Btn type="submit" small>שמירת ההערה</Btn><Btn small kind="quiet" onClick={() => setNotes(null)}>ביטול</Btn><span className="rm-dirty">לא נשמר עדיין</span></div>}
      </Form>

      <Sect title="היסטוריה" n={history.length} />
      <ul className="r-log">{history.map((h, i) => <li key={i}>{h.text}{h.by ? ` · ${h.by}` : ''}<span>{whenText(h.at)}</span></li>)}</ul>
    </>
  );
}

type InviteRole = 'staff' | 'manager' | 'owner';
export function InviteRoleScreen({ ctx }: { ctx: TeamCtx }) {
  const invites = useRoleInvites(true); const people = usePeople(true); const toast = useToast();
  const [email, setEmail] = useState(''); const [role, setRole] = useState<InviteRole>('staff'); const [err, setErr] = useState<React.ReactNode>('');
  const known = new Map(people.items.map((p) => [p.email.toLowerCase(), p]));
  const waiting = invites.items.filter((i) => !known.has(i.email.toLowerCase()));
  const save = async () => {
    const e = email.trim().toLowerCase();
    const person = known.get(e);
    if (person) { setErr(<>ל{person.displayName} כבר יש חשבון. את התפקיד משנים <A to={`/manage/people/${person.uid}`} className="r-textlink" style={{ minHeight: 0 }}>בדף שלו/ה</A>.</>); return; }
    try { await inviteByEmail(ctx.actor, e, role); toast({ text: `${e} יקבל/תקבל תפקיד ${ROLE_LABELS[role]} בכניסה הראשונה` }, 4000); setEmail(''); setErr(''); }
    catch (x) { setErr((x as Error).message || 'לא נשמר'); }
  };
  const remove = (i: { email: string; role: InviteRole }) => { removeRoleInvite(i.email).then(() => toast({ text: `הוסר: ${i.email}`, actions: [{ label: 'ביטול', onClick: () => { inviteByEmail(ctx.actor, i.email, i.role).catch(() => {}); } }] }, 6000)).catch(() => toast({ text: 'לא נשמר', kind: 'error' })); };
  const roles: InviteRole[] = ctx.owner ? ['staff', 'manager', 'owner'] : ['staff'];
  return (
    <>
      <Head backTo="/manage/people" backLabel="אנשים" title="תפקיד לפי מייל" />
      <p className="rm-lead">למי שעוד לא נכנס לאפליקציה. כותבים את כתובת ה־Google שלו/ה, ובכניסה הראשונה התפקיד כבר מחכה. למי שכבר רשום משנים תפקיד בדף שלו/ה ב״אנשים״.</p>
      <Form onSubmit={save}>
        <Field label="כתובת Google">{(id) => <input id={id} className="r-input" dir="ltr" type="email" inputMode="email" autoComplete="off" placeholder="name@gmail.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />}</Field>
        <fieldset className="r-field"><legend>איזה תפקיד?</legend>
          <div className="rm-rolepick">{roles.map((r) => <label key={r}><input type="radio" name="invite-role" checked={role === r} onChange={() => setRole(r)} /><b>{ROLE_LABELS[r]}</b><span>{ROLE_HELP[r]}</span></label>)}</div>
        </fieldset>
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={!email.trim()}>שמירה</Btn>
      </Form>
      <Sect title="קיבלו תפקיד ועוד לא נכנסו" n={waiting.length} />
      {waiting.length === 0 && <p className="rm-lead">אין כתובות ממתינות.</p>}
      {waiting.map((i) => <div key={i.id} className="rm-q handled"><div><span className="r-t" style={{ color: 'var(--r-ink)', fontWeight: 600 }}><span className="rm-ltr">{i.email}</span></span><span className="r-m">{ROLE_LABELS[i.role]} · הוגדר {relTime(i.createdAt)} · {firstName(i.createdBy.name)}</span></div><Btn small kind="quiet" onClick={() => remove(i)}>הסרה</Btn></div>)}
    </>
  );
}

// ---------- recurring tasks ----------
const daysText = (t: { days: number[] }) => t.days.length === 0 || t.days.length === 7 ? 'כל יום' : t.days.length === 6 && !t.days.includes(6) ? 'א׳ עד ו׳' : t.days.length === 5 && !t.days.includes(5) && !t.days.includes(6) ? 'א׳ עד ה׳' : [...t.days].sort().map((d) => DAY_LABELS[d]).join(' · ');
/** The days in the last 30 on which this chore was due, counting only days since it was created. */
function dueDays(t: { days: number[]; createdAt?: string }) {
  const today = todayISO(); const since = t.createdAt ? t.createdAt.slice(0, 10) : '';
  return Array.from({ length: 30 }, (_, i) => addDays(today, -29 + i)).filter((k) => k >= since && (t.days.length === 0 || t.days.includes(new Date(k + 'T12:00:00').getDay())));
}
export function TemplatesScreen({ ctx, selectedId }: { ctx: TeamCtx; selectedId?: string }) {
  const desktop = useDesktop(); const tpls = ctx.templates;
  const from = useMemo(() => new Date(Date.now() - 31 * 86400_000).toISOString(), []); const to = useMemo(() => new Date(Date.now() + 86400_000).toISOString(), []);
  const done = useHistoryTasks(true, true, from, to); // one listener for all rows
  const stat = (t: Template) => { if (!t.active) return 'מושהית'; const due = new Set(dueDays(t)); const n = done.items.filter((x) => x.templateId === t.id && x.dateKey && due.has(x.dateKey)).length; return due.size ? `בוצעה ${n} מתוך ${due.size} ב־30 יום` : 'חדשה'; };
  const groups: [string, Template[]][] = [['כל יום', tpls.filter((t) => t.active && t.days.length === 0)], ['בימים מסוימים', tpls.filter((t) => t.active && t.days.length > 0)], ['מושהות', tpls.filter((t) => !t.active)]];
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="משימות חוזרות" />
      <p className="rm-lead">מופיעות אצל כולם ב״שגרת היום״ בכל יום שהוגדר להן. מי שעושה מסמן, והשם נרשם.</p>
      <div className="r-actions" style={{ paddingTop: 12 }}><Btn small to="/manage/templates/new">משימה חוזרת חדשה</Btn></div>
      {tpls.length === 0 ? <Empty title="אין משימות חוזרות">האכלה, השקיה, פתיחת שער: מה שחוזר כל יום.</Empty>
        : desktop ? (
          <table className="r-table">
            <thead><tr><th>משימה</th><th>ימים</th><th>עד שעה</th><th>מי רואה</th><th>30 יום אחרונים</th></tr></thead>
            <tbody>{tpls.map((t) => <tr key={t.id} className={(t.id === selectedId ? 'sel ' : '') + (t.active ? '' : 'dim')} {...rowKeys(() => navigate(`/manage/templates/${t.id}`, false, true))}><td><span className="r-t">{t.title}</span></td><td>{daysText(t)}</td><td>{t.time}</td><td>{t.managersOnly ? 'מנהלים' : 'כולם'}</td><td>{stat(t)}</td></tr>)}</tbody>
          </table>
        ) : groups.filter(([, g]) => g.length).map(([label, g]) => <div key={label}><Sect title={label} n={g.length} />{g.map((t) => <Line key={t.id} to={`/manage/templates/${t.id}`} title={t.title} meta={[label === 'בימים מסוימים' ? daysText(t) : '', t.time ? `עד ${t.time}` : '', t.managersOnly ? 'מנהלים בלבד' : '', stat(t)].filter(Boolean).join(' · ')} />)}</div>)}
    </>
  );
}
export function TemplateEditor({ id, ctx }: { id?: string; ctx: TeamCtx; panel?: boolean }) {
  const existing = id ? ctx.templates.find((t) => t.id === id) : undefined;
  const toast = useToast(); const today = todayISO();
  const [f, setF] = useState<NewTemplate>(() => existing ? { title: existing.title, note: existing.note, days: existing.days, time: existing.time, active: existing.active, managersOnly: existing.managersOnly } : { title: '', note: '', days: [], time: '', active: true, managersOnly: false });
  const [err, setErr] = useState('');
  const from = useMemo(() => addDays(todayISO(), -31) + 'T00:00:00.000Z', []);
  const tasks = useTemplateTasks(id || '', from, !!id);
  const set = (p: Partial<NewTemplate>) => { setF((s) => ({ ...s, ...p })); setErr(''); };
  if (id && !existing) return <><Head backTo="/manage/templates" backLabel="משימות חוזרות" title={ctx.templates.length ? 'המשימה החוזרת לא נמצאה' : ''} />{ctx.templates.length ? <Empty title="ייתכן שנמחקה" /> : <Loading />}</>;
  const todays = tasks.items.find((x) => x.dateKey === today && !x.done);
  const save = async () => {
    if (!f.title.trim()) { setErr('צריך לכתוב מה לעשות'); return; }
    const days = f.days.length === 7 ? [] : f.days;
    try {
      await saveTemplate(ctx.actor, { ...f, days }, existing);
      // today's chore was already created from the old text: bring it along, unless someone has done it
      if (existing && todays && (todays.title !== f.title.trim() || todays.note !== f.note || todays.managersOnly !== f.managersOnly)) await editTask(ctx.actor, todays, { title: f.title.trim(), note: f.note, managersOnly: f.managersOnly });
      toast({ text: existing ? 'נשמר' : `נוספה: ${f.title.trim()}` }, 2500); back('/manage/templates');
    } catch (e) { setErr((e as Error).message || 'לא נשמר'); }
  };
  const remove = () => {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => { deleteTemplate(existing.id).catch(() => {}); if (todays) deleteTask(ctx.actor, todays).catch(() => {}); });
    toast({ text: `נמחקה: ${existing.title}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    back('/manage/templates');
  };
  const due = existing ? new Set(dueDays(existing)) : new Set<string>();
  const grid = Array.from({ length: 30 }, (_, i) => { const k = addDays(today, -29 + i); const t = tasks.items.find((x) => x.dateKey === k); return { k, due: due.has(k), done: !!t?.done, by: t?.doneBy?.name }; });
  const doneCount = grid.filter((g) => g.due && g.done).length;
  const who = (() => { const m = new Map<string, number>(); for (const x of tasks.items) if (x.done && x.doneBy) m.set(firstName(x.doneBy.name), (m.get(firstName(x.doneBy.name)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); })();
  const toggleDay = (d: number) => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] });
  return (
    <>
      <Head backTo="/manage/templates" backLabel="משימות חוזרות" title={existing ? existing.title : 'משימה חוזרת חדשה'} />
      <Form onSubmit={save}>
        <Field label="מה צריך לעשות?">{(i) => <input id={i} className="r-input big" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} autoComplete="off" />}</Field>
        <fieldset className="r-field"><legend>באילו ימים?</legend>
          <div className="rm-daypick">{DAY_LABELS.map((l, d) => <label key={d}><input type="checkbox" checked={f.days.length === 0 || f.days.includes(d)} onChange={() => (f.days.length === 0 ? set({ days: [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== d) }) : toggleDay(d))} aria-label={`יום ${l}`} />{l}</label>)}</div>
          <span className="r-help">{f.days.length === 0 || f.days.length === 7 ? 'כל יום, כולל שבת.' : daysText(f) + '.'}</span>
        </fieldset>
        <Field label="עד איזו שעה?" help="לא חובה">{(i) => <input id={i} type="time" className="r-input" dir="ltr" style={{ maxWidth: 180 }} value={f.time} onChange={(e) => set({ time: e.target.value })} />}</Field>
        <Field label="הסבר קצר" help="לא חובה">{(i) => <textarea id={i} className="r-input" value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={4000} placeholder="10 דקות לכל עציץ, לבדוק שהצינור לא סתום" />}</Field>
        <Tick on={f.active} onChange={(active) => set({ active })} help="מושהית לא נוצרת. אפשר להשהות בעונה שלא רלוונטית">פעילה</Tick>
        <Tick on={f.managersOnly} onChange={(managersOnly) => set({ managersOnly })} help="מתנדבים לא יראו אותה">למנהלים בלבד</Tick>
        {err && <p className="r-err" role="alert">{err}</p>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Btn type="submit" style={{ flex: 1 }}>{existing ? 'שמירה' : 'הוספה'}</Btn>{existing && <Btn kind="danger" onClick={remove}>מחיקה</Btn>}</div>
        {existing && todays && <p className="r-help" style={{ fontSize: 15, color: 'var(--r-soft)' }}>המשימה של היום כבר נוצרה: שינוי בטקסט יעדכן גם אותה.</p>}
      </Form>
      {existing && <>
        <Sect title="30 הימים האחרונים" n={due.size ? `${doneCount} מתוך ${due.size}` : undefined} />
        <div className="rm-days30" role="img" aria-label={`בוצעה ${doneCount} מתוך ${due.size} ימים`}>{grid.map((g) => <i key={g.k} className={!g.due ? '' : g.done ? 'ok' : 'miss'} title={`${fmtDate(g.k)}${g.by ? ' · ' + g.by : ''}`} />)}</div>
        <p className="rm-lead" style={{ paddingTop: 8 }}>ירוק: בוצעה. אדום: יום שלא סומן. אפור: לא היה צריך.{who.length ? ` מי ביצע: ${who.map(([n, c]) => `${n} ${c}`).join(', ')}.` : ''}</p>
      </>}
    </>
  );
}

// ---------- places ----------
export function PlacesScreen({ ctx, open, selectedId }: { ctx: TeamCtx; open: Task[]; selectedId?: string }) {
  const desktop = useDesktop(); const toast = useToast();
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const usage = (p: Place) => open.filter((t) => t.location?.placeId === p.id).length;
  const save = async () => {
    const n = name.trim();
    if (!n) { setErr('צריך שם למקום'); return; }
    setBusy(true); setErr('');
    try { const pos = await getPosition(); await addPlace(ctx.actor, n, pos.lat, pos.lng); setName(''); toast({ text: `נשמר: ${n}, בדיוק של כ־${pos.accuracy} מטר` }, 3500); }
    catch (e) { setErr((e as Error).message || 'לא נשמר'); } finally { setBusy(false); }
  };
  const meta = (p: Place) => (usage(p) ? `${usage(p)} משימות פתוחות כאן` : `נשמר ${fullDate(p.createdAt)} · ${firstName(p.createdBy.name)}`);
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="מקומות בחווה" over={`${ctx.places.length} נקודות שמורות`} />
      <p className="rm-lead">נקודות עם שם, שבוחרים במשימה במקום לתאר איפה. מוסיפים מהטלפון, כשעומדים במקום עצמו.</p>
      <Form onSubmit={save}>
        <Field label="מקום חדש: איך קוראים לו?" help={busy ? 'מאתר את המקום שלך…' : 'המיקום נלקח מהמכשיר ברגע השמירה'}>{(id) => <input id={id} className="r-input" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={120} placeholder="העץ מאחורי הביתן" autoComplete="off" />}</Field>
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy || !name.trim()}>{busy ? 'מאתר…' : 'לשמור את המקום שבו אני עומד/ת'}</Btn>
      </Form>
      <Sect title="מקומות שמורים" n={ctx.places.length}>{desktop && ctx.places.length > 0 && <button type="button" className="r-more" onClick={() => exportCsv('מקומות.csv', ['שם', 'קו רוחב', 'קו אורך', 'נשמר', 'על ידי'], ctx.places.map((p) => [p.name, p.lat, p.lng, fullDate(p.createdAt), p.createdBy.name]))}>ייצוא</button>}</Sect>
      {ctx.places.length === 0 ? <Empty title="אין מקומות שמורים" />
        : desktop ? (
          <table className="r-table"><thead><tr><th>שם</th><th>משימות פתוחות</th><th>נשמר</th><th>על ידי</th><th /></tr></thead>
            <tbody>{ctx.places.map((p) => <tr key={p.id} className={p.id === selectedId ? 'sel' : ''} {...rowKeys(() => navigate(`/manage/places/${p.id}`, false, true))}><td><span className="r-t">{p.name}</span></td><td>{usage(p) || ''}</td><td>{fullDate(p.createdAt)}</td><td>{firstName(p.createdBy.name)}</td><td className="r-end"><a className="r-btn ghost sm" href={mapsLink({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>במפה</a></td></tr>)}</tbody></table>
        ) : ctx.places.map((p) => <Line key={p.id} to={`/manage/places/${p.id}`} title={p.name} meta={meta(p)} />)}
    </>
  );
}
export function PlaceEditor({ id, ctx }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: p, loading } = usePlace(id); const tasks = useTasksAtPlace(id); const toast = useToast();
  const [name, setName] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [askMove, setAskMove] = useState(false); const [err, setErr] = useState('');
  if (loading) return <><Head backTo="/manage/places" backLabel="מקומות" title="" /><Loading /></>;
  if (!p) return <><Head backTo="/manage/places" backLabel="מקומות" title="המקום לא נמצא" /><Empty title="ייתכן שנמחק" /></>;
  const n = name ?? p.name;
  const rename = async () => { if (!n.trim()) { setErr('צריך שם'); return; } try { await updatePlace(p.id, { name: n.trim() }); setName(null); toast({ text: 'השם עודכן' }, 2000); } catch (e) { setErr((e as Error).message || 'לא נשמר'); } };
  const relocate = async () => {
    setBusy(true); setAskMove(false);
    try { const pos = await getPosition(); const before = { lat: p.lat, lng: p.lng }; await updatePlace(p.id, { lat: pos.lat, lng: pos.lng }); toast({ text: `המיקום עודכן, בדיוק של כ־${pos.accuracy} מטר`, actions: [{ label: 'ביטול', onClick: () => { updatePlace(p.id, before).catch(() => {}); } }] }, 7000); }
    catch (e) { toast({ text: (e as Error).message, kind: 'error' }); } finally { setBusy(false); }
  };
  const remove = () => {
    const undo = deferDelete(p.id, () => { deletePlace(p.id).catch(() => {}); });
    toast({ text: `נמחק: ${p.name}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    back('/manage/places');
  };
  void ctx;
  return (
    <>
      <Head backTo="/manage/places" backLabel="מקומות" title={p.name} over={`נשמר ${fullDate(p.createdAt)} · ${firstName(p.createdBy.name)}`} />
      <Form onSubmit={rename}>
        <Field label="שם המקום">{(i) => <input id={i} className="r-input big" value={n} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={120} />}</Field>
        {err && <p className="r-err" role="alert">{err}</p>}
        {n.trim() !== p.name && <Btn type="submit">שמירת השם</Btn>}
      </Form>
      <dl className="r-facts"><div><dt>נקודה</dt><dd style={{ fontSize: 16 }}><span className="rm-ltr">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span></dd><a className="r-btn ghost sm" href={mapsLink({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener">במפה</a></div></dl>
      {!askMove ? <div className="r-actions"><Btn small kind="ghost" disabled={busy} onClick={() => setAskMove(true)}>{busy ? 'מאתר…' : 'לעדכן למקום שבו אני עומד/ת'}</Btn></div>
        : <div className="rm-confirm" role="alertdialog" aria-label="אישור עדכון מיקום"><div><b>להחליף את הנקודה של ״{p.name}״ במיקום הנוכחי של המכשיר?</b><br />עושים את זה רק כשעומדים במקום עצמו.</div><div className="rm-do"><Btn small onClick={relocate}>כן, לעדכן</Btn><Btn small kind="quiet" onClick={() => setAskMove(false)}>ביטול</Btn></div></div>}
      <Sect title="משימות במקום הזה" n={tasks.items.length || undefined} />
      {tasks.items.length === 0 ? <p className="rm-lead">עוד לא נבחר במשימה.</p> : tasks.items.slice(0, 10).map((t) => <Line key={t.id} to={`/tasks/${t.id}`} title={t.title} meta={t.done ? `בוצע · ${firstName(t.doneBy?.name || '')} · ${fmtDate(t.doneAt)}` : `פתוחה · ${firstName(t.createdBy.name)} · ${fmtDate(t.createdAt)}`} />)}
      <div className="r-actions" style={{ paddingTop: 26 }}><Btn kind="danger" onClick={remove}>מחיקת המקום</Btn></div>
      <p className="rm-lead">המקום יירד מרשימת הבחירה. משימות שכבר נוצרו איתו שומרות את השם והנקודה.</p>
    </>
  );
}
