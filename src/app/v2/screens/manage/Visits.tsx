// N1 visit requests and N2 one request.
import { useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useRemove, useToast, waUrl, telUrl } from '../../core';
import { BottomBar, Button, Chip, ChipRow, DetailList, DetailRow, EmptyState, Field, IconButton, ListCard, PageTitle, Quote, Row, Tag, TopBar, ConfirmSheet } from '../../kit';
import { agoLong, dayName, ddmm, longDate, firstName } from '../../format';
import { contactPhoneOk } from '../../../data';
import type { Visit, CalendarItem } from '../../../types';
import { useVisits, useVisit, useCalendar, useNotifications, visitBuckets, timeFromNote, gw, decide, fillTemplate, useRun, deleteVisit } from '../../data/manage';
import { lnk, Loading, NotFound } from './shared';

// ---------- N1 ----------
type VFilter = 'new' | 'all' | 'approved' | 'rejected';
const when = (v: Visit) => `${dayName(v.date)} ${ddmm(v.date)}`;
export function VisitsScreen({ ctx }: ScreenProps) {
  const { items, loading } = useVisits(true);
  const [filter, setFilter] = useState<VFilter>('all');
  const b = visitBuckets(items, ctx.today);
  const freshRow = (v: Visit) => <Row key={v.id} minHeight={58} {...lnk(`/manage/visits/${v.id}`)} title={`${v.name} · ${v.people} אנשים`} tags={<Tag tone="waiting">חדש</Tag>} meta={`${when(v)} · ${v.type}`} />;
  const dateRow = (v: Visit) => <Row key={v.id} minHeight={58} {...lnk(`/manage/visits/${v.id}`)} title={`${v.name} · ${v.people}`} meta={[when(v), timeFromNote(v.managerNote), v.type].filter(Boolean).join(' · ')} />;
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  const showFresh = (filter === 'all' || filter === 'new') && b.fresh.length > 0;
  const showApproved = (filter === 'all' || filter === 'approved') && b.approved.length > 0;
  const showPast = filter === 'approved' && b.past.length > 0;
  const showRejected = filter === 'rejected' && b.rejected.length > 0;
  const empty = !showFresh && !showApproved && !showPast && !showRejected;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} />
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
  const sameDay = useCalendar(!!v, v?.date || '2000-01-01', v?.date || '2000-01-01').items;
  const open = useNotifications(true).items;
  const [note, setNote] = useState<string | null>(null);
  const run = useRun();
  const toast = useToast();
  const ext = useExternal();
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();
  if (loading) return <Loading back={{ label: 'ביקורים', path: '/manage/visits' }} />;
  if (!v) return <NotFound back={{ label: 'ביקורים', path: '/manage/visits' }} title="הבקשה לא נמצאה" />;
  const n = note ?? v.managerNote;
  const time = timeFromNote(n);
  const requester = ctx.peopleByUid.get(v.uid);
  const contact = requester?.displayName || v.name;
  const phone = v.phone || requester?.phone || '';
  const message = fillTemplate(ctx.settings.templates.visitApproved, { 'שם': firstName(contact), 'תאריך': longDate(v.date), 'שעה': time, 'הערה': n });
  const decideAs = async (status: Visit['status']) => {
    const ok = await run(() => decide(v, ctx.actor, status, n, time, open));
    if (!ok) return;
    setNote(null);
    if (status === 'approved') toast.show({ text: 'אושר ונכנס ליומן', check: true, actions: contactPhoneOk(phone) ? [{ label: 'וואטסאפ', onClick: () => ext(waUrl(phone, message)) }] : [] });
    else toast.show({ text: status === 'rejected' ? 'סומן: לא מתאים' : 'הביקור בוטל', check: true, duration: 3000 });
  };
  // One line per entry: the same title, hours and person twice (an old manual item next to a new one) shows once.
  const items = sameDay.filter((c) => c.refId !== v.id).filter((c, i, all) => all.findIndex((x) => x.title === c.title && calWhen(x) === calWhen(c) && x.ownerUid === c.ownerUid) === i)
    .sort((a, b) => { const sa = a.from || a.time || '99', sb = b.from || b.time || '99'; return sa.localeCompare(sb); }); // timed first, by start; all-day last
  const over = v.status === 'new' ? `בקשה חדשה · ${agoLong(v.createdAt)}` : v.status === 'approved' ? `אושר${v.handledBy ? ` · ${firstName(v.handledBy.name)}` : ''}` : v.status === 'rejected' ? 'לא מתאים' : 'בוטל';
  const bar = v.status === 'approved'
    ? <BottomBar>{n !== v.managerNote ? <Button size="bar" grow onClick={() => decideAs('approved')}>שמירת ההערה</Button> : <Button size="bar" grow variant="outline" icon="message" onClick={() => ext(waUrl(phone, message))} disabled={!contactPhoneOk(phone)}>הודעת אישור בוואטסאפ</Button>}<Button size="bar" variant="secondary" onClick={() => decideAs('cancelled')}>ביטול הביקור</Button></BottomBar>
    : <BottomBar><Button size="bar" grow onClick={() => decideAs('approved')}>אישור ליומן</Button>{v.status === 'new' && <Button size="bar" variant="secondary" onClick={() => decideAs('rejected')}>לא מתאים</Button>}</BottomBar>;
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={{ label: 'ביקורים', ...lnk('/manage/visits') }} end={<Button variant="quiet" onClick={() => setAskDelete(true)}>מחיקה</Button>} />
      <div className="manage-titled">
        <span className="k-meta">{over}</span>
        <PageTitle size="detail" className="k-h1--detail-tight">{v.name}</PageTitle>
      </div>
      <DetailList className="manage-dl50">
        <DetailRow term="מתי">{dayName(v.date)}, {longDate(v.date)}</DetailRow>
        <DetailRow term="כמה">{v.people} אנשים</DetailRow>
        <DetailRow term="סוג">{v.type}</DetailRow>
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
      <Field label="שעה והערה לאורח" value={n} onChange={(e) => setNote(e.target.value)} placeholder="נפגשים בשער ב־10:00"
        hint={v.status === 'approved' && n !== v.managerNote ? 'שעה שכותבים כאן נכנסת גם ליומן.' : undefined} />
      <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את הבקשה?"
        text={`הבקשה של ${v.name} תימחק${v.status === 'approved' ? ', וגם הביקור ביומן' : ''}. ${gw(contact, 'הוא לא יקבל', 'היא לא תקבל')} על זה הודעה.`} confirmLabel="מחיקה"
        onConfirm={() => remove(() => deleteVisit(ctx.actor, v, open), { text: 'הבקשה נמחקה', after: () => go('/manage/visits', true) })} />
    </AppScreen>
  );
}
