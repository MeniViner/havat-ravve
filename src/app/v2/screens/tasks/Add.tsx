// Q3 / Q24 (add a task, recurring included) and S5 (add a shopping item) in one form, plus edit mode for both
// (/tasks/:id/edit, /shopping/:id/edit) and for a recurring task (/manage/recurring/new and /manage/recurring/:id open this
// same form through RecurringForm). The capture bars open it with ?text=, ?photo=1 or ?camera=1 (a camera shot), ?mic=1 and,
// from shopping, ?kind=shopping&list=; C3 opens it with ?kind=shopping&task=<id>.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useRemove, useToast } from '../../core';
import {
  FormHeader, BigTextInput, Segmented, ChoiceGroup, ChoiceChip, Button, BottomBar, Inline, Field, TextAreaField, Toggle, EmptyState, AddChip,
  MoreDetails, MoreMenu, PickerSheet, Row, Sheet, type ActionItem,
} from '../../kit';
import { back, param } from '../../../router';
import { getPosition } from '../../../store';
import { useAllEvents } from '../../../data';
import { nowIso } from '../../../clock';
import { israelIso } from '../farm/logic';
import { dayName, ddmm, hhmm, keyOf, DAY_LETTERS } from '../../format';
import type { Actor, ShoppingCategory, ShoppingItem, Task, TaskLocation, Template } from '../../../types';
import {
  useTaskV2, useShoppingDoc, parseShopping, parseTaskText, guessKind, suggestPlace, nearestPlace, endOfWeek, addDays,
  createTask, updateTask, createShopping, updateShopping, canDeleteTask, canEditTask, deleteTaskV2, saveTemplateV2, removeTemplate,
  type TaskInput,
} from '../../data/tasks';
import { catOfKey, useShoppingCategories, addShoppingCategory, listLabel as categoryLabel, suggestions, useShopping, SUGGESTED, deleteShopItem } from '../../data/shopping';
import { useFail, usePhotoPicker, takeStashedPhoto, dictate } from './shared';
import { deleteItem } from './Task';
import './tasks.css';

type Kind = 'task' | 'shopping';
type Where = '' | 'sug' | 'here' | 'other';
type Who = 'free' | 'me' | 'other';
type When = 'today' | 'tomorrow' | 'week' | 'none' | 'date' | 'recurring';
const WHEN: { value: When; label: string }[] = [{ value: 'today', label: 'היום' }, { value: 'tomorrow', label: 'מחר' }, { value: 'week', label: 'השבוע' }, { value: 'none', label: 'בלי תאריך' }];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
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
export const NotFound = ({ title = 'הפריט לא נמצא', backTo = '/tasks' }: { title?: string; backTo?: string }) => (
  <AppScreen variant="form">
    <FormHeader title="עריכה" onCancel={() => back(backTo)} />
    <EmptyState variant="card" title={title} text="אולי נמחק בינתיים" />
  </AppScreen>
);

type FormProps = ScreenProps & {
  task: Task | null;
  item: ShoppingItem | null;
  /** Q24: a recurring task being edited (/manage/recurring/:id). */
  template?: Template;
  /** /manage/recurring/new: the form opens on "חוזרת" and returns to the recurring list. */
  recurringStart?: boolean;
  /** Under the form: the recurring task's 30-day record (the small-additions table). */
  below?: ReactNode;
};

export function AddForm({ ctx, task, item, template, recurringStart, below }: FormProps) {
  const toast = useToast(); const fail = useFail();
  const editing = !!(task || item || template);
  const fromRecurring = !!template || !!recurringStart;
  const forTask = param('task');
  const initialText = template?.title ?? task?.title ?? item?.title ?? param('text');
  const [text, setText] = useState(initialText);
  const [kind, setKind] = useState<Kind>(item ? 'shopping' : task || fromRecurring ? 'task' : param('kind') === 'shopping' ? 'shopping' : initialText ? guessKind(initialText) : 'task');
  const [photo, setPhoto] = useState(() => task?.photo ?? item?.photo ?? (param('photo') || param('camera') ? takeStashedPhoto() : ''));
  const [note, setNote] = useState(template?.note ?? task?.note ?? item?.note ?? '');
  const [urgent, setUrgent] = useState<boolean | null>(task ? task.urgent : item ? item.urgent : null);
  const [busy, setBusy] = useState(false);
  const remove = useRemove();

  // ---- task fields
  const sugId = useMemo(() => suggestPlace(text, ctx.places), [text, ctx.places]);
  const startPlace = template?.placeId || task?.location?.placeId || '';
  // a stored place that is also the one the text suggests shows as that chip, not twice
  const [where, setWhere] = useState<Where>(() => (startPlace && startPlace === suggestPlace(initialText, ctx.places) ? 'sug' : task?.location || startPlace ? 'other' : 'sug'));
  const [otherPlace, setOtherPlace] = useState(startPlace);
  const [herePos, setHerePos] = useState<TaskLocation | null>(null);
  const startWho = template ? (template.assignee ? 'other' : 'free') : !task?.assignee ? 'free' : task.assignee.uid === ctx.user.uid ? 'me' : 'other';
  const [who, setWho] = useState<Who>(startWho);
  const [otherWho, setOtherWho] = useState(template?.assignee?.uid || (task?.assignee && task.assignee.uid !== ctx.user.uid ? task.assignee.uid : ''));
  // an edit keeps the stored date as it is (an overdue one too) unless the user picks another
  const [when, setWhen] = useState<When>(() => {
    if (fromRecurring) return 'recurring';
    const d = task?.dueDate || '';
    return !d ? 'none' : d === ctx.today ? 'today' : d === addDays(ctx.today, 1) ? 'tomorrow' : d === endOfWeek(ctx.today) && d > addDays(ctx.today, 1) ? 'week' : 'date';
  });
  const [date, setDate] = useState(() => task?.dueDate && isDay(task.dueDate) ? task.dueDate : addDays(ctx.today, 2));
  const [dateField, setDateField] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  // Q24 "חוזרת": days, until what time, and (when editing) whether it is on
  const [days, setDays] = useState<number[]>(template?.days.length ? template.days : ALL_DAYS);
  const [time, setTime] = useState(template?.time || '');
  const [active, setActive] = useState(template ? template.active : true);
  const recurring = kind === 'task' && when === 'recurring';
  // "קשור לאירוע" (old T5): prefilled from ?event=; upcoming and running events, soonest first; a past event stays listed only
  // when the task is already linked to it
  const [eventId, setEventId] = useState(task ? task.eventId || '' : param('event'));
  const allEvents = useAllEvents(!item && !fromRecurring);
  const eventOptions = useMemo(() => {
    const now = nowIso();
    return allEvents.items.filter((e) => (e.end || e.start) >= now || e.id === eventId).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [allEvents.items, eventId]);
  const [managersOnly, setManagersOnly] = useState(!!(task?.managersOnly || template?.managersOnly));
  const [sheet, setSheet] = useState<'' | 'place' | 'who' | 'event' | 'note' | 'category'>('');
  // a picker closed without a choice puts its chip group back (PickerSheet calls onChange, then onClose, in one event)
  const chose = useRef(false);
  const openSheet = (k: typeof sheet) => { chose.current = false; setSheet(k); };

  // ---- shopping fields (derived from the text until touched)
  const parsed = parseShopping(text);
  const [list, setList] = useState<ShoppingCategory | null>(item?.category ?? (param('list') ? catOfKey(param('list')) : null));
  const [qty, setQty] = useState<string | null>(item ? item.qty : null);
  const [link, setLink] = useState(item?.link ?? '');
  const [showLink, setShowLink] = useState(!!item?.link);
  const categories = useShoppingCategories(kind === 'shopping');
  const [newCategory, setNewCategory] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [deadline, setDeadline] = useState(item?.urgentDueAt ? `${keyOf(item.urgentDueAt)}T${hhmm(item.urgentDueAt)}` : '');
  const createCategory = async () => {
    if (categorySaving || !newCategory.trim()) return;
    setCategorySaving(true);
    try { setList(await addShoppingCategory(newCategory)); setNewCategory(''); setSheet(''); } catch (e) { fail(e); }
    finally { setCategorySaving(false); }
  };
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
  useEffect(() => { if (where === 'sug' && !sugId && !editing) setWhere(''); else if (where === '' && sugId && !editing) setWhere('sug'); }, [sugId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sugPlace = ctx.places.find((x) => x.id === sugId);
  const pickedPlace = ctx.places.find((x) => x.id === otherPlace);
  const placeOptions = [
    ...(sugPlace ? [{ value: 'sug' as Where, label: sugPlace.name }] : []),
    { value: 'here' as Where, label: herePos?.placeName ? `כאן: ${herePos.placeName}` : 'כאן, לפי המיקום שלי' },
    { value: 'other' as Where, label: where === 'other' && pickedPlace ? pickedPlace.name : 'אחר' },
  ];
  // rule 9: one of many people is chosen in a picker. A recurring task may be on anyone, the manager too ("אדם קבוע").
  const people = ctx.team.filter((x) => x.status === 'active' && (recurring || x.uid !== ctx.user.uid));
  const pickedPerson = ctx.team.find((x) => x.uid === otherWho);
  const whoOptions: { value: Who; label: string }[] = recurring
    ? [{ value: 'free', label: 'מי שפנוי' }, { value: 'other', label: who === 'other' && pickedPerson ? pickedPerson.displayName : 'אדם קבוע' }]
    : [{ value: 'free', label: 'פנויה' }, { value: 'me', label: 'עליי' }, { value: 'other', label: who === 'other' && pickedPerson ? pickedPerson.displayName : 'מישהו אחר' }];
  // "חוזרת" only for managers, on a new task or a recurring one; a recurring task being edited stays recurring
  const whenOptions: { value: When; label: string }[] = template ? [{ value: 'recurring', label: 'חוזרת' }] : [
    ...WHEN,
    { value: 'date', label: when === 'date' && isDay(date) ? `${dayName(date)} ${ddmm(date)}` : 'תאריך' },
    ...(ctx.manager && !task ? [{ value: 'recurring' as When, label: 'חוזרת' }] : []),
  ];

  const chooseWhere = async (v: Where) => {
    if (v === 'other') { setWhere('other'); openSheet('place'); return; }
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
  const chooseWho = (v: Who) => { setWho(v); if (v === 'other') openSheet('who'); };
  const chooseWhen = (v: When) => {
    if (v === 'recurring' && who === 'me') { setWho('other'); setOtherWho(ctx.user.uid); }
    if (v !== 'recurring' && who === 'other' && otherWho === ctx.user.uid) { setWho('me'); setOtherWho(''); }
    setWhen(v);
    if (v === 'date') {
      // the date chip opens the phone's date picker; where the browser cannot, the date field shows under the chips
      const el = dateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      try { if (el?.showPicker) el.showPicker(); else setDateField(true); } catch { setDateField(true); }
    }
  };
  const toggleDay = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());

  const locationNow = (): TaskLocation | null => {
    if (where === 'sug' && sugPlace) return { lat: sugPlace.lat, lng: sugPlace.lng, placeId: sugPlace.id, placeName: sugPlace.name };
    if (where === 'here') return herePos;
    if (where === 'other') {
      if (pickedPlace) return { lat: pickedPlace.lat, lng: pickedPlace.lng, placeId: pickedPlace.id, placeName: pickedPlace.name };
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
  const reset = () => { setText(''); setPhoto(''); setNote(''); setDeadline(''); setUrgent(null); setQty(null); setList(null); setLink(''); setShowLink(false); setWhere(''); setWho('free'); setWhen('none'); };
  const timeBad = !!time && !/^\d{1,2}:\d{2}$/.test(time);
  const blocked = !text.trim() || busy || (recurring && (!days.length || timeBad));
  const leave = (fallback: string) => back(fromRecurring ? '/manage/recurring' : fallback);
  const submit = async (more: boolean) => {
    if (blocked) return;
    if (kind === 'task' && who === 'other' && !otherWho) { toast.refused(recurring ? 'לא נשמר. בחרו מי עושה אותה' : 'לא נשמר. בחרו על מי המשימה'); return; }
    setBusy(true);
    try {
      if (recurring) {
        const placeId = (where === 'sug' && sugPlace?.id) || (where === 'here' && herePos?.placeId) || (where === 'other' && pickedPlace?.id) || '';
        await saveTemplateV2(ctx.actor, {
          title: text, note: note.trim(), days, time: time ? time.padStart(5, '0') : '', active, managersOnly: ctx.manager && managersOnly, assignee: assigneeNow(), placeId,
        }, template);
        toast.show({ text: 'נשמר' });
        if (more && !fromRecurring) { reset(); setBusy(false); return; }
        leave('/tasks');
        return;
      }
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
        const data = { title, qty: qtyNow, note, link, category: listNow, urgent: urgentNow, urgentDueAt: urgentNow && deadline ? israelIso(deadline.slice(0,10), deadline.slice(11,16)) : null, photo };
        if (item) { await updateShopping(ctx.actor, item, data); toast.show({ text: 'נשמר' }); back(`/shopping/${item.id}`); return; }
        await createShopping(ctx.actor, data, ctx.team, forTask || undefined);
        toast.show({ text: `נוסף ל${categoryLabel(listNow)}: ${title}` });
      }
      if (more) { reset(); setBusy(false); return; }
      back(kind === 'task' ? '/tasks' : forTask ? `/tasks/${forTask}` : '/shopping');
    } catch (e) { fail(e); setBusy(false); }
  };

  const listLabel = categoryLabel(listNow) || '';
  const bar = (
    <BottomBar column={!editing && !recurring}>
      <Button size="bar" block disabled={blocked} onClick={() => submit(false)}>
        {editing ? 'שמירה' : recurring ? 'הוספת משימה חוזרת' : kind === 'task' ? 'הוספת משימה' : `הוספה ל${listLabel}`}
      </Button>
      {!editing && !recurring && <Button variant="link" disabled={blocked} onClick={() => submit(true)}>{kind === 'task' ? 'הוספה, ועוד אחת' : 'הוספה, ועוד פריט'}</Button>}
    </BottomBar>
  );

  // rule 6: delete is ⋯ → "מחיקה" → Q8, in the edit form's header beside "ביטול"
  const cancel = () => (template || recurringStart ? back('/manage/recurring') : back(task ? `/tasks/${task.id}` : item ? `/shopping/${item.id}` : '/tasks'));
  const delItems: ActionItem[] = template ? [{
    label: 'מחיקה', icon: 'trash', tone: 'danger',
    confirm: {
      title: 'למחוק את המשימה החוזרת?', text: `"${template.title}" לא תיווצר יותר. משימות שכבר נוצרו נשארות.`,
      onConfirm: () => remove(() => removeTemplate(ctx.actor, template.id), { text: 'המשימה החוזרת נמחקה', after: () => go('/manage/recurring', true) }),
    },
  }] : task ? [deleteItem(task, canDeleteTask(task, ctx.user.uid, ctx.manager),
    () => remove(() => deleteTaskV2(ctx.actor, task, ctx.templates), { text: 'המשימה נמחקה', after: () => go('/tasks', true) }))]
    : item ? [{
      label: 'מחיקה', icon: 'trash', tone: 'danger',
      confirm: {
        title: 'למחוק מהרשימה?', text: `"${item.title}" יימחק מהרשימה של כולם.`,
        onConfirm: () => {
          const undo = deleteShopItem(ctx.actor, item);
          toast.show({ text: `נמחק: ${item.title}`, check: false, duration: 6000, actions: [{ label: 'ביטול', onClick: undo }] });
          go('/shopping', true);
        },
      },
    }] : [];
  const headEnd = delItems.some((i) => !i.hidden) ? (
    <div className="tasks-formend">
      <MoreMenu title={template ? 'משימה חוזרת' : item ? item.title : 'משימה'} items={delItems} />
      <button type="button" className="k-quietlink" onClick={cancel}>ביטול</button>
    </div>
  ) : undefined;

  const eventLabel = (id: string) => {
    const e = allEvents.items.find((x) => x.id === id);
    if (!e) return allEvents.loading ? 'טוען…' : 'אירוע שנמחק';
    return e.start ? `${e.title} · ${dayName(e.start)} ${ddmm(e.start)}` : e.title;
  };
  const noteMeta = [note.trim(), photo ? 'תמונה' : ''].filter(Boolean).join(' · ') || 'אין';
  // Q3 "עוד פרטים": collapsed unless one of its fields already has a value
  const moreOpen = !!(eventId || note.trim() || photo || urgentNow || managersOnly);
  const managersRow = ctx.manager && (
    <Row title="רק מנהלים רואים" actions={<Toggle checked={managersOnly} onChange={setManagersOnly} label="רק מנהלים רואים" />} />
  );

  return (
    <AppScreen variant="form" bar={bar}>
      {pick.input}
      <FormHeader title={editing ? 'עריכה' : 'הוספה'} onCancel={cancel} end={headEnd} />
      <BigTextInput label={kind === 'task' ? 'מה צריך לעשות' : 'מה צריך לקנות'} value={text} onChange={(e) => setText(e.target.value)} autoFocus={!initialText} />
      {!editing && !recurringStart && <Segmented label="סוג" size="lg" value={kind} onChange={setKind} options={[{ value: 'task', label: 'משימה' }, { value: 'shopping', label: 'קנייה' }]} />}

      {kind === 'task' ? (
        <>
          <ChoiceGroup label="איפה" value={where} onChange={chooseWhere} options={placeOptions} />
          <ChoiceGroup label="על מי" value={who} onChange={chooseWho} options={whoOptions} />
          <ChoiceGroup label="מתי" value={when} onChange={chooseWhen} options={whenOptions} />
          <input ref={dateRef} type="date" className="tasks-dateinput" tabIndex={-1} aria-hidden="true" min={date < ctx.today ? undefined : ctx.today} value={date}
            onChange={(e) => { if (isDay(e.target.value)) { setDate(e.target.value); setWhen('date'); } }} />
          {when === 'date' && dateField && (
            <Field label="באיזה תאריך?" type="date" ltr min={date < ctx.today ? undefined : ctx.today} value={date}
              onChange={(e) => { if (isDay(e.target.value)) setDate(e.target.value); }} />
          )}
          {recurring ? (
            <>
              <section className="k-card tasks-rec">
                <div className="tasks-days">
                  <span className="tasks-days__label">באילו ימים</span>
                  <div className="tasks-days__row" role="group" aria-label="באילו ימים">
                    {DAY_LETTERS.map((l, i) => (
                      <ChoiceChip key={i} fill selected={days.includes(i)} onClick={() => toggleDay(i)}><span aria-label={`יום ${l}`}>{l}</span></ChoiceChip>
                    ))}
                  </div>
                </div>
                <label className="tasks-rec__row">
                  <span>עד איזו שעה</span>
                  <input type="text" inputMode="numeric" placeholder="07:00" maxLength={5} className="tasks-rec__time" aria-invalid={timeBad || undefined}
                    value={time} onChange={(e) => setTime(e.target.value.trim())} />
                </label>
                {template && (
                  <div className="tasks-rec__row">
                    <span>פעילה</span>
                    <Toggle checked={active} onChange={setActive} label="פעילה" />
                  </div>
                )}
              </section>
              <span className="tasks-meta">המשימה תיכנס לבד לרשימה בכל בוקר של יום שנבחר. רק מנהלים יוצרים משימה חוזרת.</span>
              <MoreDetails defaultOpen={!!(note.trim() || managersOnly)}>
                <Row title="הערה" meta={note.trim() || 'אין'} onClick={() => setSheet('note')} />
                {managersRow}
              </MoreDetails>
            </>
          ) : (
            <MoreDetails defaultOpen={moreOpen}>
              {(eventOptions.length > 0 || eventId) && <Row title="קשור לאירוע" meta={eventId ? eventLabel(eventId) : 'אין'} onClick={() => setSheet('event')} />}
              <Row title="הערה ותמונה" meta={noteMeta} onClick={() => setSheet('note')} />
              <Row title="דחוף" actions={<Toggle checked={urgentNow} onChange={(v) => setUrgent(v)} label="דחוף" />} />
              {managersRow}
            </MoreDetails>
          )}
          {below}
        </>
      ) : (
        <>
          <ChoiceGroup label="לאיזו קטגוריה" value={listNow} onChange={setList} options={categories.map(l => ({ value: l.cat, label: l.label }))} />
          <Button variant="link" onClick={() => setSheet('category')}>קטגוריה חדשה</Button>
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
          {urgentNow && <Field label="מועד יעד (לא חובה)" type="datetime-local" ltr value={deadline} onChange={e => setDeadline(e.target.value)} />}
          <TextAreaField label="הערה" value={note} onChange={e => setNote(e.target.value)} />
          <Inline gap={8}>
            <Button variant="neutral" size="tall" grow icon="camera" iconSize={20} disabled={pick.busy} onClick={() => (photo ? setPhoto('') : pick.pick(true))}>{photo ? 'בלי תמונה' : 'תמונה'}</Button>
            <Button variant="neutral" size="tall" grow icon="link" iconSize={20} aria-pressed={showLink} onClick={() => setShowLink(!showLink)}>קישור</Button>
          </Inline>
          {photo && <img className="tasks-photo-thumb" src={photo} alt="התמונה שנבחרה" />}
          {showLink && <Field label="קישור" ltr type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />}
        </>
      )}

      <PickerSheet open={sheet === 'place'} onClose={() => { setSheet(''); if (!chose.current && !pickedPlace && !task?.location) setWhere(sugPlace ? 'sug' : ''); }} title="באיזה מקום"
        options={ctx.places.map((x) => ({ value: x.id, label: x.name }))} value={otherPlace} onChange={(v) => { chose.current = true; setOtherPlace(v); setWhere(v === sugId ? 'sug' : 'other'); }} />
      <PickerSheet open={sheet === 'who'} onClose={() => { setSheet(''); if (!chose.current && !pickedPerson) setWho('free'); }} title={recurring ? 'מי' : 'על מי'}
        options={people.map((x) => ({ value: x.uid, label: x.uid === ctx.user.uid ? 'אני' : x.displayName }))} value={otherWho} onChange={(v) => { chose.current = true; setOtherWho(v); setWho('other'); }} />
      <PickerSheet open={sheet === 'event'} onClose={() => setSheet('')} title="קשור לאירוע" value={eventId} onChange={setEventId}
        options={[{ value: '', label: 'לא קשור לאירוע' },
          ...eventOptions.map((e) => ({ value: e.id, label: e.title, meta: e.start ? `${dayName(e.start)} ${ddmm(e.start)}` : undefined })),
          ...(eventId && !eventOptions.some((e) => e.id === eventId) ? [{ value: eventId, label: eventLabel(eventId) }] : [])]} />
      <Sheet open={sheet === 'category'} onClose={() => setSheet('')} title="קטגוריה חדשה">
        <Field label="שם הקטגוריה" maxLength={60} value={newCategory} onChange={e => setNewCategory(e.target.value)} />
        <Button size="bar" block disabled={categorySaving || !newCategory.trim()} onClick={createCategory}>יצירה ובחירה</Button>
      </Sheet>
      <Sheet open={sheet === 'note'} onClose={() => setSheet('')} title={recurring ? 'הערה' : 'הערה ותמונה'}>
        <div className="tasks-notesheet">
          <TextAreaField label={recurring ? 'הסבר קצר (לא חובה)' : 'הערה'} height={96} value={note} onChange={(e) => setNote(e.target.value)} />
          {!recurring && photo && <img className="tasks-photo-thumb" src={photo} alt="התמונה שנבחרה" />}
          {!recurring && <Button variant="neutral" size="tall" icon="camera" iconSize={20} disabled={pick.busy} onClick={() => (photo ? setPhoto('') : pick.pick(true))}>{photo ? 'בלי תמונה' : 'תמונה'}</Button>}
          <Button size="bar" block onClick={() => setSheet('')}>שמירה</Button>
        </div>
      </Sheet>
    </AppScreen>
  );
}
