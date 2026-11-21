// T3 (task), C3 (task with links), C4 (who the task is on) and C6 (done with a photo).
import { useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, mapsUrl, useExternal, useToast } from '../../core';
import {
  TopBar, PageTitle, FormHeader, Button, DetailList, DetailRow, Card, SectionHeader, SectionTitle, Stack, History, BottomBar,
  Avatar, IconTile, Icon, SearchField, RadioList, RadioRow, ListCard, Field, EmptyState,
} from '../../kit';
import { back, href as appHref } from '../../../router';
import { useClockVersion, now } from '../../../clock';
import { useTaskActivity } from '../../../activity';
import { useEvent } from '../../../data';
import { dayTime, ago, daysLeft, firstName, hhmm, daysFromToday } from '../../format';
import { isFemale } from '../../gender';
import type { Actor, Task } from '../../../types';
import {
  useTaskV2, useShoppingDoc, useTasksAt, useRootTasks, usePresenceToday, timeline, dueLong, requesterOf, releaseTask, assignTask,
  setTaskPhoto, doneWithPhoto, presenceOf, loadText, isForToday, setDone,
  gwA,
} from '../../data/tasks';
import { to, useFail, useTaskActions, usePhotoPicker } from './shared';
import './tasks.css';

const Missing = ({ backTo, label }: { backTo: string; label: string }) => (
  <AppScreen variant="detail">
    <TopBar back={{ label, ...to(backTo) }} />
    <EmptyState variant="card" title="המשימה לא נמצאה" text="אולי נמחקה, או שאין לך גישה אליה" />
  </AppScreen>
);
const Loading = () => <AppScreen variant="detail"><div /></AppScreen>;

/** "בני גוטמן · אתמול 08:15" within two days, "· לפני 3 ימים" before that. */
const askedWhen = (iso: string) => (!iso ? '' : daysFromToday(iso) >= -1 ? dayTime(iso) : ago(iso));

export function TaskScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const id = params.id;
  const r = useTaskV2(id, ctx);
  const acts = useTaskActivity(id, ctx.manager);
  const t = r.item;
  const ev = useEvent(t?.eventId || '', !!t?.eventId);
  const shop = useShoppingDoc(t?.shoppingId || '');
  const here = useTasksAt(t?.location?.placeId || '', ctx.manager);
  const a = useTaskActions(); const fail = useFail(); const toast = useToast(); const external = useExternal();
  const photo = usePhotoPicker((p) => { if (t) setTaskPhoto(ctx.actor, t, p).then(() => toast.show({ text: 'התמונה נוספה למשימה' })).catch(fail); });
  if (!t) return r.loading ? <Loading /> : <Missing backTo="/tasks" label="משימות" />;

  const uid = ctx.user.uid;
  const linked = !!(t.eventId || t.shoppingId);
  const mine = t.assignee?.uid === uid;
  const req = requesterOf(t);
  const lines = timeline(t, acts.items, dayTime, (u) => ctx.team.find((p) => p.uid === u));
  const navBtn = t.location ? <Button variant="outline" icon="nav" iconSize={16} style={{ padding: '0 12px' }} onClick={() => external(mapsUrl(t.location!.lat, t.location!.lng))}>ניווט</Button> : undefined;

  let who: ReactNode; let whoAction: ReactNode;
  if (t.done) who = t.assignee ? (mine ? 'עליך' : t.assignee.name) : 'פנויה';
  else if (mine) { who = 'עליך'; whoAction = <Button variant="outline" style={{ padding: '0 12px' }} onClick={() => releaseTask(ctx.actor, t, ctx.manager).catch(fail)}>לשחרר</Button>; }
  else if (!t.assignee) { who = 'פנויה'; whoAction = <Button variant="outline" style={{ padding: '0 12px' }} onClick={() => a.take(t)}>לקחת</Button>; }
  else {
    who = <a className="tasks-who" {...to(`/people/${t.assignee.uid}`)}><Avatar name={t.assignee.name} size={28} />{t.assignee.name}</a>;
    whoAction = <Button variant="outline" {...to(`/tasks/${t.id}/assign`)}>להעביר</Button>;
  }

  const bar = t.done ? (
    <BottomBar><Button variant="secondary" size="bar" grow onClick={() => setDone(ctx.actor, t, false).catch(fail)}>להחזיר לביצוע</Button></BottomBar>
  ) : (
    <BottomBar>
      <Button size="bar" grow icon="check" onClick={async () => { await a.done(t); back('/tasks'); }}>בוצע</Button>
      {linked
        ? <Button variant="secondary" size="bar" style={{ padding: '0 18px', fontSize: 16, fontWeight: 500 }} {...to(`/tasks/${t.id}/done`)}>עם צילום</Button>
        : <Button variant="secondary" size="bar" icon="camera" {...to(`/tasks/${t.id}/done`)}>עם צילום</Button>}
    </BottomBar>
  );

  return (
    <AppScreen variant="detail" gap={linked ? 10 : 12} bar={bar}>
      {photo.input}
      <TopBar back={{ label: 'משימות', onClick: (e) => { e.preventDefault(); back('/tasks'); }, href: appHref('/tasks') }}
        end={<Button variant="outline" icon="edit" iconSize={16} {...to(`/tasks/${t.id}/edit`)}>עריכה</Button>} />
      <PageTitle size="detail">{t.title}</PageTitle>
      <DetailList className={linked ? "tasks-dl-linked" : undefined}>
        <DetailRow term="על מי" action={whoAction}>{who}</DetailRow>
        {t.location && !linked && <DetailRow term="איפה" action={navBtn}>{t.location.placeName || 'נקודה על המפה'}</DetailRow>}
        {t.dueDate && <DetailRow term="עד מתי">{dueLong(t.dueDate, ctx.today)}</DetailRow>}
        {req.name && <DetailRow term={gwA(req, "ביקש", "ביקשה", (u) => ctx.team.find((p) => p.uid === u))}>{`${req.name} · ${askedWhen(t.createdAt)}`}</DetailRow>}
        {t.note && <DetailRow term="הערה" plain>{t.note}</DetailRow>}
        {t.done && <DetailRow term="בוצע">{[t.doneBy ? firstName(t.doneBy.name) : '', t.doneAt ? dayTime(t.doneAt) : ''].filter(Boolean).join(' · ')}</DetailRow>}
        {t.done && t.doneNote && <DetailRow term="נכתב" plain>{t.doneNote}</DetailRow>}
      </DetailList>
      {t.done && t.donePhoto && <img className="tasks-photo-thumb" src={t.donePhoto} alt={`תמונה מהביצוע: ${t.title}`} />}
      {t.photo && <img className="tasks-photo-thumb" src={t.photo} alt={`תמונה למשימה: ${t.title}`} />}

      {linked && (
        <Card as="section">
          <SectionHeader title="קשור ל" />
          <ul className="k-list k-list--flush" style={{ margin: 0 }}>
            {t.eventId && <Related icon="qr" kind="אירוע" title={ev.item?.title || 'אירוע'} end={ev.item?.start ? daysLeft(ev.item.start) : ''} path={`/farm/events/${t.eventId}`} />}
            {t.location && <Related icon="pin" kind="מקום" title={t.location.placeName || 'נקודה על המפה'} end={here.items.length === 1 ? 'משימה אחת' : `${here.items.length} משימות`} path={t.location.placeId ? `/places/${t.location.placeId}` : ''} onClick={!t.location.placeId ? () => external(mapsUrl(t.location!.lat, t.location!.lng)) : undefined} />}
            {t.shoppingId && <Related icon="cart" kind={shop.item?.bought ? 'קנייה' : 'קנייה שמחכה'} title={shop.item ? [shop.item.title, shop.item.qty].filter(Boolean).join(' · ') : 'פריט קנייה'} end={shop.item?.bought ? 'נקנה' : 'עוד לא נקנה'} path={`/shopping/${t.shoppingId}`} />}
          </ul>
        </Card>
      )}
      {linked && !t.done && <Button variant="dashed" size="tall" icon="plus" iconSize={18} {...to(`/new?kind=shopping&task=${t.id}`)}>צריך לקנות משהו בשביל זה</Button>}
      {!linked && !t.photo && !t.done && <Button variant="dashed" size="tall" icon="camera" iconSize={20} disabled={photo.busy} onClick={() => photo.pick(true)}>הוספת תמונה למשימה</Button>}
      {!linked && lines.length > 0 && (
        <Stack gap={4} as="section">
          <SectionTitle>מה קרה עד עכשיו</SectionTitle>
          <History items={lines} />
        </Stack>
      )}
    </AppScreen>
  );
}

function Related({ icon, kind, title, end, path, onClick }: { icon: 'qr' | 'pin' | 'cart'; kind: string; title: string; end: string; path: string; onClick?: () => void }) {
  const link = path ? to(path) : { href: '#', onClick: (e: React.MouseEvent) => { e.preventDefault(); onClick?.(); } };
  return (
    <li className="tasks-rel">
      <IconTile icon={icon} />
      <a className="tasks-rel__link" {...link}><span className="tasks-rel__kind">{kind}</span><span className="tasks-rel__title">{title}</span></a>
      {end && <span className="tasks-rel__end">{end}</span>}
      <span className="tasks-rel__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
    </li>
  );
}

// ---------- C4 ----------
export function AssignScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const r = useTaskV2(params.id, ctx);
  const root = useRootTasks(ctx);
  const presence = usePresenceToday(ctx.today);
  const fail = useFail(); const toast = useToast();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null | undefined>(undefined);
  const t = r.item;
  if (!t) return r.loading ? <Loading /> : <Missing backTo="/tasks" label="משימות" />;

  const uid = ctx.user.uid;
  const current = t.assignee?.uid || null;
  const sel = pick === undefined ? current : pick;
  const nowHHMM = hhmm(now());
  // staff may put a task only on themselves or leave it free (the rules allow a non-creator to change only that)
  const canOthers = ctx.manager || t.createdBy.uid === uid || t.assignee?.uid === uid;
  const people = ctx.team.filter((p) => p.status === 'active' && (canOthers || p.uid === uid) && (!q.trim() || p.displayName.includes(q.trim())));
  const rows = people.map((p) => {
    const st = presenceOf(presence.items.filter((c) => c.ownerUid === p.uid), nowHHMM, isFemale(p.displayName, p));
    const load = root.items.filter((x) => x.assignee?.uid === p.uid && isForToday(x, ctx.today)).length;
    return { p, st, load, me: p.uid === uid };
  }).sort((a, b) => a.st.order - b.st.order || Number(a.me) - Number(b.me) || a.p.displayName.localeCompare(b.p.displayName, 'he'));
  const hereNow = rows.filter((x) => x.st.here);
  const away = rows.filter((x) => !x.st.here);
  const chosen = sel ? ctx.team.find((p) => p.uid === sel) : null;
  const actorOf = (uidX: string): Actor => { const p = ctx.team.find((x) => x.uid === uidX)!; return { uid: p.uid, name: p.displayName }; };
  const label = sel === current ? 'בלי שינוי' : sel === null ? 'לשחרר את המשימה' : sel === uid ? 'לקחת עליי' : `להעביר ל${firstName(chosen?.displayName || '')}`;

  const save = async () => {
    if (sel === current) { back(`/tasks/${t.id}`); return; }
    try {
      await assignTask(ctx.actor, t, sel ? actorOf(sel) : null, current);
      toast.show({ text: sel ? (sel === uid ? 'המשימה עליך' : `המשימה הועברה ל${firstName(chosen?.displayName || '')}`) : 'המשימה פנויה' });
      back(`/tasks/${t.id}`);
    } catch (e) { fail(e); }
  };
  const row = (x: typeof rows[number]) => (
    <RadioRow key={x.p.uid} checked={sel === x.p.uid} onSelect={() => setPick(x.p.uid)}
      leading={<Avatar name={x.p.displayName} size={32} tone={x.me ? 'me' : 'default'} />}
      title={x.me ? 'אני' : x.p.displayName}
      meta={x.st.here ? `${x.st.text} · ${loadText(x.load)}` : x.st.text}
      style={x.st.here ? undefined : { opacity: 0.65 }} />
  );
  return (
    <AppScreen variant="form" gap={10} bar={<BottomBar><Button size="bar" grow disabled={sel === current} onClick={save}>{label}</Button></BottomBar>}>
      <FormHeader title="על מי המשימה" onCancel={() => back(`/tasks/${t.id}`)} />
      <SearchField label="חיפוש בצוות" placeholder="חיפוש בצוות" value={q} onChange={(e) => setQ(e.target.value)} />
      <RadioList label="על מי">
        <RadioRow checked={sel === null} onSelect={() => setPick(null)} leading={<IconTile icon="people" />} title="פנויה" meta="מי שיכול לוקח" />
      </RadioList>
      {hereNow.length > 0 && <ListCard title="בחווה עכשיו" count={hereNow.length} aria-label="בחווה עכשיו"><RadioGroupRows>{hereNow.map(row)}</RadioGroupRows></ListCard>}
      {away.length > 0 && <ListCard title="לא כאן עכשיו" aria-label="לא כאן עכשיו"><RadioGroupRows>{away.map(row)}</RadioGroupRows></ListCard>}
    </AppScreen>
  );
}
const RadioGroupRows = ({ children }: { children: ReactNode }) => <>{children}</>;

// ---------- C6 ----------
export function DonePhotoScreen({ ctx, params }: ScreenProps) {
  const r = useTaskV2(params.id, ctx);
  const fail = useFail(); const toast = useToast();
  const [shot, setShot] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const photo = usePhotoPicker(setShot);
  const t = r.item as Task | null;
  if (!t) return r.loading ? <Loading /> : <Missing backTo="/tasks" label="משימות" />;
  const save = async () => {
    setBusy(true);
    try {
      await doneWithPhoto(ctx.actor, t, shot, note);
      toast.show({ text: `בוצע: ${t.title}` });
      go('/tasks', true);
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow icon="check" disabled={busy || photo.busy} onClick={save}>שמירה וסיום</Button></BottomBar>}>
      {photo.input}
      <FormHeader title="בוצע, עם צילום" onCancel={() => back(`/tasks/${t.id}`)} />
      <span className="tasks-c6-title">{t.title}</span>
      <button type="button" className="tasks-shot" aria-label={shot ? 'התמונה שצולמה. לצלם שוב' : 'צילום'} onClick={() => photo.pick(true)} style={{ font: 'inherit', cursor: 'pointer' }}>
        {shot ? <img src={shot} alt="" /> : <><Icon name="camera" size={36} />התמונה שצולמה</>}
      </button>
      <div className="tasks-btnrow">
        <Button variant="outline" size="tall" icon="camera" iconSize={18} onClick={() => photo.pick(true)}>לצלם שוב</Button>
        <Button variant="outline" size="tall" onClick={() => photo.pick(false)}>מהגלריה</Button>
      </div>
      <Field label="משהו לציין? לא חובה" placeholder="למשל: חסר מברג פיליפס" value={note} onChange={(e) => setNote(e.target.value)} />
    </AppScreen>
  );
}
