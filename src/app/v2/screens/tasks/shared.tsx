// Shared parts of the tasks area: in-app links, the X1 failure handler, the task row, the capture bar and photo picking.
import { useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { go, useToast, useV2 } from '../../core';
import { Row, CheckButton, Tag, Button, CaptureBar, Sheet, ListCard, Avatar, IconTile, type SwipeAction } from '../../kit';
import { href as appHref } from '../../../router';
import { isConflict } from '../../../db';
import { nowMs, now } from '../../../clock';
import { firstName, hhmm } from '../../format';
import { isFemale } from '../../gender';
import { compressPhoto } from '../../../store';
import { storePhoto, type FileKind } from '../../../upload';
import type { Actor, Task } from '../../../types';
import { useDemo } from '../../../demo/store';
import {
  rowMeta, stripPlace, setDone, takeTask, releaseTask, takenText, playTakenInDemo, routineTime, assignTask, deleteTaskLater,
  canAssignTo, canDeleteTask, presenceOf, usePresenceToday, type RowView, type ProfileOf,
} from '../../data/tasks';

/** Props for an in-app link: a real href (long-press, new tab) that navigates inside the SPA. */
export const to = (path: string) => ({
  href: appHref(path),
  onClick: (e: MouseEvent<HTMLElement>) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(path); },
});

/** X1 on a conflict (with its own text when the action gave one), the error text otherwise. */
export function useFail() {
  const toast = useToast();
  return (e: unknown) => {
    const msg = (e as Error)?.message || '';
    if (isConflict(e)) toast.refused(msg.startsWith('לא נשמר.') ? msg : undefined);
    else toast.refused(`לא נשמר. ${msg}`.trim());
  };
}

/** The team's profile for an actor (explicit gender wins over the name guess). */
export function useProfileOf(): ProfileOf {
  const ctx = useV2();
  return (uid: string) => ctx.team.find((p) => p.uid === uid);
}

// Tasks ticked in this session stay struck through in their place on the root (T4); other done tasks leave the lists.
const SESSION_KEY = 'v2-tasks-done-here';
const readKept = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')); } catch { return new Set(); } };
let kept = readKept();
const keptListeners = new Set<() => void>();
const keep = (id: string, on: boolean) => {
  kept = new Set(kept); if (on) kept.add(id); else kept.delete(id);
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...kept])); } catch { /* blocked */ }
  keptListeners.forEach((l) => l());
};
export const useDoneHere = () => useSyncExternalStore((l) => { keptListeners.add(l); return () => keptListeners.delete(l); }, () => kept);

/** Done / take with the T4 toast ("בוצע: …" with צילום and ביטול) and X1 on conflict. */
export function useTaskActions() {
  const ctx = useV2(); const toast = useToast(); const fail = useFail(); const demo = useDemo(); const profileOf = useProfileOf();
  const done = async (t: Task, placeName?: string) => {
    try {
      keep(t.id, true);
      await setDone(ctx.actor, t, true);
      toast.show({
        text: `בוצע: ${stripPlace(t.title, placeName || t.location?.placeName)}`,
        actions: [
          { label: 'צילום', onClick: () => go(`/tasks/${t.id}/done`) },
          { label: 'ביטול', onClick: () => { setDone(ctx.actor, { ...t, done: true }, false).catch(fail); } },
        ],
      });
    } catch (e) { fail(e); }
  };
  const undo = (t: Task) => setDone(ctx.actor, t, false).catch(fail);
  // the old take toast: "עליך: …" with ביטול (back to free)
  const take = (t: Task) => takeTask(ctx.actor, t).then(() => {
    toast.show({ text: `עליך: ${t.title}`, actions: [{ label: 'ביטול', onClick: () => { releaseTask(ctx.actor, { ...t, assignee: ctx.actor }, ctx.manager).catch(fail); } }] });
  }, async (e: unknown) => {
    let by = (e as { by?: Actor }).by;
    // demo refuseNext refuses before anyone is known: play out a teammate (Noa) taking it first, as X1 shows
    if (!by && demo.on && isConflict(e)) {
      const mate = ctx.team.find((p) => p.uid === 'demo-u-noa') || ctx.team.find((p) => p.uid !== ctx.user.uid && p.status === 'active');
      if (mate) { by = { uid: mate.uid, name: mate.displayName }; await playTakenInDemo(t, by).catch(() => {}); }
    }
    if (by && isConflict(e)) toast.refused(takenText(by, profileOf));
    else fail(e);
  });
  // the owner's swipe: put it on me, on someone else (or free), or delete it; each with "ביטול"
  const moveTo = (t: Task, to: Actor | null) => {
    const prev = t.assignee || null;
    return assignTask(ctx.actor, t, to, prev?.uid || null).then(() => {
      const text = !to ? `פנויה: ${t.title}` : to.uid === ctx.actor.uid ? `עליך: ${t.title}` : `הועברה ל${firstName(to.name)}: ${t.title}`;
      toast.show({ text, actions: [{ label: 'ביטול', onClick: () => { assignTask(ctx.actor, { ...t, assignee: to }, prev, to?.uid || null).catch(fail); } }] });
    }, fail);
  };
  const toMe = (t: Task) => moveTo(t, ctx.actor);
  const remove = (t: Task) => {
    const undoDelete = deleteTaskLater(ctx.actor, t, ctx.templates);
    toast.show({ text: `נמחקה: ${t.title}`, check: false, duration: 6000, actions: [{ label: 'ביטול', onClick: undoDelete }] });
  };
  return { done, undo, take, moveTo, toMe, remove };
}

/** One task row on the roots: check, title (place stripped under a place header), tags, meta and "לקחת" for free tasks. */
export function TaskRow({ t, view, placeName, strip, extraTags }: { t: Task; view: RowView; placeName?: string; strip?: boolean; extraTags?: ReactNode }) {
  const ctx = useV2(); const a = useTaskActions(); const profileOf = useProfileOf();
  const uid = ctx.user.uid;
  const title = strip ? stripPlace(t.title, placeName) : t.title;
  const mine = !t.done && t.assignee?.uid === uid;
  // rule 4: at most one status tag, the most pressing one
  const tags = t.urgent && !t.done ? <Tag tone="urgent">דחוף</Tag>
    : mine && view !== 'mine' ? <Tag tone="outline">שלך</Tag>
    : t.managersOnly ? <Tag tone="warm">מנהלים</Tag>
    : extraTags;
  // owners only: swipe right to finish or take it, left to move it on or delete it (the first button sits at the edge)
  const [moving, setMoving] = useState(false);
  const swipe = ctx.role === 'owner' ? {
    right: t.done
      ? [{ label: 'להחזיר', icon: 'back', tone: 'done', onAction: () => a.undo(t) } as SwipeAction]
      : [
        { label: 'בוצע', icon: 'check', tone: 'done', onAction: () => a.done(t, placeName) } as SwipeAction,
        ...(!mine && canAssignTo(t, uid, ctx.manager, uid) ? [{ label: 'אליי', icon: 'user', tone: 'action', onAction: () => a.toMe(t) } as SwipeAction] : []),
      ],
    left: [
      ...(canDeleteTask(t, uid, ctx.manager) ? [{ label: 'מחיקה', icon: 'close', tone: 'danger', onAction: () => a.remove(t) } as SwipeAction] : []),
      ...(!t.done ? [{ label: 'העברה', icon: 'people', tone: 'neutral', onAction: () => setMoving(true) } as SwipeAction] : []),
    ],
  } : undefined;
  return (
    <>
    <Row swipe={swipe}
      check={<CheckButton checked={t.done} onChange={(v) => (v ? a.done(t, placeName) : a.undo(t))} label={`סימון בוצע: ${title}`} />}
      title={title} tags={tags} done={t.done}
      meta={rowMeta(t, { uid, view, today: ctx.today, now: nowMs(), profileOf, time: routineTime(t, ctx.templates) })}
      {...to(`/tasks/${t.id}`)} chevron={false}
      actions={!t.done && !t.assignee ? <Button variant="outline" onClick={() => a.take(t)}>לקחת</Button> : undefined}
    />
    {/* the sheet leaves the list (a row sits inside a <ul>) */}
    {moving && createPortal(<MoveSheet t={t} title={title} onClose={() => setMoving(false)} onPick={(to) => { setMoving(false); a.moveTo(t, to); }} />, document.body)}
    </>
  );
}

/** The swipe's "העברה": who takes the task, those at the farm now first. Mounted only while open (one presence read). */
function MoveSheet({ t, title, onClose, onPick }: { t: Task; title: string; onClose: () => void; onPick: (to: Actor | null) => void }) {
  const ctx = useV2();
  const presence = usePresenceToday(ctx.today);
  const uid = ctx.user.uid;
  const current = t.assignee?.uid || null;
  const nowHHMM = hhmm(now());
  const people = ctx.team
    .filter((p) => p.status === 'active' && ['owner', 'manager', 'staff'].includes(p.role) && canAssignTo(t, uid, ctx.manager, p.uid))
    .map((p) => ({ p, st: presenceOf(presence.items.filter((c) => c.ownerUid === p.uid), nowHHMM, isFemale(p.displayName, p)) }))
    .sort((x, y) => x.st.order - y.st.order || Number(x.p.uid === uid) - Number(y.p.uid === uid) || x.p.displayName.localeCompare(y.p.displayName, 'he'));
  return (
    <Sheet open onClose={onClose} title="להעביר את המשימה">
      <div className="tasks-move">
        <p className="tasks-move__task">{title}</p>
        <ListCard aria-label="על מי">
          {current && canAssignTo(t, uid, ctx.manager, null) && (
            <Row leading={<IconTile icon="people" />} title="פנויה" meta="מי שיכול לוקח" onClick={() => onPick(null)} chevron={false} />
          )}
          {people.map(({ p, st }) => (
            <Row key={p.uid} leading={<Avatar name={p.displayName} size={36} tone={p.uid === uid ? 'me' : 'default'} />}
              title={p.uid === uid ? 'אני' : p.displayName} meta={st.text} muted={!st.here && p.uid !== uid}
              tags={p.uid === current ? <Tag tone="outline">{isFemale(p.displayName, p) ? 'עליה עכשיו' : 'עליו עכשיו'}</Tag> : undefined}
              onClick={p.uid === current ? undefined : () => onPick({ uid: p.uid, name: p.displayName })} chevron={false} />
          ))}
        </ListCard>
      </div>
    </Sheet>
  );
}

/** A hidden file input: pick(capture?) opens the camera or the gallery and resolves with the stored photo's link
 *  (R2 through the Worker), or with the compressed data URL when it could not be stored (demo, offline). */
export function usePhotoPicker(onPhoto: (url: string) => void, kind: FileKind = 'task') {
  const ref = useRef<HTMLInputElement>(null);
  const fail = useFail(); const [busy, setBusy] = useState(false);
  const input = (
    <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      setBusy(true);
      try { onPhoto(await storePhoto(await compressPhoto(f), kind)); } catch (err) { fail(err); } finally { setBusy(false); }
    }} />
  );
  const pick = (camera: boolean) => {
    const el = ref.current; if (!el) return;
    if (camera) el.setAttribute('capture', 'environment'); else el.removeAttribute('capture');
    el.click();
  };
  return { input, pick, busy };
}

const PHOTO_KEY = 'v2-capture-photo';
/** A photo taken from the capture bar waits here until the add form opens. */
export const stashPhoto = (p: string) => { try { sessionStorage.setItem(PHOTO_KEY, p); } catch { /* full or blocked */ } };
export const takeStashedPhoto = () => { try { const p = sessionStorage.getItem(PHOTO_KEY) || ''; sessionStorage.removeItem(PHOTO_KEY); return p; } catch { return ''; } };

type Speech = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void };
/** Hebrew dictation (Web Speech) where the browser has it; silently nothing elsewhere. */
export function dictate(onText: (said: string) => void) {
  const W = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) return false;
  try {
    const r = new SR(); r.lang = 'he-IL'; r.interimResults = false;
    let said = '';
    r.onresult = (e) => { said = Array.from(e.results).map((x) => x[0].transcript).join(' '); };
    r.onerror = () => {};
    r.onend = () => { if (said.trim()) onText(said.trim()); };
    r.start();
    return true;
  } catch { return false; }
}
/** "משימה או קנייה חדשה": typing opens the add form with the text; camera picks a photo first (&photo=1); the mic opens
 *  the form listening (&mic=1). Same parameters as the S1 capture bar. */
export function TasksCapture({ kind }: { kind?: 'shopping' }) {
  const [value, setValue] = useState('');
  const open = (text: string, extra?: 'photo' | 'mic') => {
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    if (text.trim()) q.set('text', text.trim());
    if (extra) q.set(extra, '1');
    setValue('');
    go('/new' + (q.toString() ? '?' + q.toString() : ''));
  };
  const photo = usePhotoPicker((p) => { stashPhoto(p); open(value, 'photo'); });
  return <>
    {photo.input}
    <CaptureBar value={value} onChange={setValue} onSubmit={(v) => open(v)} onCamera={() => photo.pick(true)} onMic={() => open(value, 'mic')} />
  </>;
}
