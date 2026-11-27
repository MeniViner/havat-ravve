// N1 visit requests and N2 one request. Tidy round: table view and export behind ⋯ on the list (small additions row 7);
// on a request, "לא מתאים" (for an approved visit), the change history and the delete live behind ⋯ (rules 5, 6).
// Visit types are edited in Settings only (the old link at the bottom of N1 duplicated Q19's row).
import { VisitDecision } from './VisitDecision';
import { usePrivateVisitNote, savePrivateVisitNote } from '../../data/operationalMessages';
import { useCallback, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, useToast, waUrl, telUrl } from '../../core';
import { BottomBar, Button, Chip, ChipRow, DetailList, DetailRow, EmptyState, Field, IconButton, ListCard, MoreMenu, PageTitle, Quote, Row, Tag, TopBar, type ActionItem } from '../../kit';
import { tableCell, useTableView } from '../../patterns';
import { agoLong, dayName, ddmm, dayTime, longDate, firstName } from '../../format';
import { contactPhoneOk } from '../../../data';
import { useActivityFor, ACTION_LABELS } from '../../../activity';
import { VISIT_LABELS, type Visit, type CalendarItem } from '../../../types';
import { useVisits, useVisit, useCalendar, useNotifications, visitBuckets, timeFromNote, gw, decide, fillTemplate, useRun, deleteVisit } from '../../data/manage';
import { lnk, HistorySheet, Loading, NotFound } from './shared';

// ---------- N1 ----------
type VFilter = 'new' | 'all' | 'approved' | 'rejected';
const when = (v: Visit) => `${dayName(v.date)} ${ddmm(v.date)}`;
export function VisitsScreen({ ctx }: ScreenProps) {
  const { items, loading } = useVisits(true);
  const [filter, setFilter] = useState<VFilter>('all');
  const timeline = items.map((v)=>v.status==='approved' && v.approvedDate ? {...v,date:v.approvedDate} : v);
  const b = visitBuckets(timeline, ctx.today);
  const table = useTableView({
    title: 'ביקורים', filename: 'ביקורים.csv', headers: ['תאריך', 'מי', 'טלפון', 'אנשים', 'סוג', 'מצב', 'הערה', 'מטפל/ת'],
    rows: () => timeline.map((v) => [tableCell.date(v.date), v.name, v.phone, v.people, v.type, VISIT_LABELS[v.status], v.managerNote, v.handledBy?.name || '']),
  });
  if (table.active) return table.screen;
  const freshRow = (v: Visit) => <Row key={v.id} minHeight={58} {...lnk(`/manage/visits/${v.id}`)} title={`${v.name} · ${v.people} אנשים`} tags={<Tag tone="waiting">חדש</Tag>} meta={`${when(v)} · ${v.type}`} />;
  const dateRow = (v: Visit) => <Row key={v.id} minHeight={58} {...lnk(`/manage/visits/${v.id}`)} title={`${v.name} · ${v.people}`} meta={[when(v), v.approvedTime || timeFromNote(v.managerNote), v.type].filter(Boolean).join(' · ')} />;
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  const showFresh = (filter === 'all' || filter === 'new') && b.fresh.length > 0;
  const showApproved = (filter === 'all' || filter === 'approved') && b.approved.length > 0;
  const showPast = filter === 'approved' && b.past.length > 0;
  const showRejected = filter === 'rejected' && b.rejected.length > 0;
  const empty = !showFresh && !showApproved && !showPast && !showRejected;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} end={<MoreMenu title="ביקורים" items={table.items} />} />
      <PageTitle>ביקורים</PageTitle>
      <ChipRow label="סינון">
        <Chip selected={filter === 'new'} onClick={() => setFilter('new')}>{b.fresh.length ? `חדשים · ${b.fresh.length}` : 'חדשים'}</Chip>
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'approved'} onClick={() => setFilter('approved')}>{b.approved.length ? `מאושרים · ${b.approved.length}` : 'מאושרים'}</Chip>
        <Chip selected={filter === 'rejected'} onClick={() => setFilter('rejected')}>נדחו</Chip>
      </ChipRow>
      {showFresh && <ListCard title="מחכה לתשובה">{b.fresh.map(freshRow)}</ListCard>}
      {showApproved && <ListCard title="מאושרים, לפי תאריך">{b.approved.map(dateRow)}</ListCard>}
      {showPast && <ListCard title="עברו">{b.past.map(dateRow)}</ListCard>}
      {showRejected && <ListCard title="נדחו או בוטלו">{b.rejected.map((v) => <Row key={v.id} minHeight={58} {...lnk(`/manage/visits/${v.id}`)} title={`${v.name} · ${v.people}`} meta={[when(v), v.managerNote || v.type].filter(Boolean).join(' · ')} />)}</ListCard>}
      {empty && <EmptyState variant="fill" icon="pin" title={filter === 'new' ? 'אין בקשות חדשות' : filter === 'rejected' ? 'לא נדחה אף ביקור' : 'אין ביקורים קרובים'} text="בקשות ביקור מגיעות מהאתר ומחכות כאן לתשובה." />}
    </AppScreen>
  );
}

// ---------- N2 ----------
const calWhen = (c: CalendarItem) => (c.from && c.to ? `${c.from}–${c.to}` : c.time || 'כל היום');
export function VisitScreen({ ctx, params }: ScreenProps) {
  const { item: v, loading } = useVisit(params.id);
  const privateNote = usePrivateVisitNote(params.id, ctx.manager);
  const calendarDate = (v?.status === 'approved' && v.approvedDate) || v?.date || '2000-01-01';
  const sameDay = useCalendar(!!v, calendarDate, calendarDate).items;
  const open = useNotifications(true).items;
  const [note, setNote] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [decision, setDecision] = useState<'approved'|'rejected'|null>(() =>
    params.decision === 'approved' || params.decision === 'rejected' ? params.decision : null);
  const closeDecision = useCallback(() => {
    setDecision(null);
    if (params.decision) go(`/manage/visits/${params.id}`, true);
  }, [params.id, params.decision]);
  const run = useRun();
  const toast = useToast();
  const ext = useExternal();
  const remove = useRemove();
  const log = useActivityFor('visit', params.id).items;
  if (loading) return <Loading back={{ label: 'ביקורים', path: '/manage/visits' }} />;
  if (!v) return <NotFound back={{ label: 'ביקורים', path: '/manage/visits' }} title="הבקשה לא נמצאה" />;
  const teamNote = privateNote.item?.note || '';
  const n = note ?? teamNote;
  const time = timeFromNote(v.managerNote || '');
  const requester = ctx.peopleByUid.get(v.uid);
  const contact = requester?.displayName || v.name;
  const phone = v.phone || requester?.phone || '';
  const message = v.replyText || fillTemplate(ctx.settings.templates.visitApproved, { 'שם': firstName(contact), 'תאריך': longDate(v.approvedDate || v.date), 'שעה': v.approvedTime || time, 'הערה': v.managerNote });
  const cancel = async () => {
    const ok = await run(() => decide(v, ctx.actor, 'cancelled', v.managerNote, v.approvedTime || time, open));
    if (!ok) return;
    setNote(null);
    toast.show({ text: 'הביקור בוטל', check: true, duration: 3000 });
  };
  const saveNote = async () => {
    if (await run(() => savePrivateVisitNote(v, ctx.actor, n), 'ההערה לצוות נשמרה')) setNote(null);
  };
  // One line per entry: the same title, hours and person twice (an old manual item next to a new one) shows once.
  const items = sameDay.filter((c) => c.refId !== v.id).filter((c, i, all) => all.findIndex((x) => x.title === c.title && calWhen(x) === calWhen(c) && x.ownerUid === c.ownerUid) === i)
    .sort((a, b) => { const sa = a.from || a.time || '99', sb = b.from || b.time || '99'; return sa.localeCompare(sb); }); // timed first, by start; all-day last
  const over = v.status === 'new' ? `בקשה חדשה · ${agoLong(v.createdAt)}` : v.status === 'approved' ? `אושר${v.handledBy ? ` · ${firstName(v.handledBy.name)}` : ''}` : v.status === 'rejected' ? 'לא מתאים' : 'בוטל';
  const bar = v.status === 'approved'
    ? <BottomBar>{n !== teamNote ? <Button size="bar" grow onClick={saveNote}>שמירת ההערה</Button> : <Button size="bar" grow variant="outline" icon="message" onClick={() => ext(waUrl(phone, message))} disabled={!contactPhoneOk(phone)}>הודעת אישור בוואטסאפ</Button>}<Button size="bar" variant="secondary" onClick={cancel}>ביטול הביקור</Button></BottomBar>
    : <BottomBar><Button size="bar" grow onClick={() => setDecision('approved')}>אישור ליומן</Button>{v.status === 'new' && <Button size="bar" variant="secondary" onClick={() => setDecision('rejected')}>לא מתאים</Button>}</BottomBar>;
  const actions: ActionItem[] = [
    { label: 'שינוי מועד הביקור', icon: 'clock', hidden: v.status !== 'approved', onSelect: () => setDecision('approved') },
    { label: 'לא מתאים', icon: 'close', hidden: v.status !== 'approved', onSelect: () => setDecision('rejected') },
    { label: 'היסטוריית שינויים', icon: 'clock', onSelect: () => setHistory(true) },
    { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
      title: 'למחוק את הבקשה?',
      text: `הבקשה של ${v.name} תימחק${v.status === 'approved' ? ', וגם הביקור ביומן' : ''}. ${gw(contact, 'הוא לא יקבל', 'היא לא תקבל')} על זה הודעה. המחיקה נרשמת בפעילות, ואי אפשר לבטל אותה.`,
      onConfirm: () => remove(() => deleteVisit(ctx.actor, v, open), { text: 'הבקשה נמחקה', after: () => go('/manage/visits', true) }),
    } },
  ];
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: 'ביקורים', ...lnk('/manage/visits') }} end={<MoreMenu title="ביקור" items={actions} />} />
      <div className="manage-titled">
        <span className="k-meta">{over}</span>
        <PageTitle size="detail" className="k-h1--detail-tight">{v.name}</PageTitle>
      </div>
      <DetailList className="manage-dl50">
        <DetailRow term="המועד המבוקש">{dayName(v.date)}, {longDate(v.date)}</DetailRow>
        {v.status === 'approved' && v.approvedDate && <DetailRow term="המועד שאושר">{longDate(v.approvedDate)} {v.approvedTime}{v.approvedDate!==v.date && <Tag tone="warm">מועד שונה</Tag>}</DetailRow>}
        <DetailRow term="כמה">{v.people} אנשים</DetailRow>
        <DetailRow term="סוג">{v.type}</DetailRow>
        {v.managerNote && !v.replyText && <DetailRow term="הודעה קודמת למבקש">{v.managerNote}</DetailRow>}
        <DetailRow term={gw(contact, 'פנה', 'פנתה')} action={contactPhoneOk(phone) ? <>
          <IconButton variant="outline" icon="message" label={`וואטסאפ ל${contact}`} onClick={() => ext(waUrl(phone))} />
          <IconButton variant="outline" icon="phone" label={`התקשרות ל${contact}`} onClick={() => ext(telUrl(phone))} />
        </> : undefined}>
          {requester ? <a className="manage-plainname" {...lnk(`/manage/people/${requester.uid}`)}>{contact}</a> : contact}
        </DetailRow>
      </DetailList>
      {v.note && <Quote>{v.note}</Quote>}
      <ListCard title="באותו יום ביומן">
        {items.length ? items.map((c) => {
          const owner = firstName(c.ownerName);
          return <Row key={c.id} minHeight={50} title={c.title} meta={[calWhen(c), c.title.includes(owner) ? '' : owner].filter(Boolean).join(' · ')} />;
        }) : <Row minHeight={50} title={<span className="k-soft" style={{ fontWeight: 400 }}>היום הזה פנוי ביומן</span>} />}
      </ListCard>
      <Field label="הערה לצוות" value={n} onChange={(e) => setNote(e.target.value)} maxLength={1000} disabled={privateNote.loading || !!privateNote.error} />
      {privateNote.error && <p role="alert">לא ניתן לטעון את ההערה לצוות.</p>}
      {decision && <VisitDecision ctx={ctx} visit={v} managerNote={note ?? undefined} choice={decision} close={closeDecision} />}
      <HistorySheet open={history} onClose={() => setHistory(false)} title="היסטוריית שינויים" lines={[
        ...log.map((a) => ({ key: a.id, title: `${ACTION_LABELS[a.action] || a.action} · ${firstName(a.by.name)}`, meta: `${a.text} · ${dayTime(a.at)}` })),
        { key: 'created', title: 'הבקשה הוגשה מהאתר', meta: dayTime(v.createdAt) },
      ]} />
    </AppScreen>
  );
}
