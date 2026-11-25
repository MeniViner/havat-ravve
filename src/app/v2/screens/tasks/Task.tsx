// T3 (task), C3 (task with links), C4 (who the task is on) and C6 (done with a photo).
import { useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, mapsUrl, useExternal, useRemove, useToast } from '../../core';
import {
  TopBar, PageTitle, FormHeader, Button, DetailList, DetailRow, Card, SectionHeader, SectionTitle, Stack, History, BottomBar,
  Avatar, IconTile, Icon, SearchField, RadioList, RadioRow, ListCard, Field, EmptyState, Tag, Inline, TextAreaField, MoreMenu,
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
  setTaskPhoto, doneWithPhoto, presenceOf, loadText, isForToday, setDone, setDoneDetails, isRoutine, routineTime, canEditTask,
  canAssignTo, canMoveOthers, canDeleteTask, deleteTaskV2, gwA,
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

/** ⋯ → "מחיקה" → Q8 (rule 6). A recurring day's instance: only today's is deleted. */
export function deleteItem(t: Task, allowed: boolean, onConfirm: () => unknown) {
  return {
    label: 'מחיקה', icon: 'trash' as const, tone: 'danger' as const, hidden: !allowed,
    confirm: {
      title: 'למחוק את המשימה?',
      text: t.templateId ? `רק המשימה של היום תימחק. "${t.title}" תמשיך לחזור בימים הבאים.` : `"${t.title}" תימחק מהרשימה של כולם.`,
      onConfirm,
    },
  };
}

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
  // after done (old T3): add or replace the photo of what was done, add or edit the note
  const donePhoto = usePhotoPicker((p) => { if (t) setDoneDetails(ctx.actor, t, { donePhoto: p }).then(() => toast.show({ text: 'התמונה נשמרה' })).catch(fail); });
  const [note, setNote] = useState<string | null>(null);
  const remove = useRemove();
  if (!t) return r.loading ? <Loading /> : <Missing backTo="/tasks" label="משימות" />;

  const uid = ctx.user.uid;
  const linked = !!(t.eventId || t.shoppingId);
  const mine = t.assignee?.uid === uid;
  const req = requesterOf(t);
  const lines = timeline(t, acts.items, dayTime, (u) => ctx.team.find((p) => p.uid === u));
  // the small-additions table: a note or photo added after done is a line in the timeline
  const history: ReactNode[] = [
    ...lines,
    ...(t.done && t.doneNote ? [<span key="dn" className="tasks-tl-note">{`נכתב: ${t.doneNote}`}</span>] : []),
    ...(t.done && t.donePhoto ? [<img key="dp" className="tasks-tl-photo" src={t.donePhoto} alt={`תמונה מהביצוע: ${t.title}`} />] : []),
  ];
  const routine = isRoutine(t);
  const time = routineTime(t, ctx.templates);
  // the small-additions table: the tags sit beside the title as kit tags
  const headTags = [t.urgent && <Tag key="u" tone="urgent">דחוף</Tag>, routine && <Tag key="r">שגרה יומית</Tag>, t.managersOnly && <Tag key="m" tone="warm">מנהלים בלבד</Tag>].filter(Boolean);
  // a manager or the creator may put a free task on anyone (C4 offers only what the rules allow, "אני" included)
  const moveBtn = <Button variant="outline" style={{ padding: '0 12px' }} {...to(`/tasks/${t.id}/assign`)}>להעביר</Button>;
  const saveNote = async () => {
    try { await setDoneDetails(ctx.actor, t, { doneNote: note || '' }); setNote(null); toast.show({ text: 'נשמר' }); } catch (e) { fail(e); }
  };
  const navBtn = t.location ? <Button variant="outline" icon="nav" iconSize={16} style={{ padding: '0 12px' }} onClick={() => external(mapsUrl(t.location!.lat, t.location!.lng))}>ניווט</Button> : undefined;

  let who: ReactNode; let whoAction: ReactNode;
  if (t.done) who = t.assignee ? (mine ? 'עליך' : t.assignee.name) : 'פנויה';
  else if (mine) { who = 'עליך'; whoAction = <Button variant="outline" style={{ padding: '0 12px' }} onClick={() => releaseTask(ctx.actor, t, ctx.manager).catch(fail)}>לשחרר</Button>; }
  else if (!t.assignee) {
    // rule 4 (plan row 35): "לקחת" is the row's one button; whoever may hand it to someone else opens C4 from "פנויה"
    who = canMoveOthers(t, uid, ctx.manager)
      ? <a className="tasks-who" aria-label="פנויה. להעביר למישהו" {...to(`/tasks/${t.id}/assign`)}>פנויה<span className="tasks-who__chev" aria-hidden="true"><Icon name="chevron" size={18} /></span></a>
      : 'פנויה';
    whoAction = <Button variant="outline" style={{ padding: '0 12px' }} onClick={() => a.take(t)}>לקחת</Button>;
  }
  else {
    who = <a className="tasks-who" {...to(`/people/${t.assignee.uid}`)}><Avatar name={t.assignee.name} size={28} />{t.assignee.name}</a>;
    whoAction = canMoveOthers(t, uid, ctx.manager) ? moveBtn : undefined;
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
      {/* rule 5: back and one control. "עריכה" for a manager or the creator (delete is behind ⋯ in the edit form);
          a routine instance cannot be edited, so whoever may delete today's instance gets ⋯ here instead */}
      <TopBar back={{ label: 'משימות', onClick: (e) => { e.preventDefault(); back('/tasks'); }, href: appHref('/tasks') }}
        end={canEditTask(t, uid, ctx.manager)
          ? <Button variant="outline" icon="edit" iconSize={16} {...to(`/tasks/${t.id}/edit`)}>עריכה</Button>
          : <MoreMenu title="משימה" items={[deleteItem(t, canDeleteTask(t, uid, ctx.manager),() => remove(() => deleteTaskV2(ctx.actor, t, ctx.templates), { text: 'המשימה נמחקה', after: () => go('/tasks', true) }))]} />} />
      <div className="tasks-titlerow">
        <PageTitle size="detail">{t.title}</PageTitle>
        {headTags}
      </div>
      <DetailList className={linked ? "tasks-dl-linked" : undefined}>
        <DetailRow term="על מי" action={whoAction}>{who}</DetailRow>
        {t.location && !linked && <DetailRow term="איפה" action={navBtn}>{t.location.placeName || 'נקודה על המפה'}</DetailRow>}
        {t.dueDate && <DetailRow term="עד מתי">{routine && time ? `${dueLong(t.dueDate, ctx.today)}, עד ${time}` : dueLong(t.dueDate, ctx.today)}</DetailRow>}
        {!routine && req.name && <DetailRow term={gwA(req, "ביקש", "ביקשה", (u) => ctx.team.find((p) => p.uid === u))}>{`${req.name} · ${askedWhen(t.createdAt)}`}</DetailRow>}
        {t.note && <DetailRow term="הערה" plain>{t.note}</DetailRow>}
        {t.done && <DetailRow term="בוצע">{[t.doneBy ? firstName(t.doneBy.name) : '', t.doneAt ? dayTime(t.doneAt) : ''].filter(Boolean).join(' · ')}</DetailRow>}
      </DetailList>
      {t.done && donePhoto.input}
      {t.done && (note === null ? (
        <Inline gap={8}>
          <Button variant="dashed" size="tall" grow icon="camera" iconSize={18} disabled={donePhoto.busy} onClick={() => donePhoto.pick(true)}>{t.donePhoto ? 'להחליף תמונה' : 'להוסיף תמונה'}</Button>
          <Button variant="dashed" size="tall" grow onClick={() => setNote(t.doneNote || '')}>{t.doneNote ? 'לערוך הערה' : 'להוסיף הערה'}</Button>
        </Inline>
      ) : (
        <Stack gap={8}>
          <TextAreaField label="הערה על מה שנעשה" autoFocus maxLength={2000} placeholder="איפה הנחתי, מה חסר, מה נשאר…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Inline gap={8}>
            <Button size="tall" grow onClick={saveNote}>שמירה</Button>
            <Button variant="quiet" size="tall" onClick={() => setNote(null)}>ביטול</Button>
          </Inline>
        </Stack>
      ))}
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
      {history.length > 0 && (
        <Stack gap={4} as="section">
          <SectionTitle>מה קרה עד עכשיו</SectionTitle>
          <History items={history} />
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
  // only the choices the tasks rule allows this user (canAssignTo): a manager or the creator anyone; others take a free task
  // for themselves, or hand on / release their own. The current person stays listed (no change).
  const people = ctx.team.filter((p) => p.status === 'active' && canAssignTo(t, uid, ctx.manager, p.uid) && (!q.trim() || p.displayName.includes(q.trim())));
  const canFree = canAssignTo(t, uid, ctx.manager, null);
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
      {canFree && (
        <RadioList label="על מי">
          <RadioRow checked={sel === null} onSelect={() => setPick(null)} leading={<IconTile icon="people" />} title="פנויה" meta="מי שיכול לוקח" />
        </RadioList>
      )}
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
