// N11 / Q32 Event edit / new event: the few fields that change most ("מתאריך" and "עד תאריך", empty = the same day), three
// switches; picture, description and questions one tap away. Deleting the event is in ⋯ beside "ביטול" (rule 6; M4 keeps "עריכה").
import { useCallback, useId, useRef, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useRemove, useToast } from '../../core';
import { FormHeader, Field, FieldRow, Stepper, ListCard, Row, Toggle, Button, BottomBar, TextAreaField, MoreMenu, Sheet, Tag } from '../../kit';
import { useEvent } from '../../../data';
import { compressPhoto } from '../../../store';
import { storePhoto } from '../../../upload';
import { back } from '../../../router';
import { nowMs } from '../../../clock';
import { saveEventV2, deleteEventV2 } from '../../data/events';
import { dateFieldText, isoFromLocal, localOf, normTime } from './logic';
import { FormEnd, Loading, Missing, useRun } from './shared';
import type { EventQuestion, FarmEvent } from '../../../types';

export function EventForm({ ctx, params }: ScreenProps) {
  const id = params.id || '';
  const { item: e, loading } = useEvent(id, ctx.manager && !!id);
  if (id && loading && !e) return <Loading backLabel="אירועים" parent="/manage/events" />;
  if (id && !e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Form key={e?.id || 'new'} ctx={ctx} existing={e || undefined} />;
}

const DEFAULT_LOCATION = 'חוות רווה, ליד טנא עומרים';

function Form({ ctx, existing }: { ctx: V2Ctx; existing?: FarmEvent }) {
  const toast = useToast(); const run = useRun(); const remove = useRemove();
  const s0 = localOf(existing?.start || ''); const e0 = localOf(existing?.end || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [date, setDate] = useState(s0.date);
  const [from, setFrom] = useState(s0.time || '');
  const [to, setTo] = useState(e0.time || '');
  // Q32 "עד תאריך": empty is the same day (an evening into the night stays one day); a multi-day event keeps its last day.
  const [endDate, setEndDate] = useState(e0.date);
  const [price, setPrice] = useState(String(existing?.price ?? ''));
  const [maxPerOrder, setMax] = useState(existing?.maxPerOrder ?? 5);
  const [published, setPublished] = useState(existing?.published ?? false);
  const [open, setOpen] = useState(existing?.open ?? true);
  const [entry, setEntry] = useState(existing?.entry !== false);
  const [stall, setStall] = useState(existing?.stall !== false);
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState(existing?.description || '');
  const [shareWords, setShareWords] = useState(existing?.shareWords || '');
  const [image, setImage] = useState(existing?.image || '');
  const [location, setLocation] = useState(existing?.location ?? DEFAULT_LOCATION);
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 0));
  const [questions, setQuestions] = useState<EventQuestion[]>(existing?.questions || []);
  // the question being edited in its sheet; id '' is a new one ("הוספת שאלה")
  const [ask, setAsk] = useState<EventQuestion | null>(null);
  const closeQuestion = useCallback(() => setAsk(null), []);
  const [preview, setPreview] = useState(false);
  const closePreview = useCallback(() => setPreview(false), []);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const until = endDate;
  const range = date && until && until >= date && normTime(from) && normTime(to) ? { start: isoFromLocal(date, normTime(from)), end: isoFromLocal(until, normTime(to)) } : null;
  const invalidEnd = !!range && Date.parse(range.end) <= Date.parse(range.start);
  const endedBeforePublishing = !!range && published && !existing?.published && Date.parse(range.end) <= nowMs();
  const priceN = Math.max(0, Math.round(Number(price.replace(/[^\d.]/g, '')) || 0));
  const ok = title.trim().length > 0 && !!range && !invalidEnd && !endedBeforePublishing;
  const parent = existing ? `/manage/events/${existing.id}` : '/manage/events';

  const togglePublished = (v: boolean) => { setPublished(v); if (v && !published) setOpen(true); };
  const save = async () => {
    setTried(true);
    if (!ok || !range) return;
    setBusy(true);
    const id = await run(() => saveEventV2(ctx.actor, {
      title: title.trim(), description: description.trim(), shareWords:shareWords.trim(), image, location: location.trim(), start: range.start, end: range.end,
      price: priceN, maxPerOrder, capacity: Math.max(0, Math.round(Number(capacity) || 0)), open, published,
      questions: questions.filter((q) => q.label.trim()).map((q) => ({ ...q, label: q.label.trim() })), entry, stall,
      ...(existing ? {} : { files: [] }),
    }, existing));
    setBusy(false);
    if (id) go(`/manage/events/${id}`, true);
  };
  const pickImage = async (f?: File) => {
    if (!f) return;
    try { setImage(await storePhoto(await compressPhoto(f), 'event')); } catch (err) { toast.show({ text: (err as Error).message, tone: 'error' }); }
  };

  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={save}>שמירה</Button></BottomBar>}>
      <FormHeader title={existing ? 'עריכת אירוע' : 'אירוע חדש'} end={<FormEnd onCancel={() => back(parent)} title={existing?.title || ''} items={existing ? [
        { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: {
          title: 'למחוק את האירוע?', text: `"${existing.title}" יימחק מהאתר ומהיומן. הכרטיסים שכבר נרשמו נשמרים.`,
          onConfirm: () => remove(() => deleteEventV2(ctx.actor, existing), { text: 'האירוע נמחק. הכרטיסים נשמרו.', after: () => go('/manage/events', true) }),
        } },
      ] : undefined} />} />
      <Field label="שם האירוע" value={title} onChange={(ev) => setTitle(ev.target.value)} error={tried && !title.trim() ? 'צריך שם לאירוע' : undefined} />
      <FieldRow>
        <DateField label="מתאריך" value={date} onChange={setDate} error={tried && !date ? 'בחרו תאריך' : undefined} />
        <DateField label="עד תאריך" value={until} min={date} placeholder="תאריך סיום" onChange={setEndDate} error={tried && (!until || until < date || invalidEnd || endedBeforePublishing) ? (!until ? 'בחרו תאריך סיום' : until < date || invalidEnd ? 'מועד הסיום צריך להיות אחרי ההתחלה' : 'בחרו מועד סיום עתידי לפרסום האירוע') : undefined} />
      </FieldRow>
      <FieldRow>
        <Field grow label="משעה" ltr inputMode="numeric" value={from} onChange={(ev) => setFrom(ev.target.value)} onBlur={() => setFrom((v) => normTime(v) || v)}
          error={tried && !normTime(from) ? 'שעה כמו 16:00' : undefined} />
        <Field grow label="עד שעה" ltr inputMode="numeric" value={to} onChange={(ev) => setTo(ev.target.value)} onBlur={() => setTo((v) => normTime(v) || v)}
          error={tried && !normTime(to) ? 'שעה כמו 21:00' : undefined} />
      </FieldRow>
      <FieldRow end>
        <Field grow label="מחיר לכרטיס, בשקלים" ltr inputMode="numeric" value={price} onChange={(ev) => setPrice(ev.target.value)} placeholder="0" />
        <div className="k-field">
          <span className="k-field__label">עד כמה בהזמנה</span>
          <Stepper size="lg" value={maxPerOrder} min={1} max={20} onChange={setMax} />
        </div>
      </FieldRow>
      <ListCard>
        <Row minHeight={58} title="מפורסם לאורחים" meta="מופיע באפליקציה ופתוח להרשמה" actions={<Toggle checked={published} onChange={togglePublished} label="מפורסם לאורחים" />} />
        <Row minHeight={58} title="כניסה בסריקה" actions={<Toggle checked={entry} onChange={setEntry} label="כניסה בסריקה" />} />
        <Row minHeight={58} title="אירוע עם דוכנים" actions={<Toggle checked={stall} onChange={setStall} label="אירוע עם דוכנים" />} />
      </ListCard>
      {!more ? (
        <Button variant="dashed" size="tall" onClick={() => setMore(true)} aria-expanded={false}>תמונה, תיאור ושאלות לנרשמים</Button>
      ) : (
        <div className="events-more">
          <div className="events-imagepick">
            {image && <img src={image} alt="" className="events-imagepick__img" />}
            <div className="events-imagepick__btns">
              <Button variant="neutral" icon="camera" onClick={() => fileRef.current?.click()}>{image ? 'החלפת התמונה' : 'תמונה לדף האירוע'}</Button>
              {image && <Button variant="quiet" onClick={() => setImage('')}>הסרה</Button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(ev) => { pickImage(ev.target.files?.[0]); ev.target.value = ''; }} />
          </div>
          <TextAreaField label="תיאור לאורחים" value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="מה יהיה, למי זה מתאים, מה להביא" height={110} />
          <Field label="מילים שיופיעו בשיתוף האירוע" value={shareWords} maxLength={160} onChange={(ev)=>setShareWords(ev.target.value)} />
          <Field label="מקום" value={location} onChange={(ev) => setLocation(ev.target.value)} />
          <Field label="מקומות (0 = בלי הגבלה)" ltr inputMode="numeric" value={capacity} onChange={(ev) => setCapacity(ev.target.value.replace(/\D/g, ''))} />
          {/* rules 4 and 6: a question is a row that opens its sheet; delete is ⋯ → "מחיקה" there, no X on the row */}
          {questions.length > 0 && (
            <ListCard title="שאלות נוספות בהרשמה" count={questions.length}>
              {questions.map((q) => (
                <Row key={q.id} minHeight={54} title={q.label || 'שאלה בלי נוסח'} tags={q.required ? <Tag tone="warm">חובה</Tag> : <Tag>רשות</Tag>} onClick={() => setAsk({ ...q })} />
              ))}
            </ListCard>
          )}
          <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => setAsk({ id: '', label: '', required: false })}>{questions.length ? 'הוספת שאלה' : 'שאלות נוספות בהרשמה'}</Button>
          <Button variant="outline" onClick={() => setPreview(true)}>תצוגה מקדימה של שאלון ההרשמה</Button>
          <Sheet open={preview} onClose={closePreview} title="שאלון ההרשמה">
            <div className="events-sheet"><Field label="שם מלא (חובה)" readOnly value="" /><Field label="טלפון (חובה)" readOnly value="" />
              {questions.map((q) => <Field key={q.id} label={q.label + (q.required ? ' (חובה)' : ' (רשות)')} readOnly value="" />)}
            </div>
          </Sheet>
          <QuestionSheet q={ask} saved={questions.find((x) => x.id === ask?.id)?.label || ''} onChange={setAsk} onClose={closeQuestion}
            onKeep={(q) => { setQuestions((l) => (q.id ? l.map((x) => (x.id === q.id ? q : x)) : [...l, { ...q, id: 'q' + nowMs().toString(36) }])); setAsk(null); }}
            onDrop={(qid) => { setQuestions((l) => l.filter((x) => x.id !== qid)); setAsk(null); }} />
          <ListCard>
            <Row minHeight={58} title="פתוח להרשמה" meta="אורחים יכולים להזמין כרטיסים" actions={<Toggle checked={open} onChange={setOpen} label="פתוח להרשמה" />} />
          </ListCard>
        </div>
      )}
    </AppScreen>
  );
}

/** One sign-up question of the event, edited in a sheet like the registration questions in Settings (G3): the question and
 *  "חובה"; for a saved question ⋯ in the header holds "מחיקה" with the Q8 confirmation. Changes apply with the form's "שמירה". */
function QuestionSheet({ q, saved, onChange, onClose, onKeep, onDrop }: {
  q: EventQuestion | null; saved: string; onChange: (q: EventQuestion) => void; onClose: () => void; onKeep: (q: EventQuestion) => void; onDrop: (id: string) => void;
}) {
  const ok = !!q?.label.trim();
  const more = q?.id ? (
    <MoreMenu title={saved || 'שאלה'} items={[{
      label: 'מחיקה', icon: 'trash', tone: 'danger',
      confirm: { title: 'למחוק את השאלה?', text: `"${saved}" תוסר מטופס ההרשמה לאירוע כשתלחצו "שמירה". תשובות שכבר נשמרו נשארות.`, confirmLabel: 'מחיקה', onConfirm: () => onDrop(q.id) },
    }]} />
  ) : undefined;
  return (
    <Sheet open={!!q} onClose={onClose} title={q?.id ? 'עריכת שאלה' : 'שאלה חדשה'} aside={more}>
      {q && (
        <div className="events-sheet">
          <Field label="השאלה" value={q.label} maxLength={80} onChange={(ev) => onChange({ ...q, label: ev.target.value })} />
          <ul className="k-list k-card k-card--list"><Row minHeight={54} title="חובה" meta="בלי תשובה אי אפשר להירשם" actions={<Toggle label="חובה" checked={q.required} onChange={(v) => onChange({ ...q, required: v })} />} /></ul>
          <Button size="lg" block disabled={!ok} onClick={() => onKeep({ ...q, label: q.label.trim() })}>{q.id ? 'עדכון' : 'הוספה'}</Button>
        </div>
      )}
    </Sheet>
  );
}

/** Q32 date field: reads "שבת 28.11.2026" and opens the phone's date picker (the native input lies over it, invisible).
 *  Empty shows the placeholder ("אותו יום"); clearing the picker empties it. */
function DateField({ label, value, onChange, min, placeholder, error }: { label: string; value: string; onChange: (v: string) => void; min?: string; placeholder?: string; error?: string }) {
  const id = useId(); const ref = useRef<HTMLInputElement>(null);
  const open = () => { const el = ref.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } };
  return (
    <div className="k-field k-field--grow events-datefield">
      <label htmlFor={id} className="k-field__label">{label}</label>
      <input className="k-input" readOnly value={dateFieldText(value)} placeholder={placeholder} onClick={open} tabIndex={-1} aria-hidden="true" />
      <input ref={ref} id={id} type="date" className="events-datefield__native" value={value} min={min} onChange={(ev) => onChange(ev.target.value)} />
      {error && <span className="k-field__error" role="alert">{error}</span>}
    </div>
  );
}
