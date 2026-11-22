// T5 (add a task) and S5 (add a shopping item) in one form, plus edit mode for both (/tasks/:id/edit, /shopping/:id/edit).
// The capture bars open it with ?text=, ?photo=1 or ?camera=1 (a camera shot), ?mic=1 and, from shopping, ?kind=shopping&list=; C3 opens it with ?kind=shopping&task=<id>.
import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useRemove, useToast } from '../../core';
import {
  FormHeader, BigTextInput, Segmented, ChoiceGroup, Button, BottomBar, Inline, Field, TextAreaField, Card, Toggle, EmptyState, ConfirmSheet, AddChip,
} from '../../kit';
import { back, param } from '../../../router';
import { getPosition } from '../../../store';
import { useAllEvents } from '../../../data';
import { nowIso } from '../../../clock';
import { dayName, ddmm } from '../../format';
import type { Actor, ShoppingCategory, ShoppingItem, Task, TaskLocation } from '../../../types';
import {
  useTaskV2, useShoppingDoc, parseShopping, parseTaskText, guessKind, suggestPlace, nearestPlace, endOfWeek, addDays,
  createTask, updateTask, createShopping, updateShopping, SHOP_LISTS, canDeleteTask, canEditTask, deleteTaskV2, type TaskInput,
} from '../../data/tasks';
import { catOfKey, suggestions, useShopping, SUGGESTED } from '../../data/shopping';
import { useFail, usePhotoPicker, takeStashedPhoto, dictate } from './shared';
import './tasks.css';

type Kind = 'task' | 'shopping';
type Where = '' | 'sug' | 'here' | 'other';
type Who = 'free' | 'me' | 'other';
type When = 'today' | 'tomorrow' | 'week' | 'none' | 'date';
const WHEN: { value: When; label: string }[] = [{ value: 'today', label: 'היום' }, { value: 'tomorrow', label: 'מחר' }, { value: 'week', label: 'השבוע' }, { value: 'none', label: 'בלי תאריך' }];
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function AddScreen(p: ScreenProps) {
  const shopEdit = typeof location !== 'undefined' && /\/shopping\/[^/]+\/edit/.test(location.pathname);
  const taskEdit = !shopEdit && !!p.params.id;
  const task = useTaskV2(taskEdit ? p.params.id : '', p.ctx);
  const item = useShoppingDoc(shopEdit ? p.params.id : '');
  // editing is for a manager or the creator of a task that is not a routine instance (old T3): others go back to the task
  const refused = !!task.item && !canEditTask(task.item, p.ctx.user.uid, p.ctx.manager);
  useEffect(() => { if (refused) go(`/tasks/${p.params.id}`, true); }, [refused]); // eslint-disable-line react-hooks/exhaustive-deps
  if (taskEdit && !task.item) return task.loading ? <AppScreen variant="form"><div /></AppScreen> : <NotFound />;
  if (refused) return <AppScreen variant="form"><div /></AppScreen>;
  if (shopEdit && !item.item) return item.loading ? <AppScreen variant="form"><div /></AppScreen> : <NotFound />;
  return <AddForm {...p} task={taskEdit ? task.item : null} item={shopEdit ? (item.item as ShoppingItem) : null} />;
}
const NotFound = () => (
  <AppScreen variant="form">
    <FormHeader title="עריכה" onCancel={() => back('/tasks')} />
    <EmptyState variant="card" title="הפריט לא נמצא" text="אולי נמחק בינתיים" />
  </AppScreen>
);

function AddForm({ ctx, task, item }: ScreenProps & { task: Task | null; item: ShoppingItem | null }) {
  const toast = useToast(); const fail = useFail();
  const editing = !!(task || item);
  const forTask = param('task');
  const initialText = task?.title ?? item?.title ?? param('text');
  const [text, setText] = useState(initialText);
  const [kind, setKind] = useState<Kind>(item ? 'shopping' : task ? 'task' : param('kind') === 'shopping' ? 'shopping' : initialText ? guessKind(initialText) : 'task');
  const [photo, setPhoto] = useState(() => task?.photo ?? item?.photo ?? (param('photo') || param('camera') ? takeStashedPhoto() : ''));
  const [note, setNote] = useState(task?.note ?? item?.note ?? '');
  const [showNote, setShowNote] = useState(!!(task?.note || item?.note));
  const [urgent, setUrgent] = useState<boolean | null>(task ? task.urgent : item ? item.urgent : null);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();

  // ---- task fields
  const sugId = useMemo(() => suggestPlace(text, ctx.places), [text, ctx.places]);
  const [where, setWhere] = useState<Where>(task?.location ? 'other' : 'sug');
  const [otherPlace, setOtherPlace] = useState(task?.location?.placeId || '');
  const [herePos, setHerePos] = useState<TaskLocation | null>(null);
  const [who, setWho] = useState<Who>(!task?.assignee ? 'free' : task.assignee.uid === ctx.user.uid ? 'me' : 'other');
  const [otherWho, setOtherWho] = useState(task?.assignee && task.assignee.uid !== ctx.user.uid ? task.assignee.uid : '');
  // an edit keeps the stored date as it is (an overdue one too) unless the user picks another
  const [when, setWhen] = useState<When>(() => {
    const d = task?.dueDate || '';
    return !d ? 'none' : d === ctx.today ? 'today' : d === addDays(ctx.today, 1) ? 'tomorrow' : d === endOfWeek(ctx.today) && d > addDays(ctx.today, 1) ? 'week' : 'date';
  });
  const [date, setDate] = useState(() => task?.dueDate && isDay(task.dueDate) ? task.dueDate : addDays(ctx.today, 2));
  // "לאיזה אירוע" (old T5): prefilled from ?event=; upcoming and running events, soonest first; a past event stays listed only
  // when the task is already linked to it
  const [eventId, setEventId] = useState(task ? task.eventId || '' : param('event'));
  const allEvents = useAllEvents(!item);
  const eventOptions = useMemo(() => {
    const now = nowIso();
    return allEvents.items.filter((e) => (e.end || e.start) >= now || e.id === eventId).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [allEvents.items, eventId]);
  const [managersOnly, setManagersOnly] = useState(!!task?.managersOnly);

  // ---- shopping fields (derived from the text until touched)
  const parsed = parseShopping(text);
  const [list, setList] = useState<ShoppingCategory | null>(item?.category ?? (param('list') ? catOfKey(param('list')) : null));
  const [qty, setQty] = useState<string | null>(item ? item.qty : null);
  const [link, setLink] = useState(item?.link ?? '');
  const [showLink, setShowLink] = useState(!!item?.link);
  const listNow: ShoppingCategory = list ?? parsed.category ?? 'super';
  // "קונים בדרך כלל" in the add form too (old S5): the list's usual items, a tap fills the text
  const shop = useShopping(kind === 'shopping' && !item);
  const usual = useMemo(() => (kind === 'shopping' && !item ? suggestions(shop.history, shop.open, listNow, SUGGESTED) : []), [kind, item, shop.history, shop.open, listNow]);
  const qtyNow = qty ?? parsed.qty;
  const urgentNow = urgent ?? (kind === 'shopping' ? parsed.urgent : parseTaskText(text).urgent);

  const pick = usePhotoPicker(setPhoto);
  // the capture bars' mic (?mic=1): dictate into the text right away where the browser allows it
  // the S1 camera (?photo=1) comes without a stashed shot: open the camera (the browser may want a tap on "תמונה")
  useEffect(() => { if ((param('photo') || param('camera')) && !photo && !editing) pick.pick(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (param('mic') && !editing) dictate((said) => setText((t) => (t ? t + ' ' : '') + said)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (where === 'sug' && !sugId && !task) setWhere(''); else if (where === '' && sugId && !task) setWhere('sug'); }, [sugId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sugPlace = ctx.places.find((x) => x.id === sugId);
  const placeOptions = [
    ...(sugPlace ? [{ value: 'sug' as Where, label: sugPlace.name }] : []),
    { value: 'here' as Where, label: herePos?.placeName ? `כאן: ${herePos.placeName}` : 'כאן, לפי המיקום שלי' },
    { value: 'other' as Where, label: 'אחר' },
  ];
  const people = ctx.team.filter((x) => x.status === 'active' && x.uid !== ctx.user.uid);

  const chooseWhere = async (v: Where) => {
    if (v === where) { setWhere(''); return; }
    setWhere(v);
    if (v === 'here') {
      try {
        const pos = await getPosition();
        const near = nearestPlace(pos, ctx.places);
        setHerePos(near ? { lat: near.lat, lng: near.lng, placeId: near.id, placeName: near.name } : { lat: pos.lat, lng: pos.lng });
      } catch (e) { setWhere(''); fail(e); }
    }
  };
  const locationNow = (): TaskLocation | null => {
    if (where === 'sug' && sugPlace) return { lat: sugPlace.lat, lng: sugPlace.lng, placeId: sugPlace.id, placeName: sugPlace.name };
    if (where === 'here') return herePos;
    if (where === 'other') {
      const pl = ctx.places.find((x) => x.id === otherPlace);
      if (pl) return { lat: pl.lat, lng: pl.lng, placeId: pl.id, placeName: pl.name };
      return task?.location && !task.location.placeId ? task.location : null;
    }
    return null;
  };
  const assigneeNow = (): Actor | null => {
    if (who === 'me') return ctx.actor;
    if (who === 'other') { const x = ctx.team.find((y) => y.uid === otherWho); return x ? { uid: x.uid, name: x.displayName } : null; }
    return null;
  };
  const dueNow = () => (when === 'today' ? ctx.today : when === 'tomorrow' ? addDays(ctx.today, 1) : when === 'week' ? (task?.dueDate && task.dueDate > addDays(ctx.today, 1) ? task.dueDate : endOfWeek(ctx.today)) : when === 'date' ? date : '');

  // the event stays: several tasks for one event are added in a row (old form)
  const reset = () => { setText(''); setPhoto(''); setNote(''); setShowNote(false); setUrgent(null); setQty(null); setList(null); setLink(''); setShowLink(false); setWhere(''); setWho('free'); setWhen('none'); };
  const submit = async (more: boolean) => {
    if (!text.trim() || busy) return;
    if (kind === 'task' && who === 'other' && !otherWho) { toast.refused('לא נשמר. בחרו על מי המשימה'); return; }
    setBusy(true);
    try {
      if (kind === 'task') {
        const { title } = parseTaskText(text);
        const data: TaskInput = { title, note: note.trim(), photo, location: locationNow(), dueDate: dueNow(), managersOnly: ctx.manager && managersOnly, assignee: assigneeNow(), urgent: urgentNow,
          // sent only when it changes: an older task has no eventId at all (as the old form)
          ...(eventId !== (task?.eventId || '') ? { eventId } : {}) };
        if (task) { await updateTask(ctx.actor, task, data); toast.show({ text: 'נשמר' }); back(`/tasks/${task.id}`); return; }
        await createTask(ctx.actor, data);
        toast.show({ text: `נוספה משימה: ${title}` });
      } else {
        const title = item ? text.trim() : parsed.title || text.trim();
        const data = { title, qty: qtyNow, note, link, category: listNow, urgent: urgentNow, photo };
        if (item) { await updateShopping(ctx.actor, item, data); toast.show({ text: 'נשמר' }); back(`/shopping/${item.id}`); return; }
        await createShopping(ctx.actor, data, ctx.team, forTask || undefined);
        toast.show({ text: `נוסף ל${SHOP_LISTS.find((l) => l.id === listNow)?.label}: ${title}` });
      }
      if (more) { reset(); setBusy(false); return; }
      back(kind === 'task' ? '/tasks' : forTask ? `/tasks/${forTask}` : '/shopping');
    } catch (e) { fail(e); setBusy(false); }
  };

  const listLabel = SHOP_LISTS.find((l) => l.id === listNow)?.label || '';
  const bar = (
    <BottomBar column={!editing}>
      <Button size="bar" block disabled={!text.trim() || busy} onClick={() => submit(false)}>
        {editing ? 'שמירה' : kind === 'task' ? 'הוספת משימה' : `הוספה ל${listLabel}`}
      </Button>
      {!editing && <Button variant="link" disabled={!text.trim() || busy} onClick={() => submit(true)}>{kind === 'task' ? 'הוספה, ועוד אחת' : 'הוספה, ועוד פריט'}</Button>}
    </BottomBar>
  );
  const extras = (
    <>
      {photo && <img className="tasks-photo-thumb" src={photo} alt="התמונה שנבחרה" />}
      {showNote && <TextAreaField label="הערה" value={note} onChange={(e) => setNote(e.target.value)} />}
      {showLink && kind === 'shopping' && <Field label="קישור" ltr type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />}
    </>
  );
  return (
    <AppScreen variant="form" bar={bar}>
      {pick.input}
      <FormHeader title={editing ? 'עריכה' : 'הוספה'} onCancel={() => back(task ? `/tasks/${task.id}` : item ? `/shopping/${item.id}` : '/tasks')} />
      <BigTextInput label={kind === 'task' ? 'מה צריך לעשות' : 'מה צריך לקנות'} value={text} onChange={(e) => setText(e.target.value)} autoFocus={!initialText} />
      {!editing && <Segmented label="סוג" size="lg" value={kind} onChange={setKind} options={[{ value: 'task', label: 'משימה' }, { value: 'shopping', label: 'קנייה' }]} />}

      {kind === 'task' ? (
        <>
          <ChoiceGroup label="איפה" value={where} onChange={chooseWhere} options={placeOptions} />
          {where === 'other' && (
            <ChoiceGroup label="באיזה מקום" value={otherPlace} onChange={setOtherPlace} options={ctx.places.map((x) => ({ value: x.id, label: x.name }))} />
          )}
          <ChoiceGroup label="על מי" value={who} onChange={setWho} options={[{ value: 'free', label: 'פנויה' }, { value: 'me', label: 'עליי' }, { value: 'other', label: 'מישהו אחר' }]} />
          {who === 'other' && <ChoiceGroup label="מי" value={otherWho} onChange={setOtherWho} options={people.map((x) => ({ value: x.uid, label: x.displayName }))} />}
          <ChoiceGroup label="מתי" value={when} onChange={setWhen}
            options={[...WHEN, { value: 'date', label: when === 'date' && isDay(date) ? `${dayName(date)} ${ddmm(date)}` : 'תאריך' }]} />
          {when === 'date' && (
            <Field label="באיזה תאריך?" type="date" ltr min={date < ctx.today ? undefined : ctx.today} value={date}
              onChange={(e) => { if (isDay(e.target.value)) setDate(e.target.value); }} />
          )}
          {(eventOptions.length > 0 || eventId) && (
            <ChoiceGroup label="לאיזה אירוע?" value={eventId} onChange={setEventId}
              options={[{ value: '', label: 'לא קשור לאירוע' },
                ...eventOptions.map((e) => ({ value: e.id, label: e.start ? `${e.title} · ${dayName(e.start)} ${ddmm(e.start)}` : e.title })),
                ...(eventId && !eventOptions.some((e) => e.id === eventId) ? [{ value: eventId, label: allEvents.loading ? 'טוען…' : 'אירוע שנמחק' }] : [])]} />
          )}
          <Inline gap={8}>
            <Button variant="neutral" size="tall" grow icon="camera" iconSize={20} disabled={pick.busy} onClick={() => (photo ? setPhoto('') : pick.pick(true))}>{photo ? 'בלי תמונה' : 'תמונה'}</Button>
            <Button variant="neutral" size="tall" grow aria-pressed={showNote} onClick={() => setShowNote(!showNote)}>הערה</Button>
            <Button variant={urgentNow ? 'secondary' : 'neutral'} size="tall" grow aria-pressed={urgentNow} onClick={() => setUrgent(!urgentNow)}>דחוף</Button>
          </Inline>
          {ctx.manager && (
            <Card pad="md" layout="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>רק מנהלים רואים</span>
              <Toggle checked={managersOnly} onChange={setManagersOnly} label="רק מנהלים רואים" />
            </Card>
          )}
          {extras}
          {task && canDeleteTask(task, ctx.user.uid, ctx.manager) && (
            <Button variant="danger" size="tall" className="tasks-delete" onClick={() => setAskDelete(true)}>מחיקת המשימה</Button>
          )}
        </>
      ) : (
        <>
          <ChoiceGroup label="לאיזו רשימה" value={listNow} onChange={setList} options={SHOP_LISTS.map((l) => ({ value: l.id, label: l.label }))} />
          {!text.trim() && usual.length > 0 && (
            <div className="k-group">
              <span className="k-group__label">קונים בדרך כלל</span>
              <div className="tasks-usual">{usual.map((c) => <AddChip key={c.title} onClick={() => setText(c.title)}>{c.title}</AddChip>)}</div>
            </div>
          )}
          <div className="tasks-qty">
            <Field label="כמות" size="sm" value={qtyNow} onChange={(e) => setQty(e.target.value)} />
            <ChoiceGroup label="דחיפות" value={urgentNow ? 'u' : 'n'} onChange={(v) => setUrgent(v === 'u')} options={[{ value: 'n', label: 'רגיל' }, { value: 'u', label: 'דחוף' }]} />
          </div>
          <Inline gap={8}>
            <Button variant="neutral" size="tall" grow icon="camera" iconSize={20} disabled={pick.busy} onClick={() => (photo ? setPhoto('') : pick.pick(true))}>{photo ? 'בלי תמונה' : 'תמונה'}</Button>
            <Button variant="neutral" size="tall" grow icon="link" iconSize={20} aria-pressed={showLink} onClick={() => setShowLink(!showLink)}>קישור</Button>
            <Button variant="neutral" size="tall" grow aria-pressed={showNote} onClick={() => setShowNote(!showNote)}>הערה</Button>
          </Inline>
          {extras}
        </>
      )}
      {task && (
        <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את המשימה?"
          text={task.templateId ? `רק המשימה של היום תימחק. "${task.title}" תמשיך לחזור בימים הבאים.` : `"${task.title}" תימחק מהרשימה של כולם.`}
          confirmLabel="מחיקה" onConfirm={() => remove(() => deleteTaskV2(ctx.actor, task, ctx.templates), { text: 'המשימה נמחקה', after: () => go('/tasks', true) })} />
      )}
    </AppScreen>
  );
}
