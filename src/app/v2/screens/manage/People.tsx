// Q23 "אנשים והודעות" (people segment here, messages segment Q25 in screens/broadcast/Sent.tsx), Q13 person file, N13 role by email.
import { useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, waUrl, telUrl } from '../../core';
import {
  Avatar, BottomBar, Button, Card, Chip, ChipRow, DetailList, DetailRow, EmptyState, Field, FormHeader, ListCard, MoreMenu, PageTitle, PickerSheet, Row,
  SearchField, SectionHeader, Segmented, Sheet, Tag, TextAreaField, TextLink, TopBar, type ActionItem,
  MoreDetails,
} from '../../kit';
import { tableCell, useTableView } from '../../patterns';
import { MONTHS, money, relDay, dayName, ddmm, keyOf, dayTime, firstName } from '../../format';
import { setUserNotes } from '../../../store';
import { useActivityForUser, ACTION_LABELS } from '../../../activity';
import { nowMs } from '../../../clock';
import { contactPhoneOk } from '../../../data';
import { ROLE_LABELS } from '../../../types';
import type { Profile, Role, Ticket } from '../../../types';
import {
  usePeople, usePerson, useRoleInvites, useOpenTickets, useOpenTabs, useMyTickets, useMyVisits, useMyDonations, useMyTabs,
  debtsByPerson, letterGroups, personMatches, isTeam, isFemale, gw, roleWord, allowedRoles, canBlock, inviteRolesFor, emailOk,
  changeRole, toggleBlock, inviteRole, cancelInvite, useRun, deletePerson, canDeletePerson, type InviteRole,
} from '../../data/manage';
import { lnk, HistorySheet, LinkCard, Loading, NotFound } from './shared';
import { useTeamLinks } from '../../data/invite';
import { MessagesSegment, MESSAGES_PATH } from '../broadcast';

// ---------- Q23 ----------
/** The two segments of "אנשים והודעות": people (Q23) and messages (Q25, ?tab=messages, screens/broadcast/Sent.tsx).
 *  The top bar holds ⋯ on people and the primary "הודעה חדשה" on messages (rule 5, as designed). */
type Seg = 'people' | 'messages';
type PFilter = 'all' | 'team' | 'guests' | 'debt' | 'blocked';

export function PeopleScreen({ ctx, params }: ScreenProps) {
  const all = usePeople(true);
  const people = useMemo(() => all.items.filter((p) => p.role !== 'vendor'), [all.items]);
  const debts = debtsByPerson(useOpenTickets(true).items, useOpenTabs(true).items);
  const fields = ctx.settings.registrationFields;
  const table = useTableView({
    title: 'אנשים', filename: 'אנשים.csv', headers: ['#', 'שם', 'טלפון', 'מייל', 'תפקיד', 'מצב', 'נרשם', 'חוב', ...fields.map((f) => f.label)],
    rows: () => people.map((p) => [p.customerNumber, p.displayName, p.phone, p.email, ROLE_LABELS[p.role], p.status === 'blocked' ? 'חסום' : 'פעיל', tableCell.date(p.createdAt), debts.get(p.uid) ? tableCell.money(debts.get(p.uid)) : '', ...fields.map((f) => p.fields?.[f.id] || '')]),
  });
  if (table.active) return table.screen;
  if (all.loading && !all.items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  const seg: Seg = params.tab === 'messages' ? 'messages' : 'people';
  const setSeg = (s: Seg) => { if (s !== seg) go(s === 'messages' ? MESSAGES_PATH : '/manage/people', true); };
  const more: ActionItem[] = [
    ...table.items,
    { label: 'תפקיד לפי כתובת מייל', icon: 'plus', meta: 'להוסיף מישהו מראש', onSelect: () => go('/manage/people/invite') },
  ];
  const end = seg === 'messages'
    ? <Button icon="plus" iconSize={18} onClick={() => go('/manage/broadcasts/new')}>הודעה חדשה</Button>
    : <MoreMenu title="אנשים" items={more} />;
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={end} />
      <PageTitle>אנשים והודעות</PageTitle>
      <Segmented size="lg" label="תצוגה" value={seg} onChange={setSeg}
        options={[{ value: 'people', label: <>אנשים · <span className="k-num">{people.length}</span></> }, { value: 'messages', label: 'הודעות' }]} />
      {seg === 'messages' ? <MessagesSegment ctx={ctx} /> : <PeopleSegment people={people} debts={debts} initial={params.filter} />}
    </AppScreen>
  );
}

function PeopleSegment({ people, debts, initial }: { people: Profile[]; debts: Map<string, number>; initial?: string }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PFilter>((['team', 'guests', 'debt', 'blocked'] as string[]).includes(initial || '') ? (initial as PFilter) : 'all');
  const invites = [...useRoleInvites(true).items, ...useTeamLinks(true).items]; // Q27: added ahead by e-mail or by phone
  const team = people.filter(isTeam);
  const withDebt = people.filter((p) => debts.has(p.uid));
  const blockedN = people.filter((p) => p.status === 'blocked').length;
  const list = people
    .filter((p) => (filter === 'team' ? isTeam(p) : filter === 'guests' ? p.role === 'guest' : filter === 'debt' ? debts.has(p.uid) : filter === 'blocked' ? p.status === 'blocked' : true))
    .filter((p) => personMatches(p, q));
  const groups = letterGroups(list);
  const tag = (p: Profile) => {
    if (p.status === 'blocked') return <Tag tone="urgent">חסום</Tag>;
    const d = debts.get(p.uid);
    if (d) return <Tag tone="waiting">{money(d)}</Tag>;
    if (p.role === 'owner') return <Tag tone="warm">בעלים</Tag>;
    if (p.role === 'manager' || p.role === 'staff') return <Tag tone="warm">צוות</Tag>;
    return null;
  };
  return (
    <>
      <SearchField label="שם, טלפון, מייל או מספר" value={q} onChange={(e) => setQ(e.target.value)} />
      <ChipRow label="סינון">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'team'} onClick={() => setFilter('team')}>צוות · {team.length}</Chip>
        <Chip selected={filter === 'guests'} onClick={() => setFilter('guests')}>אורחים</Chip>
        <Chip selected={filter === 'debt'} onClick={() => setFilter('debt')}>{withDebt.length ? `עם חוב · ${withDebt.length}` : 'עם חוב'}</Chip>
        <Chip selected={filter === 'blocked'} onClick={() => setFilter('blocked')}>{blockedN ? `חסומים · ${blockedN}` : 'חסומים'}</Chip>
      </ChipRow>
      {invites.length > 0 && !q && filter === 'all' && <LinkCard path="/manage/people/invite" title={`${invites.length} נוספו מראש ועוד לא נכנסו`} />}
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
    </>
  );
}

// ---------- Q13 ----------
const monthYear = (iso: string) => { const k = keyOf(iso); return `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`; };
type ItemRow = { key: string; at: string; title: string; tag?: ReactNode; meta: string; path: string };
const SHOWN_ITEMS = 2;

export function PersonScreen({ ctx, params }: ScreenProps) {
  const uid = params.uid;
  const { item: p, loading } = usePerson(uid);
  const tickets = useMyTickets(uid, true).items, visits = useMyVisits(uid, true).items, donations = useMyDonations(uid, true).items, tabs = useMyTabs(uid, true).items;
  const run = useRun();
  const ext = useExternal();
  const remove = useRemove();
  const [sheet, setSheet] = useState<'' | 'items' | 'history' | 'note' | 'role'>('');
  const [notes, setNotes] = useState('');
  const log = useActivityForUser(uid, true).items;
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
  const saveNote = async () => { if (await run(() => setUserNotes(p, notes.trim()), 'נשמר')) setSheet(''); };

  const orders = [...new Map(tickets.map((t) => [t.orderId, tickets.filter((x) => x.orderId === t.orderId)])).values()];
  const ticketTag = (o: Ticket[]) => {
    const valid = o.filter((t) => t.status === 'valid');
    if (!valid.length) return <Tag>בוטל</Tag>;
    const owe = valid.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').reduce((s, t) => s + t.price, 0);
    if (owe) return <Tag tone="waiting">{money(owe)}</Tag>;
    return valid[0].paymentStatus === 'free' ? null : <Tag tone="paid">שולם</Tag>;
  };
  const rows: ItemRow[] = [
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
  const itemRow = (r: ItemRow) => <Row key={r.key} {...lnk(r.path)} title={r.title} tags={r.tag} meta={r.meta} />;
  const extra = ctx.settings.registrationFields.map((f) => ({ f, v: p.fields?.[f.id] || (f.id === 'city' ? p.town || '' : '') })).filter((x) => x.v);
  const history = [
    ...log.map((a) => ({ key: a.id, at: a.at, title: `${ACTION_LABELS[a.action] || a.action}: ${a.text}`, meta: `${dayTime(a.at)}${a.by.uid !== p.uid ? ` · ${firstName(a.by.name)}` : ''}` })),
    ...(p.log || []).map((l, i) => ({ key: 'l' + i, at: l.at, title: l.text, meta: `${dayTime(l.at)} · ${firstName(l.by.name)}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const joined = { key: 'joined', at: p.createdAt, title: gw(p.displayName, 'נרשם', 'נרשמה'), meta: `${ddmm(p.createdAt)}.${keyOf(p.createdAt).slice(0, 4)}` };
  const latest = history[0] || joined;
  const actions: ActionItem[] = [
    { label: blocked ? 'שחרור חסימה' : 'חסימה', icon: 'blocked', meta: blocked ? undefined : gw(p.displayName, 'לא יוכל להזמין כרטיסים', 'לא תוכל להזמין כרטיסים'), hidden: !canBlock(me, p), onSelect: block },
    { label: 'מחיקה', icon: 'trash', tone: 'danger', hidden: !canDeletePerson(me, p), confirm: {
      title: `למחוק את ${p.displayName}?`,
      text: `${gw(p.displayName, 'הוא יימחק', 'היא תימחק')} מהאפליקציה. הכרטיסים, התרומות והביקורים נשארים. ${gw(p.displayName, 'אם ייכנס', 'אם תיכנס')} שוב עם אותו חשבון גוגל, ${gw(p.displayName, 'יתחיל', 'תתחיל')} מההתחלה כמו ${gw(p.displayName, 'חדש', 'חדשה')}. המחיקה נרשמת בפעילות, ואי אפשר לבטל אותה.`,
      onConfirm: () => remove(() => deletePerson(ctx.actor, p), { text: `${p.displayName} ${gw(p.displayName, 'נמחק', 'נמחקה')}`, after: () => go('/manage/people', true) }),
    } },
  ];

  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'אנשים', ...lnk('/manage/people') }} end={<MoreMenu title={p.displayName} items={actions} />} />
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
        <DetailRow term="תפקיד" action={p.role !== 'vendor' && allowed.length > 0 ? <TextLink onClick={() => setSheet('role')}>שינוי</TextLink> : undefined}>
          {roleWord(p.role, female)}{p.role === 'vendor' && p.helper ? ' · עוזר' : ''}
        </DetailRow>
      </DetailList>
      <ListCard title={`מה היה ${gw(p.displayName, 'לו', 'לה')} אצלנו`} end={rows.length > SHOWN_ITEMS ? <TextLink onClick={() => setSheet('items')}>הכל · {rows.length}</TextLink> : undefined}>
        {rows.length ? rows.slice(0, SHOWN_ITEMS).map(itemRow) : <Row title={<span className="k-soft" style={{ fontWeight: 400 }}>עוד לא היה כלום</span>} />}
      </ListCard>
      {ctx.manager && (
        <Card as="section" className="manage-note">
          <SectionHeader title="הערה של מנהלים" end={<TextLink onClick={() => { setNotes(p.notes || ''); setSheet('note'); }}>עריכה</TextLink>} />
          <div className="manage-note__body">
            {p.notes ? <p className="manage-note__text">{p.notes}</p> : <p className="manage-note__text k-soft">מה כדאי לזכור על האדם הזה</p>}
            <span className="k-meta">רק מנהלים רואים</span>
          </div>
        </Card>
      )}
      <LinkCard onClick={() => setSheet('history')} title={`היסטוריה · ${history.length + 1}`} meta={`האחרון: ${latest.title}, ${latest.meta}`} />
      {/* Q13 does not show the sign-up answers (parity): they wait, question over answer, in a collapsed card at the bottom */}
      {extra.length > 0 && (
        <MoreDetails title="תשובות בהרשמה">
          {extra.map(({ f, v }) => <Row key={f.id} title={f.label} meta={f.type === 'date' ? String(tableCell.date(v)) : v} />)}
        </MoreDetails>
      )}

      <Sheet open={sheet === 'items'} onClose={() => setSheet('')} title={`מה היה ${gw(p.displayName, 'לו', 'לה')} אצלנו`}>
        <ListCard aria-label="הכל">{rows.map(itemRow)}</ListCard>
      </Sheet>
      <HistorySheet open={sheet === 'history'} onClose={() => setSheet('')} lines={[...history, joined]} />
      <Sheet open={sheet === 'note'} onClose={() => setSheet('')} title="הערה של מנהלים">
        <div className="manage-sheet">
          <TextAreaField label="הערה" hint="רק מנהלים רואים" placeholder="מה כדאי לזכור על האדם הזה" height={110} maxLength={2000}
            value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button size="lg" block onClick={saveNote}>שמירה</Button>
        </div>
      </Sheet>
      <PickerSheet open={sheet === 'role'} onClose={() => setSheet('')} title="תפקיד" value={p.role} onChange={setRole}
        options={(['guest', 'staff', 'manager', 'owner'] as Role[]).map((r) => ({ value: r, label: roleWord(r, female), disabled: r !== p.role && !allowed.includes(r) }))} />
    </AppScreen>
  );
}

// N13 / Q27 moved to Invite.tsx
export { InviteScreen } from './Invite';
