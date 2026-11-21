// M8 people directory, M9 person file, N13 role by email.
import { useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, waUrl, telUrl } from '../../core';
import {
  Avatar, BottomBar, Button, Chip, ChipRow, DetailList, DetailRow, EmptyState, Field, FormHeader, ListCard, PageTitle, Row, SearchField,
  Segmented, Tag, TopBar,
} from '../../kit';
import { MONTHS, money, relDay, dayName, ddmm, keyOf } from '../../format';
import { nowMs } from '../../../clock';
import { contactPhoneOk } from '../../../data';
import { ROLE_LABELS } from '../../../types';
import type { Profile, Role, Ticket } from '../../../types';
import {
  usePeople, usePerson, useRoleInvites, useOpenTickets, useOpenTabs, useMyTickets, useMyVisits, useMyDonations, useMyTabs,
  debtsByPerson, letterGroups, personMatches, isTeam, isFemale, gw, roleWord, allowedRoles, canBlock, inviteRolesFor, emailOk,
  changeRole, toggleBlock, inviteRole, cancelInvite, useRun,
} from '../../data/manage';
import { lnk, ExcelButton, Loading, NotFound } from './shared';

// ---------- M8 ----------
type PFilter = 'all' | 'team' | 'guests' | 'debt';
export function PeopleScreen({ ctx, params }: ScreenProps) {
  const all = usePeople(true);
  const people = useMemo(() => all.items.filter((p) => p.role !== 'vendor'), [all.items]);
  const debts = debtsByPerson(useOpenTickets(true).items, useOpenTabs(true).items);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PFilter>((['team', 'guests', 'debt'] as string[]).includes(params.filter) ? (params.filter as PFilter) : 'all');
  const team = people.filter(isTeam);
  const withDebt = people.filter((p) => debts.has(p.uid));
  const list = people
    .filter((p) => (filter === 'team' ? isTeam(p) : filter === 'guests' ? p.role === 'guest' : filter === 'debt' ? debts.has(p.uid) : true))
    .filter((p) => personMatches(p, q));
  const groups = letterGroups(list);
  const fields = ctx.settings.registrationFields;
  const tag = (p: Profile) => {
    if (p.status === 'blocked') return <Tag tone="urgent">חסום</Tag>;
    const d = debts.get(p.uid);
    if (d) return <Tag tone="waiting">{money(d)}</Tag>;
    if (p.role === 'owner') return <Tag tone="warm">בעלים</Tag>;
    if (p.role === 'manager' || p.role === 'staff') return <Tag tone="warm">צוות</Tag>;
    return null;
  };
  if (all.loading && !all.items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={
        <ExcelButton filename="אנשים.csv" headers={['#', 'שם', 'טלפון', 'מייל', 'תפקיד', 'מצב', 'נרשם', 'חוב', ...fields.map((f) => f.label)]}
          rows={() => people.map((p) => [p.customerNumber, p.displayName, p.phone, p.email, ROLE_LABELS[p.role], p.status === 'blocked' ? 'חסום' : 'פעיל', keyOf(p.createdAt), debts.get(p.uid) || '', ...fields.map((f) => p.fields?.[f.id] || '')])} />
      } />
      <PageTitle>אנשים · <span className="k-num">{people.length}</span></PageTitle>
      <SearchField label="שם, טלפון, מייל או מספר" value={q} onChange={(e) => setQ(e.target.value)} />
      <ChipRow label="סינון">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'team'} onClick={() => setFilter('team')}>צוות · {team.length}</Chip>
        <Chip selected={filter === 'guests'} onClick={() => setFilter('guests')}>אורחים</Chip>
        <Chip selected={filter === 'debt'} onClick={() => setFilter('debt')}>{withDebt.length ? `עם חוב · ${withDebt.length}` : 'עם חוב'}</Chip>
      </ChipRow>
      {groups.length ? (
        <ListCard aria-label="אנשים">
          {groups.flatMap(([letter, ps]) => [
            <li key={'l' + letter} className="manage-letter" aria-hidden="true">{letter}</li>,
            ...ps.map((p) => (
              <Row key={p.uid} {...lnk(`/manage/people/${p.uid}`)} leading={<Avatar name={p.displayName} />} title={p.displayName} tags={tag(p)}
                meta={<span dir="ltr">{p.phone || p.email}</span>} trailing={<span className="manage-num">#{p.customerNumber}</span>} />
            )),
          ])}
        </ListCard>
      ) : <EmptyState variant="card" icon="search" title="לא נמצא" text={q ? `אין אף אחד עם "${q}"` : 'אין אנשים בסינון הזה'} />}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block {...lnk('/manage/people/invite')}>תפקיד לפי כתובת מייל</Button>
    </AppScreen>
  );
}

// ---------- M9 ----------
const monthYear = (iso: string) => { const k = keyOf(iso); return `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`; };
type HistoryRow = { key: string; at: string; title: string; tag?: ReactNode; meta: string; path: string };

export function PersonScreen({ ctx, params }: ScreenProps) {
  const uid = params.uid;
  const { item: p, loading } = usePerson(uid);
  const tickets = useMyTickets(uid, true).items, visits = useMyVisits(uid, true).items, donations = useMyDonations(uid, true).items, tabs = useMyTabs(uid, true).items;
  const run = useRun();
  const ext = useExternal();
  if (loading) return <Loading back={{ label: 'אנשים', path: '/manage/people' }} />;
  if (!p) return <NotFound back={{ label: 'אנשים', path: '/manage/people' }} title="האדם לא נמצא" />;
  const female = isFemale(p.displayName);
  const me = { owner: ctx.owner, uid: ctx.actor.uid };
  const allowed = allowedRoles(me, p);
  const blocked = p.status === 'blocked';
  const kind = p.role === 'guest' ? gw(p.displayName, 'לקוח', 'לקוחה') : roleWord(p.role, female);
  const setRole = (role: Role) => {
    if (role === p.role) return;
    const before = p.role;
    run(() => changeRole(ctx.actor, p, role), { text: `${p.displayName}: ${roleWord(role, female)}`, undo: () => changeRole(ctx.actor, { ...p, role }, before) });
  };
  const block = () => run(() => toggleBlock(ctx.actor, p), { text: blocked ? `${p.displayName} ${gw(p.displayName, 'שוחרר', 'שוחררה')}` : `${p.displayName} ${gw(p.displayName, 'נחסם', 'נחסמה')}`, undo: () => toggleBlock(ctx.actor, { ...p, status: blocked ? 'active' : 'blocked' }) });

  const orders = [...new Map(tickets.map((t) => [t.orderId, tickets.filter((x) => x.orderId === t.orderId)])).values()];
  const ticketTag = (o: Ticket[]) => {
    const valid = o.filter((t) => t.status === 'valid');
    if (!valid.length) return <Tag>בוטל</Tag>;
    const owe = valid.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').reduce((s, t) => s + t.price, 0);
    if (owe) return <Tag tone="waiting">{money(owe)}</Tag>;
    return valid[0].paymentStatus === 'free' ? null : <Tag tone="paid">שולם</Tag>;
  };
  const rows: HistoryRow[] = [
    ...orders.map((o) => { const t = o[0]; const n = o.filter((x) => x.status === 'valid').length || o.length; return { key: 'o' + t.orderId, at: t.createdAt, title: `${t.eventTitle} · ${n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`}`, tag: ticketTag(o), meta: `הוזמן ${relDay(t.createdAt)}`, path: `/manage/events/${t.eventId}?tab=guests` }; }),
    ...donations.map((d) => ({ key: 'd' + d.id, at: d.createdAt, title: `תרומה · ${money(d.amount)}`,
      tag: d.paymentStatus === 'claimed' ? <Tag tone="waiting">{gw(d.name, 'סימן שהעביר', 'סימנה שהעבירה')}</Tag> : d.paymentStatus === 'pending' ? <Tag tone="waiting">עוד לא שולמה</Tag> : d.paymentStatus === 'cancelled' ? <Tag>בוטלה</Tag> : <Tag tone="paid">שולם</Tag>,
      meta: d.memorial ? `לזכר ${d.memorial}` : relDay(d.createdAt), path: `/manage/donations/${d.id}` })),
    ...visits.map((v) => ({ key: 'v' + v.id, at: v.createdAt, title: `ביקור · ${v.people} אנשים`,
      tag: v.status === 'new' ? <Tag tone="waiting">חדש</Tag> : v.status === 'approved' ? <Tag tone="paid">אושר</Tag> : <Tag>{v.status === 'rejected' ? 'לא מתאים' : 'בוטל'}</Tag>,
      meta: `${dayName(v.date)} ${ddmm(v.date)} · ${v.type}`, path: `/manage/visits/${v.id}` })),
    ...tabs.filter((t) => t.total > 0 || t.items.length).map((t) => ({ key: 't' + t.id, at: t.createdAt, title: `חשבון דוכן · ${t.eventTitle}`,
      tag: t.status === 'paid' ? <Tag tone="paid">שולם</Tag> : t.status === 'waived' ? <Tag>נמחל</Tag> : <Tag tone="waiting">{money(t.total)}</Tag>,
      meta: relDay(t.createdAt), path: `/manage/events/${t.eventId}/tabs/${t.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const extra = ctx.settings.registrationFields.map((f) => ({ f, v: p.fields?.[f.id] || (f.id === 'city' ? p.town || '' : '') })).filter((x) => x.v);

  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'אנשים', ...lnk('/manage/people') }} end={canBlock(me, p) ? <Button variant="quiet" onClick={block}>{blocked ? 'שחרור חסימה' : 'חסימה'}</Button> : undefined} />
      <div className="manage-person">
        <Avatar name={p.displayName} size={56} tone="me" src={p.photoSource === 'none' ? undefined : p.photo || p.googlePhoto} />
        <div className="manage-person__text">
          <b className="manage-person__name">{p.displayName}</b>
          <span className="manage-person__meta">{kind} {p.customerNumber} · {gw(p.displayName, 'נרשם', 'נרשמה')} ב{monthYear(p.createdAt)}</span>
        </div>
      </div>
      {blocked && <Tag tone="urgent" style={{ alignSelf: 'flex-start' }}>{gw(p.displayName, 'חסום', 'חסומה')}: לא יכול להזמין כרטיסים</Tag>}
      {contactPhoneOk(p.phone) && (
        <div className="manage-btnrow">
          <Button size="tall" icon="message" iconSize={18} onClick={() => ext(waUrl(p.phone))}>וואטסאפ</Button>
          <Button size="tall" variant="outline" icon="phone" iconSize={18} onClick={() => ext(telUrl(p.phone))}>התקשרות</Button>
        </div>
      )}
      <DetailList className="manage-dl48">
        <DetailRow term="טלפון"><span dir="ltr">{p.phone || '—'}</span></DetailRow>
        <DetailRow term="מייל"><span dir="ltr">{p.email || '—'}</span></DetailRow>
        {extra.map(({ f, v }) => <DetailRow key={f.id} term={f.label.replace(/\?$/, '')}>{v}</DetailRow>)}
      </DetailList>
      {p.role === 'vendor'
        ? <DetailList className="manage-dl48"><DetailRow term="תפקיד">{roleWord('vendor', female)}{p.helper ? ' · עוזר' : ''}</DetailRow></DetailList>
        : <Segmented label="תפקיד" value={p.role} onChange={setRole}
            options={(['guest', 'staff', 'manager', 'owner'] as Role[]).map((r) => ({ value: r, label: roleWord(r, female), disabled: r !== p.role && !allowed.includes(r) }))} />}
      <ListCard title={`מה היה ${gw(p.displayName, 'לו', 'לה')} אצלנו`}>
        {rows.length ? rows.map((r) => <Row key={r.key} {...lnk(r.path)} title={r.title} tags={r.tag} meta={r.meta} />)
          : <Row title={<span className="k-soft" style={{ fontWeight: 400 }}>עוד לא היה כלום</span>} />}
      </ListCard>
    </AppScreen>
  );
}

// ---------- N13 ----------
const agoDays = (iso: string) => {
  const d = Math.floor((nowMs() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? 'היום' : d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : d === 7 ? 'לפני שבוע' : d === 14 ? 'לפני שבועיים' : `לפני ${d} ימים`;
};
export function InviteScreen({ ctx }: ScreenProps) {
  const invites = useRoleInvites(true).items;
  const people = usePeople(true).items;
  const allowed = inviteRolesFor(ctx.owner);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'manager' | 'owner'>('staff');
  const [error, setError] = useState('');
  const run = useRun();
  const existing = people.find((p) => p.email && p.email.toLowerCase() === email.trim().toLowerCase());
  const save = async () => {
    const e = email.trim().toLowerCase();
    if (!emailOk(e)) { setError('כתובת מייל לא תקינה'); return; }
    if (existing) { setError(''); go(`/manage/people/${existing.uid}`); return; }
    if (await run(() => inviteRole(ctx.actor, e, role), `${e} ${role === 'owner' ? 'יקבל תפקיד בעלים' : `יקבל תפקיד ${roleWord(role, false)}`} בכניסה הראשונה`)) { setEmail(''); setError(''); }
  };
  return (
    <AppScreen variant="form" gap={16} bar={<BottomBar><Button size="bar" grow onClick={save}>{existing ? 'פתיחת הכרטיס שלו' : 'שמירת התפקיד'}</Button></BottomBar>}>
      <FormHeader title="תפקיד לפי מייל" onCancel={() => go('/manage/people')} />
      <Field label="כתובת Google של האדם" ltr type="email" inputMode="email" autoComplete="off" placeholder="name@gmail.com" value={email}
        onChange={(e) => { setEmail(e.target.value); setError(''); }} error={error || undefined}
        hint={existing ? `${existing.displayName} כבר ${gw(existing.displayName, 'רשום', 'רשומה')}. את התפקיד משנים בכרטיס שלו.` : undefined} />
      <div className="manage-group">
        <span className="manage-group__label">איזה תפקיד</span>
        <Segmented className="manage-seg44" label="תפקיד" value={role} onChange={setRole}
          options={(['staff', 'manager', 'owner'] as const).map((r) => ({ value: r, label: roleWord(r, false), disabled: !allowed.includes(r) }))} />
      </div>
      {!ctx.owner && <span className="manage-hint">רק בעלים יכולים למנות מנהלים ובעלים.</span>}
      {invites.length > 0 && (
        <ListCard title="הוגדרו ועוד לא נכנסו" count={invites.length}>
          {invites.map((i) => (
            <Row key={i.id} title={i.email} meta={`${roleWord(i.role, false)} · הוגדר ${agoDays(i.createdAt)}`}
              actions={<Button variant="quiet" onClick={() => run(() => cancelInvite(i.id), { text: `בוטל: ${i.email}`, undo: () => inviteRole(ctx.actor, i.email, i.role) })}>ביטול</Button>} />
          ))}
        </ListCard>
      )}
    </AppScreen>
  );
}
