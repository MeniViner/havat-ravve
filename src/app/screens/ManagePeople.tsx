// Manager: people (CRM), role by Google account, recurring templates, saved places.
import { useMemo, useState } from 'react';
import type { Profile, Role, Template, Place, Task } from '../types';
import { ROLE_LABELS, PAYMENT_LABELS, TAB_LABELS, DAY_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Days, Avatar, Loading, useToast, fmtDate, fmtMonthYear, firstName, relTime, whenText, todayISO, addDays, money, useDesktop, useSort, Th } from '../ui';
import { navigate } from '../router';
import { usePerson, setUserRole, setUserNotes, useRoleInvites, inviteByEmail, removeRoleInvite, saveTemplate, deleteTemplate, useTemplateTasks, usePlace, addPlace, updatePlace, deletePlace, useTasksAtPlace, getPosition, type NewTemplate } from '../store';
import { useMyTickets, useMyVisits, useMyDonations, useMyTabs, downloadCsv, waLink, telLink, useOpenTickets, useOpenTabs } from '../data';
import { useActivityForUser, ACTION_LABELS } from '../activity';
import { mapsLink } from './Tasks';

// ---------- people ----------
type PFilter = 'all' | 'team' | 'guests' | 'debt' | 'blocked';
export function PeopleScreen({ ctx, people, selectedId }: { ctx: TeamCtx; people: Profile[]; selectedId?: string }) {
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<PFilter>('all');
  const desktop = useDesktop(); const invites = useRoleInvites(true);
  const { sort, toggle, apply } = useSort<Profile>('displayName');
  const debts = useDebts();
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return people.filter((p) => filter === 'team' ? p.role !== 'guest' : filter === 'guests' ? p.role === 'guest' : filter === 'debt' ? debts.has(p.uid) : filter === 'blocked' ? p.status === 'blocked' : true).filter((p) => !s || p.displayName.toLowerCase().includes(s) || p.email.includes(s) || p.phone.includes(s) || String(p.customerNumber) === s || Object.values(p.fields || {}).some((v) => v.toLowerCase().includes(s))); }, [people, q, filter, debts]);
  const sorted = desktop ? apply(list, (p, k) => k === 'n' ? p.customerNumber : k === 'created' ? p.createdAt : k === 'role' ? p.role : k === 'debt' ? debts.get(p.uid) || 0 : p.displayName) : [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
  const letters = useMemo(() => { const m = new Map<string, Profile[]>(); for (const p of sorted) { const l = p.displayName.trim()[0] || '?'; m.set(l, [...(m.get(l) || []), p]); } return [...m.entries()]; }, [sorted]);
  const csv = () => downloadCsv('אנשים.csv', ['#', 'שם', 'טלפון', 'מייל', 'תפקיד', 'מצב', 'נרשם', ...ctx.settings.registrationFields.map((f) => f.label)], people.map((p) => [p.customerNumber, p.displayName, p.phone, p.email, ROLE_LABELS[p.role], p.status, fmtDate(p.createdAt), ...ctx.settings.registrationFields.map((f) => p.fields?.[f.id] || '')]));
  const chips = <Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'all', label: 'הכל', n: people.length }, { value: 'team', label: 'צוות', n: people.filter((p) => p.role !== 'guest').length }, { value: 'guests', label: 'אורחים', n: people.filter((p) => p.role === 'guest').length }, { value: 'debt', label: 'עם חוב', n: debts.size || undefined }, { value: 'blocked', label: 'חסומים', n: people.filter((p) => p.status === 'blocked').length || undefined }]} />;
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title={<>אנשים <span className="muted" style={{ fontWeight: 500 }}>· {people.length}</span></>} sub={desktop ? 'כל מי שנרשם: צוות ואורחים. מיון לפי עמודה, חיפוש לפי כל שדה.' : 'כל מי שנרשם, לפי א׳–ב׳. מספר הלקוח רק למנהלים.'} end={<><Btn kind="ghost" size="sm" icon="download" onClick={csv}>אקסל</Btn><Btn size="sm" icon="user" to="/manage/people/invite">תפקיד לפי מייל</Btn></>} />
      <div className="inline pad" style={{ paddingTop: 10 }}><Input placeholder="חיפוש: שם, טלפון, מייל, מספר" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 44, flex: 1, minWidth: 200 }} />{desktop && chips}</div>
      {!desktop && <div style={{ paddingTop: 10 }}>{chips}</div>}
      {invites.items.length > 0 && !q && filter === 'all' && <A to="/manage/people/invite" className="strip"><Icon name="user" size={18} />{invites.items.length} כתובות הוגדרו ועוד לא נכנסו<span style={{ marginInlineStart: 'auto' }}>פתיחה</span></A>}
      {!sorted.length && <Empty title="לא נמצא" />}
      {desktop ? <div className="tablewrap"><table><thead><tr><Th k="n" sort={sort} onSort={toggle}>#</Th><Th k="displayName" sort={sort} onSort={toggle}>שם</Th><th>טלפון</th><th className="opt">מייל</th><Th k="role" sort={sort} onSort={toggle}>תפקיד</Th><Th k="created" sort={sort} onSort={toggle}>נרשם</Th>{ctx.settings.registrationFields.slice(0, 2).map((f) => <th key={f.id} className="opt">{f.label}</th>)}<Th k="debt" sort={sort} onSort={toggle}>חוב</Th></tr></thead>
        <tbody>{sorted.slice(0, 200).map((p) => <tr key={p.uid} className={'link ' + (p.uid === selectedId ? 'sel' : '')} onClick={() => navigate(`/manage/people/${p.uid}`)}><td className="muted">{p.customerNumber}</td><td style={{ fontWeight: 600 }}>{p.displayName}{p.status === 'blocked' && <> <Pill tone="rust">חסום</Pill></>}</td><td className="ltr">{p.phone}</td><td className="ltr muted opt">{p.email}</td><td>{ROLE_LABELS[p.role]}</td><td className="muted">{fmtMonthYear(p.createdAt)}</td>{ctx.settings.registrationFields.slice(0, 2).map((f) => <td key={f.id} className="muted opt">{p.fields?.[f.id] || '—'}</td>)}<td>{debts.get(p.uid) ? <Pill tone="ochre">{money(debts.get(p.uid)!)}</Pill> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{sorted.length > 200 && <p className="lead" style={{ padding: 12 }}>מוצגים 200 ראשונים. צמצמו עם חיפוש.</p>}</div>
        : letters.map(([l, ps]) => <div key={l}><Sec title={l} /><div className="list">{ps.map((p) => <Row key={p.uid} to={`/manage/people/${p.uid}`} center start={<Avatar name={p.displayName} light={p.role === 'guest'} />} title={p.displayName} meta={<>{p.status === 'blocked' ? <Pill tone="rust">חסום</Pill> : <Pill tone={p.role === 'guest' ? undefined : 'gold'}>{ROLE_LABELS[p.role]}</Pill>}<span className="ltr">{p.phone}</span>{debts.get(p.uid) && <Pill tone="ochre">חוב {money(debts.get(p.uid)!)}</Pill>}<span>#{p.customerNumber}</span></>} chev />)}</div></div>)}
    </>
  );
}
/** Open money per person: unpaid tickets and open stall tabs. */
function useDebts() {
  const tickets = useOpenTicketsSafe(); const tabs = useOpenTabsSafe();
  return useMemo(() => { const m = new Map<string, number>(); for (const t of tickets) if (t.status === 'valid') m.set(t.ownerUid, (m.get(t.ownerUid) || 0) + t.price); for (const t of tabs) if (t.guestUid) m.set(t.guestUid, (m.get(t.guestUid) || 0) + t.total); return m; }, [tickets, tabs]);
}
const useOpenTicketsSafe = () => useOpenTickets(true).items;
const useOpenTabsSafe = () => useOpenTabs(true).items;

export function PersonScreen({ uid, ctx, panel }: { uid: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: p, loading } = usePerson(uid);
  const tickets = useMyTickets(uid, true); const visits = useMyVisits(uid, true); const donations = useMyDonations(uid, true); const tabs = useMyTabs(uid, true);
  const log = useActivityForUser(uid, true);
  const toast = useToast();
  const [notes, setNotes] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (!p) return <><Top backTo="/manage/people" title="לא נמצא" /><Empty title="האדם לא נמצא" /></>;
  const self = p.uid === ctx.actor.uid;
  const canRole = ctx.owner || (ctx.manager && p.role !== 'owner' && p.role !== 'manager');
  const roles: Role[] = ctx.owner ? ['guest', 'staff', 'manager', 'owner'] : ['guest', 'staff'];
  const setRole = (role: Role) => setUserRole(ctx.actor, p, role, p.status).then(() => toast({ text: `${p.displayName}: ${ROLE_LABELS[role]}` }, 2500)).catch(() => toast({ text: 'אין הרשאה', kind: 'error' }));
  const block = () => setUserRole(ctx.actor, p, p.role, p.status === 'blocked' ? 'active' : 'blocked').then(() => toast({ text: p.status === 'blocked' ? 'שוחרר/ה' : 'נחסם/ה' }, 2500)).catch(() => toast({ text: 'אין הרשאה', kind: 'error' }));
  const orders = [...new Map(tickets.items.map((t) => [t.orderId, tickets.items.filter((x) => x.orderId === t.orderId)])).values()];
  const female = /ה$|ת$/.test(firstName(p.displayName));
  return (
    <>
      <Top backTo={panel ? undefined : '/manage/people'} back={panel} backLabel={panel ? 'סגירה' : 'אנשים'} title={p.displayName} sub={`${p.role === 'guest' ? (female ? 'לקוחה' : 'לקוח') : ROLE_LABELS[p.role]} מספר ${p.customerNumber} · ${female ? 'נרשמה' : 'נרשם'} ב${fmtMonthYear(p.createdAt)}`} end={<Avatar name={p.displayName} size="lg" />} />
      <div className="inline pad">{p.phone && <><a className="btn ghost sm" href={waLink(p.phone)} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />וואטסאפ</a><a className="btn ghost sm" href={telLink(p.phone)}><Icon name="phone" size={18} />התקשרות</a></>}</div>
      <dl className="kv" style={{ marginTop: 10 }}><dt>טלפון</dt><dd className="ltr">{p.phone || '—'}</dd><dt>מייל</dt><dd className="ltr">{p.email}</dd>{ctx.settings.registrationFields.map((f) => <span key={f.id} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{p.fields?.[f.id] || <span className="muted">—</span>}</dd></span>)}</dl>
      <Sec title="תפקיד ומצב" />
      <div className="inline pad">{roles.map((r) => <Chip key={r} on={p.role === r} onClick={() => canRole && !self && p.role !== r && setRole(r)}>{ROLE_LABELS[r]}</Chip>)}</div>
      {!self && (ctx.owner || p.role === 'guest') && <div style={{ marginTop: 8 }}><SwitchRow on={p.status === 'blocked'} onChange={block} title="חסימה" meta="לא תוכל להזמין כרטיסים. בהחלטה ידנית בלבד." /></div>}
      <Sec title="כרטיסים, ביקורים, תרומות, חשבונות" />
      <div className="list">
        {orders.map((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); return <Row key={t.orderId} center to={`/manage/events/${t.eventId}/guests`} title={`${t.eventTitle} · ${valid.length || o.length} כרטיסים`} meta={<>{!valid.length ? <Pill tone="rust">בוטל</Pill> : <Pill tone={t.paymentStatus === 'paid' || t.paymentStatus === 'paid_onsite' || t.paymentStatus === 'free' ? 'ok' : 'ochre'}>{PAYMENT_LABELS[t.paymentStatus]}{t.paymentStatus === 'pending' ? ` · ${money(t.price * valid.length)}` : ''}</Pill>}<span>{valid.some((x) => x.entries > 0) ? (female ? 'הגיעה' : 'הגיע') : `הוזמן ${relTime(t.createdAt)}`}</span></>} chev />; })}
        {tabs.items.map((t) => <Row key={t.id} center to={`/manage/events/${t.eventId}/tabs/${t.id}`} title={`דוכן · ${t.eventTitle} · ${money(t.total)}`} meta={<Pill tone={t.status === 'paid' ? 'ok' : t.status === 'waived' ? undefined : 'ochre'}>{t.status === 'claimed' ? 'סימן/ה "העברתי"' : TAB_LABELS[t.status]}</Pill>} chev />)}
        {visits.items.map((v) => <Row key={v.id} center to={`/manage/visits/${v.id}`} title={`ביקור · ${fmtDate(v.date)} · ${v.people} אנשים`} meta={<Pill tone={v.status === 'approved' ? 'ok' : v.status === 'new' ? 'ochre' : undefined}>{v.status === 'new' ? 'חדש' : v.status === 'approved' ? 'אושר' : v.status === 'rejected' ? 'לא מתאים' : 'בוטל'}</Pill>} chev />)}
        {donations.items.map((d) => <Row key={d.id} center to={`/manage/donations/${d.id}`} title={`תרומה · ${money(d.amount)} · ${d.label}`} meta={<><Pill tone={d.paymentStatus === 'paid' ? 'ok' : 'ochre'}>{PAYMENT_LABELS[d.paymentStatus]}</Pill><span>{fmtDate(d.createdAt)}</span></>} chev />)}
        {!orders.length && !tabs.items.length && !visits.items.length && !donations.items.length && <p className="lead">עוד אין פעילות.</p>}
      </div>
      <Sec title="הערות מנהלים" n="רק מנהלים רואים" />
      <Field><Textarea rows={2} value={notes ?? p.notes ?? ''} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== null && notes !== (p.notes || '')) setUserNotes(p, notes).then(() => toast({ text: 'נשמר' }, 1500)); }} placeholder="מה כדאי לזכור על האדם הזה" /></Field>
      <Sec title="היסטוריה" n={log.items.length || undefined} />
      <div className="list">{log.items.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action}: {a.text}</span>} meta={<span>{whenText(a.at)}{a.by.uid !== p.uid ? ` · ${firstName(a.by.name)}` : ''}</span>} />)}{(p.log || []).slice().reverse().map((l, i) => <Row key={i} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{l.text}</span>} meta={<span>{whenText(l.at)} · {firstName(l.by.name)}</span>} />)}<Row center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{female ? 'נרשמה' : 'נרשם'}</span>} meta={<span>{fmtDate(p.createdAt)}</span>} /></div>
    </>
  );
}

export function InviteRoleScreen({ ctx }: { ctx: TeamCtx }) {
  const invites = useRoleInvites(true); const toast = useToast();
  const [email, setEmail] = useState(''); const [role, setRole] = useState<'guest' | 'staff' | 'manager' | 'owner'>('staff');
  const save = () => inviteByEmail(ctx.actor, email, role).then(() => { toast({ text: role === 'guest' ? 'הוסר. יהיה אורח כשייכנס.' : `${email.trim()} יקבל/תקבל תפקיד ${ROLE_LABELS[role]} בכניסה הראשונה` }, 3500); setEmail(''); }).catch((e) => toast({ text: e.message, kind: 'error' }));
  const roles: { v: typeof role; t: string; s: string }[] = [{ v: 'guest', t: 'אורח/ת', s: 'ברירת המחדל לכל מי שנכנס: כרטיסים, ביקורים, תרומות. בוחרים כאן כדי להחזיר מישהו מהצוות לאורח' }, { v: 'staff', t: 'מתנדב/ת', s: 'משימות, קניות, כניסה לאירוע, דוכן' }, { v: 'manager', t: 'מנהל/ת', s: 'כל הניהול, אישור צוות, משימות מנהלים' }, { v: 'owner', t: 'בעלים', s: 'גם מינוי מנהלים ובעלים, חסימות, תשלומים' }];
  return (
    <>
      <Top backTo="/manage/people" backLabel="אנשים" title="תפקיד לפי חשבון Google" />
      <p className="lead">כותבים את כתובת ה־Google של האדם ובוחרים תפקיד. כשייכנס בפעם הראשונה הוא יקבל את התפקיד מיד. בלי קודים, בלי תור אישורים.</p>
      <Field label="כתובת Google"><Input dir="ltr" inputMode="email" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="תפקיד"><div className="list">{roles.filter((r) => ctx.owner || r.v === 'guest' || r.v === 'staff').map((r) => <button key={r.v} type="button" className="row center" onClick={() => setRole(r.v)} style={{ background: role === r.v ? 'var(--ok-bg)' : undefined, borderRadius: 10 }}><span className={'chk sm ' + (role === r.v ? 'on' : '')} style={{ borderRadius: 15 }}><Icon name="check" size={16} /></span><div className="main"><div className="title">{r.t}</div><div className="meta"><span>{r.s}</span></div></div></button>)}</div></Field>
      <div className="actions"><Btn size="big" disabled={!email.trim()} onClick={save}>שמירה</Btn></div>
      <Sec title="הוגדרו ועוד לא נכנסו" n={invites.items.length} />
      <div className="list">{invites.items.map((i) => <Row key={i.id} center title={<span className="ltr">{i.email}</span>} meta={<><Pill tone="gold">{ROLE_LABELS[i.role]}</Pill><span>הוגדר {relTime(i.createdAt)} · {firstName(i.createdBy.name)}</span></>} end={<Btn size="xs" kind="quiet" onClick={() => removeRoleInvite(i.email).then(() => toast({ text: 'הוסר' }, 2000))}>הסרה</Btn>} />)}{!invites.items.length && <p className="lead">אין כתובות ממתינות.</p>}</div>
    </>
  );
}

// ---------- recurring templates ----------
export function TemplatesScreen({ ctx, selectedId }: { ctx: TeamCtx; selectedId?: string }) {
  const desktop = useDesktop();
  const tpls = ctx.templates;
  const daily = tpls.filter((t) => t.active && t.days.length === 0), some = tpls.filter((t) => t.active && t.days.length > 0), paused = tpls.filter((t) => !t.active);
  const daysText = (t: Template) => t.days.length === 0 ? 'כל יום' : t.days.length === 6 && !t.days.includes(6) ? 'א׳–ו׳' : t.days.length === 5 && !t.days.includes(5) && !t.days.includes(6) ? 'ימי חול' : t.days.map((d) => DAY_LABELS[d]).join(' · ');
  const row = (t: Template) => <Row key={t.id} to={`/manage/templates/${t.id}`} className={t.id === selectedId ? 'sel' : ''} center start={<span className="iconbtn" style={{ color: t.active ? 'var(--green2)' : 'var(--muted)', width: 36 }}><Icon name="repeat" /></span>} title={t.title} meta={<><span>{daysText(t)}</span>{t.time && <span>עד {t.time}</span>}{t.managersOnly && <Pill>מנהלים בלבד</Pill>}{!t.active && <Pill>מושהית</Pill>}<Done30 t={t} /></>} chev />;
  return (
    <>
      <Top backTo={desktop ? '/tasks' : '/manage'} backLabel={desktop ? 'משימות' : 'ניהול'} title="משימות חוזרות" sub='נוצרות מחדש כל יום שהן פעילות ומופיעות אצל כולם ב"היום". מי שסימן נרשם.' end={<Btn size="sm" icon="plus" to="/manage/templates/new">משימה חוזרת</Btn>} />
      {desktop ? <div className="tablewrap"><table><thead><tr><th>פעילה</th><th>משימה</th><th>ימים</th><th className="opt">עד שעה</th><th className="opt">למי</th><th>30 יום</th><th></th></tr></thead><tbody>{tpls.map((t) => <tr key={t.id} className={'link ' + (t.id === selectedId ? 'sel' : '')} onClick={() => navigate(`/manage/templates/${t.id}`)}><td><Pill tone={t.active ? 'ok' : undefined}>{t.active ? 'פעילה' : 'מושהית'}</Pill></td><td className="wrap" style={{ fontWeight: 600 }}>{t.title}</td><td>{daysText(t)}</td><td className="opt">{t.time || <span className="muted">—</span>}</td><td className="opt">{t.managersOnly ? 'מנהלים' : 'כולם'}</td><td><Done30 t={t} /></td><td style={{ textAlign: 'end' }}><Btn size="xs" kind="ghost" to={`/manage/templates/${t.id}`}>עריכה</Btn></td></tr>)}</tbody></table></div>
        : <>
          <Sec title="כל יום" n={daily.length} /><div className="list">{daily.map(row)}{!daily.length && <p className="lead">אין.</p>}</div>
          <Sec title="ימים מסוימים" n={some.length} /><div className="list">{some.map(row)}{!some.length && <p className="lead">אין.</p>}</div>
          {paused.length > 0 && <><Sec title="מושהות" n={paused.length} /><div className="list">{paused.map(row)}</div></>}
        </>}
    </>
  );
}
/** How many of the last 30 days this template was due on. */
const expectedDays = (t: Template) => Array.from({ length: 30 }, (_, i) => new Date(addDays(todayISO(), -29 + i) + 'T12:00:00').getDay()).filter((d) => t.days.length === 0 ? d !== 6 : t.days.includes(d)).length;
function Done30({ t }: { t: Template }) {
  const from = addDays(todayISO(), -30) + 'T00:00:00.000Z';
  const tasks = useTemplateTasks(t.id, from);
  if (!t.active) return <span className="muted">מושהית</span>;
  const n = expectedDays(t); const done = tasks.items.filter((x) => x.done).length;
  return n ? <span>בוצעה {Math.min(done, n)} מ־{n}</span> : null;
}
export function TemplateEditor({ id, ctx, panel }: { id?: string; ctx: TeamCtx; panel?: boolean }) {
  const existing = id ? ctx.templates.find((t) => t.id === id) : undefined;
  const toast = useToast();
  const [f, setF] = useState<NewTemplate>(() => existing ? { title: existing.title, note: existing.note, days: existing.days, time: existing.time, active: existing.active, managersOnly: existing.managersOnly } : { title: '', note: '', days: [], time: '', active: true, managersOnly: false });
  const [confirmDel, setConfirmDel] = useState(false);
  const from = addDays(todayISO(), -30) + 'T00:00:00.000Z';
  const tasks = useTemplateTasks(id || '', from, !!id);
  const set = (p: Partial<NewTemplate>) => setF((s) => ({ ...s, ...p }));
  const save = () => saveTemplate(ctx.actor, f, existing).then(() => navigate('/manage/templates', true)).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  if (id && !existing && !ctx.templates.length) return <Loading />;
  if (id && !existing) return <Empty title="המשימה החוזרת לא נמצאה" />;
  const grid = Array.from({ length: 30 }, (_, i) => { const k = addDays(todayISO(), -29 + i); const d = new Date(k + 'T12:00:00').getDay(); const t = tasks.items.find((x) => x.dateKey === k); return { k, sat: d === 6 || (f.days.length > 0 && !f.days.includes(d)), done: !!t?.done, by: t?.doneBy?.name }; });
  const who = useMemo(() => { const m = new Map<string, number>(); for (const x of tasks.items) if (x.done && x.doneBy) m.set(firstName(x.doneBy.name), (m.get(firstName(x.doneBy.name)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [tasks.items]);
  return (
    <>
      <Top backTo={panel ? undefined : '/manage/templates'} back={panel} backLabel={panel ? 'סגירה' : 'משימות חוזרות'} title={existing ? existing.title : 'משימה חוזרת'} end={<Btn kind="quiet" size="sm" onClick={() => navigate('/manage/templates', true)}>ביטול</Btn>} />
      <Field><Input big placeholder="מה צריך לעשות?" value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="הסבר קצר (לא חובה)"><Textarea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="10 דקות לכל עציץ, לבדוק שהצינור לא סתום." /></Field>
      <Field label="באילו ימים?"><Days value={f.days} onChange={(days) => set({ days })} /><div className="chips" style={{ marginTop: 10 }}><Chip on={f.days.length === 0} onClick={() => set({ days: [] })}>כל יום</Chip><Chip on={f.days.length === 5 && !f.days.includes(5) && !f.days.includes(6)} onClick={() => set({ days: [0, 1, 2, 3, 4] })}>ימי חול</Chip><Chip on={f.days.length === 6 && !f.days.includes(6)} onClick={() => set({ days: [0, 1, 2, 3, 4, 5] })}>א׳–ו׳</Chip></div><span className="hint">בלי ימים מסומנים = כל יום.</span></Field>
      <Field label="עד שעה (לא חובה)"><Input type="time" dir="ltr" style={{ maxWidth: 160 }} value={f.time} onChange={(e) => set({ time: e.target.value })} /></Field>
      <div style={{ marginTop: 14 }}>
        <SwitchRow on={f.active} onChange={(active) => set({ active })} title="פעילה" meta="אפשר להשהות בעונה שלא רלוונטית" />
        <SwitchRow on={f.managersOnly} onChange={(managersOnly) => set({ managersOnly })} title="למנהלים בלבד" meta="מתנדבים לא יראו" />
      </div>
      {existing && <>
        <Sec title="30 הימים האחרונים" n={`בוצעה ${tasks.items.filter((x) => x.done).length} מ־${expectedDays(existing)}`} />
        <div className="grid30">{grid.map((g) => <i key={g.k} className={g.sat ? 'sat' : g.done ? 'ok' : 'miss'} title={`${fmtDate(g.k)}${g.by ? ' · ' + g.by : ''}`} />)}</div>
        <p className="lead" style={{ fontSize: 13 }}>ירוק בוצע · בהיר לא בוצע · אפור לא רלוונטי.{who.length ? ` מבצעים: ${who.map(([n, c]) => `${n} ${c}`).join(', ')}.` : ''}</p>
      </>}
      <div className="actions sticky"><Btn size="big" disabled={!f.title.trim()} onClick={save}>שמירה</Btn>{existing && (confirmDel ? <Btn kind="rustfill" onClick={() => deleteTemplate(existing.id).then(() => navigate('/manage/templates', true))}>לאשר מחיקה</Btn> : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>מחיקה</Btn>)}</div>
    </>
  );
}

// ---------- places ----------
export function PlacesScreen({ ctx, open, selectedId }: { ctx: TeamCtx; open: Task[]; selectedId?: string }) {
  const desktop = useDesktop(); const toast = useToast();
  const [name, setName] = useState(''); const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null); const [busy, setBusy] = useState(false);
  const locate = async () => { setBusy(true); try { setPos(await getPosition()); } catch (e) { toast({ text: (e as Error).message, kind: 'error' }); } finally { setBusy(false); } };
  const usage = (p: Place) => open.filter((t) => t.location?.placeId === p.id).length;
  const tplUse = (p: Place) => ctx.templates.some((t) => t.note.includes(p.name) || t.title.includes(p.name));
  const save = async () => { if (!pos || !name.trim()) return; await addPlace(ctx.actor, name, pos.lat, pos.lng); setName(''); setPos(null); toast({ text: 'המקום נשמר' }, 2000); };
  const lats = ctx.places.map((p) => p.lat), lngs = ctx.places.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return (
    <>
      <Top backTo={desktop ? '/tasks' : '/manage'} backLabel={desktop ? 'משימות' : 'ניהול'} title={<>מקומות בחווה <span className="muted" style={{ fontWeight: 500 }}>· {ctx.places.length}</span></>} sub={desktop ? 'נקודות שמורות שנבחרות במשימות. מוסיפים מהטלפון, כשעומדים במקום. כאן עורכים שמות ורואים את המפה.' : 'עומדים במקום, נותנים שם, שומרים. המקום מופיע לבחירה בכל משימה.'} end={desktop ? <Btn kind="ghost" size="sm" icon="download" onClick={() => downloadCsv('מקומות.csv', ['שם', 'lat', 'lng', 'נשמר'], ctx.places.map((p) => [p.name, p.lat, p.lng, fmtDate(p.createdAt)]))}>ייצוא נקודות</Btn> : undefined} />
      {!desktop && <>
        <div className="paybox ok" style={{ marginTop: 12 }}><b style={{ fontSize: 20, fontFamily: 'var(--sans)', fontWeight: 600 }}>אני עומד עכשיו ב…</b>{pos ? <span className="ltr">דיוק {pos.accuracy} מ׳ · {pos.lat.toFixed(4)}°N {pos.lng.toFixed(4)}°E</span> : 'לוחצים "איתור" ואז נותנים שם.'}</div>
        <div className="inline pad"><Input placeholder="שם המקום" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />{pos ? <Btn disabled={!name.trim()} onClick={save}>שמירה כאן</Btn> : <Btn kind="ghost" icon="pin" disabled={busy} onClick={locate}>{busy ? 'מאתר…' : 'איתור'}</Btn>}</div>
      </>}
      <Sec title="מקומות שמורים" n={ctx.places.length} />
      {desktop ? <div className="cols"><div className="tablewrap" style={{ margin: '0 20px' }}><table><thead><tr><th>שם</th><th>משימות</th><th>נשמר</th><th></th></tr></thead><tbody>{ctx.places.map((p) => <tr key={p.id} className={'link ' + (p.id === selectedId ? 'sel' : '')} onClick={() => navigate(`/manage/places/${p.id}`)}><td style={{ fontWeight: 600 }}>{p.name}</td><td>{usage(p) || (tplUse(p) ? 'חוזרת' : <span className="muted">—</span>)}</td><td className="muted">{firstName(p.createdBy.name)} · {fmtMonthYear(p.createdAt)}</td><td style={{ textAlign: 'end' }}><Btn size="xs" kind="ghost" to={`/manage/places/${p.id}`}>עריכה</Btn></td></tr>)}</tbody></table></div>
        <div style={{ padding: '0 20px' }}><p className="lead" style={{ padding: '0 0 8px' }}>צילום האוויר האינטראקטיבי יגיע בשלב הבא. בינתיים: נקודות על רשת.</p><div style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--ok-bg)', borderRadius: 12, border: '1px solid var(--line)' }}>{ctx.places.map((p) => { const x = maxLng === minLng ? 50 : ((p.lng - minLng) / (maxLng - minLng)) * 80 + 10; const y = maxLat === minLat ? 50 : (1 - (p.lat - minLat) / (maxLat - minLat)) * 80 + 10; return <A key={p.id} to={`/manage/places/${p.id}`} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--green)' }}><span style={{ width: 10, height: 10, borderRadius: 5, background: p.id === selectedId ? 'var(--rust)' : 'var(--green)' }} />{p.name}</A>; })}</div></div></div>
        : <div className="list">{ctx.places.map((p) => <Row key={p.id} to={`/manage/places/${p.id}`} center start={<span className="iconbtn" style={{ color: 'var(--green2)', width: 36 }}><Icon name="pin" /></span>} title={p.name} meta={<span>{usage(p) ? `${usage(p)} משימות פתוחות` : tplUse(p) ? 'משימה חוזרת' : `נשמר ${fmtDate(p.createdAt)} · ${firstName(p.createdBy.name)}`}</span>} end={<a className="btn ghost xs" href={mapsLink({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}><Icon name="nav" size={14} />נווט</a>} />)}{!ctx.places.length && <Empty title="אין מקומות שמורים" text="עומדים במקום, לוחצים איתור, נותנים שם." />}</div>}
      {!desktop && <p className="note">לחיצה על מקום: שינוי שם, עדכון מיקום או הסתרה. מקום שמשימות משתמשות בו נשאר בהן גם אם מוסתר.</p>}
    </>
  );
}
export function PlaceEditor({ id, ctx, panel }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: p, loading } = usePlace(id); const tasks = useTasksAtPlace(id); const toast = useToast();
  const [name, setName] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  if (loading) return <Loading />;
  if (!p) return <Empty title="המקום לא נמצא" />;
  const n = name ?? p.name;
  const relocate = async () => { setBusy(true); try { const pos = await getPosition(); await updatePlace(p.id, { lat: pos.lat, lng: pos.lng }); toast({ text: `עודכן · דיוק ${pos.accuracy} מ׳` }, 2500); } catch (e) { toast({ text: (e as Error).message, kind: 'error' }); } finally { setBusy(false); } };
  return (
    <>
      <Top backTo={panel ? undefined : '/manage/places'} back={panel} backLabel={panel ? 'סגירה' : 'מקומות'} title={p.name} sub={`נשמר ${fmtDate(p.createdAt)} · ${firstName(p.createdBy.name)}`} />
      <Field label="שם המקום"><Input big value={n} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="note ink"><span className="ltr">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span><div className="inline" style={{ marginTop: 10 }}><a className="btn ghost sm" href={mapsLink({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener"><Icon name="nav" size={16} />פתיחה במפות</a><Btn kind="ghost" size="sm" icon="pin" disabled={busy} onClick={relocate}>{busy ? 'מאתר…' : 'לעדכן למיקום שלי עכשיו'}</Btn></div></div>
      <Sec title="משימות במקום הזה" n={tasks.items.length || undefined} />
      <div className="list">{tasks.items.slice(0, 10).map((t) => <Row key={t.id} to={`/tasks/${t.id}`} center done={t.done} title={t.title} meta={<span>{t.done ? `${firstName(t.doneBy?.name || '')} · ${fmtDate(t.doneAt)}` : `${firstName(t.createdBy.name)} · ${fmtDate(t.createdAt)}`}</span>} chev />)}{!tasks.items.length && <p className="lead">עוד לא נבחר במשימה.</p>}</div>
      <div className="actions sticky"><Btn size="big" disabled={!n.trim() || n === p.name} onClick={() => updatePlace(p.id, { name: n.trim() }).then(() => navigate('/manage/places', true))}>שמירה</Btn>{confirmDel ? <Btn kind="rustfill" onClick={() => deletePlace(p.id).then(() => navigate('/manage/places', true))}>לאשר הסתרה של "{p.name}"</Btn> : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>הסתרה</Btn>}</div>
    </>
  );
}

