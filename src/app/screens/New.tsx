// Adding. One screen for "something has to be done" and "something has to be bought": type, Enter, type the next one.
// The field is at the top of the page, so the phone keyboard never covers it or the button.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task, TaskLocation, ShoppingCategory } from '../types';
import type { TeamCtx } from '../ctx';
import { useToast, todayISO, addDays, fmtDayShort } from '../ui';
import { Head, Seg, Field, Tick, Btn, Form, Empty, pickImage, deferDelete, useSticky, markFresh } from '../kit';
import { back, navigate, param } from '../router';
import { addTask, editTask, deleteTask, useTask, compressPhoto, getPosition, addShopping, useBoughtHistory } from '../store';

export const CATS: { id: ShoppingCategory; label: string; hint: string; done: string }[] = [
  { id: 'super', label: 'סופר', hint: '', done: 'נקנה' },
  { id: 'building', label: 'בניין', hint: 'חומרי בניין וכלים', done: 'נקנה' },
  { id: 'online', label: 'אינטרנט', hint: 'להזמין באתר', done: 'הוזמן' },
  { id: 'giveaway', label: 'מחפשים', hint: 'דברים שנשמח לקבל בחינם', done: 'נמצא' },
];
export const catOf = (id: ShoppingCategory) => CATS.find((c) => c.id === id) || CATS[0];

type Kind = 'task' | 'shop';
export function NewScreen({ ctx, initial }: { ctx: TeamCtx; initial?: Kind }) {
  const [kind, setKind] = useState<Kind>(initial || (param('k') === 'shop' ? 'shop' : 'task'));
  return (
    <>
      <Head backTo={kind === 'shop' ? '/shopping' : '/tasks'} backLabel="סיום" title="הוספה" />
      <div style={{ padding: '0 20px 6px' }}>
        <Seg hideLabel label="מה מוסיפים" value={kind} onChange={setKind} options={[{ value: 'task', label: 'משימה' }, { value: 'shop', label: 'לרשימת הקניות' }]} />
      </div>
      {kind === 'task' ? <TaskForm ctx={ctx} /> : <ShopForm ctx={ctx} />}
    </>
  );
}

// ---------- task ----------
type When = 'none' | 'today' | 'tomorrow' | 'date';
export function TaskForm({ ctx, existing }: { ctx: TeamCtx; existing?: Task }) {
  const today = todayISO(); const toast = useToast();
  const startWhen: When = !existing?.dueDate ? 'none' : existing.dueDate === today ? 'today' : existing.dueDate === addDays(today, 1) ? 'tomorrow' : 'date';
  const [title, setTitle] = useState(existing?.title || '');
  const [note, setNote] = useState(existing?.note || '');
  const [photo, setPhoto] = useState(existing?.photo || '');
  const [where, setWhere] = useState<string>(existing?.location ? existing.location.placeId || 'keep' : '');
  const [here, setHere] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState('');
  const [who, setWho] = useState(existing?.assignee?.uid || '');
  const [when, setWhen] = useState<When>(startWhen);
  const [date, setDate] = useState(existing?.dueDate || addDays(today, 2));
  const [urgent, setUrgent] = useState(existing?.urgent || false);
  const [managersOnly, setManagersOnly] = useState(existing?.managersOnly || false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!existing) titleRef.current?.focus(); }, []);

  const pickWhere = (v: string) => {
    setWhere(v); setErr('');
    if (v !== 'here') return;
    setLocating('מאתר את המקום שלך…'); setHere(null);
    getPosition().then((p) => { setHere(p); setLocating(`נקלט, בדיוק של כ־${p.accuracy} מטר`); }).catch((e) => { setWhere(''); setLocating(''); setErr((e as Error).message); });
  };
  const location = (): TaskLocation | null => {
    if (where === 'keep') return existing?.location || null;
    if (where === 'here') return here ? { lat: here.lat, lng: here.lng } : null;
    const p = ctx.places.find((x) => x.id === where);
    return p ? { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name } : null;
  };
  const addPhoto = async () => {
    const file = await pickImage(); if (!file) return;
    setBusy(true); try { setPhoto(await compressPhoto(file)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const submit = async () => {
    const t = title.trim();
    if (!t) { setErr('צריך לכתוב מה לעשות'); titleRef.current?.focus(); return; }
    if (where === 'here' && !here) { setErr('עוד מאתר את המקום. רגע, או לבחור מקום מהרשימה.'); return; }
    const p = ctx.team.find((x) => x.uid === who);
    const data = { title: t, note: note.trim(), photo, location: location(), dueDate: when === 'none' ? '' : when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : date, managersOnly, assignee: p ? { uid: p.uid, name: p.displayName } : who === ctx.actor.uid ? ctx.actor : null, urgent };
    setBusy(true); setErr('');
    try {
      if (existing) { await editTask(ctx.actor, existing, data); toast({ text: 'נשמר' }, 2000); back(`/tasks/${existing.id}`); return; }
      const id = await addTask(ctx.actor, data);
      // back to the list, where the new row is marked; every field starts empty next time
      markFresh(id);
      toast({ text: `נוספה: ${t}`, actions: [{ label: 'ביטול', onClick: () => { deleteTask(ctx.actor, { id, ...data, createdBy: ctx.actor } as unknown as Task).catch(() => {}); } }] }, 6000);
      setTitle(''); setNote(''); setPhoto(''); setUrgent(false); setWho(''); setWhere(''); setHere(null); setLocating(''); setWhen('none'); setManagersOnly(false);
      navigate('/tasks', true);
    } catch (e) { setErr((e as Error).message || 'לא נשמר'); } finally { setBusy(false); }
  };
  const remove = () => {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => { deleteTask(ctx.actor, existing).catch(() => {}); });
    toast({ text: `נמחקה: ${existing.title}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    navigate('/tasks', true);
  };
  const others = ctx.team.filter((p) => p.uid !== ctx.actor.uid);
  // what the fixed button at the bottom will add, in one short line
  const whoName = who === ctx.actor.uid ? 'עליי' : ctx.team.find((p) => p.uid === who)?.displayName.split(' ')[0] || '';
  const whereName = where === 'here' ? 'כאן' : where === 'keep' ? existing?.location?.placeName || '' : ctx.places.find((x) => x.id === where)?.name || '';
  const whenName = when === 'today' ? 'היום' : when === 'tomorrow' ? 'מחר' : when === 'date' ? fmtDayShort(date) : '';
  const summary = [whenName, whereName, whoName || 'פנויה', urgent && 'דחוף', managersOnly && 'מנהלים בלבד'].filter(Boolean).join(' · ');
  return (
    <Form onSubmit={submit}>
      <Field label="מה צריך לעשות?">{(id) => <input id={id} ref={titleRef} className="r-input big" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} maxLength={200} enterKeyHint="done" autoComplete="off" />}</Field>
      {err && <p className="r-err" role="alert">{err}</p>}
      {photo && <div className="r-photo"><img src={photo} alt="התמונה שצורפה" /><button type="button" onClick={() => setPhoto('')}>הסרה</button></div>}
      {!photo && <Btn kind="ghost" onClick={addPhoto} disabled={busy} style={{ alignSelf: 'flex-start' }}>תמונה</Btn>}
      <h2 className="r-optional">{existing ? 'פרטים' : 'אפשר גם, לא חובה'}</h2>
      <Field label="על מי?">{(id) => <select id={id} className="r-input" value={who} onChange={(e) => setWho(e.target.value)}><option value="">פנויה, מי שיכול לוקח</option><option value={ctx.actor.uid}>עליי</option>{others.map((p) => <option key={p.uid} value={p.uid}>{p.displayName}</option>)}</select>}</Field>
      <Field label="איפה?" help={locating || undefined}>{(id) => <select id={id} className="r-input" value={where} onChange={(e) => pickWhere(e.target.value)}><option value="">בלי מקום</option><option value="here">כאן, איפה שאני עומד/ת</option>{where === 'keep' && <option value="keep">{existing?.location?.placeName || 'הנקודה שנשמרה'}</option>}{ctx.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>
      <Seg label="עד מתי?" value={when} onChange={setWhen} options={[{ value: 'none', label: 'בלי תאריך' }, { value: 'today', label: 'היום' }, { value: 'tomorrow', label: 'מחר' }, { value: 'date', label: when === 'date' ? fmtDayShort(date) : 'תאריך' }]} />
      {when === 'date' && <Field label="באיזה תאריך?">{(id) => <input id={id} type="date" className="r-input" dir="ltr" min={today} value={date} onChange={(e) => setDate(e.target.value || date)} />}</Field>}
      <Tick on={urgent} onChange={setUrgent} help="עולה לראש הרשימה אצל כולם">דחוף</Tick>
      {ctx.manager && <Tick on={managersOnly} onChange={setManagersOnly} help="מתנדבים לא יראו אותה">למנהלים בלבד</Tick>}
      <details className="r-details" open={!!note || undefined}>
        <summary>להוסיף הסבר</summary>
        <Field label="הסבר">{(id) => <textarea id={id} className="r-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="איפה הכלים, מה בדיוק, למי לפנות" />}</Field>
      </details>
      {existing && (ctx.manager || existing.createdBy.uid === ctx.actor.uid) && <Btn kind="danger" onClick={remove} style={{ alignSelf: 'flex-start' }}>מחיקת המשימה</Btn>}
      <div className="r-dock"><span className="r-what">{summary}</span><Btn type="submit" fit disabled={busy}>{existing ? 'שמירה' : 'הוספה'}</Btn></div>
    </Form>
  );
}
export function TaskEditScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const { item, loading } = useTask(id);
  return (
    <>
      <Head backTo={`/tasks/${id}`} backLabel="ביטול" title="עריכת משימה" />
      {loading ? <div className="r-empty">טוען…</div> : item ? <TaskForm key={item.id} ctx={ctx} existing={item} /> : <Empty title="המשימה לא נמצאה" />}
    </>
  );
}

// ---------- shopping ----------
export const fixLink = (v: string) => { const s = v.trim(); return !s ? '' : /^https:\/\//i.test(s) ? s : 'https://' + s.replace(/^http:\/\//i, ''); };
function ShopForm({ ctx }: { ctx: TeamCtx }) {
  const toast = useToast();
  const [cat, setCat] = useSticky<ShoppingCategory>('shop-tab', (param('c') as ShoppingCategory) || 'super');
  const [title, setTitle] = useState(''); const [qty, setQty] = useState(''); const [note, setNote] = useState(''); const [link, setLink] = useState('');
  const [urgent, setUrgent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const from = useMemo(() => new Date(Date.now() - 90 * 86400_000).toISOString(), []);
  const past = useBoughtHistory(true, from);
  const usual = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of past.items) if (i.category === cat) m.set(i.title, (m.get(i.title) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [past.items, cat]);
  const submit = async () => {
    const t = title.trim();
    if (!t) { setErr('צריך לכתוב מה לקנות'); ref.current?.focus(); return; }
    setBusy(true); setErr('');
    try {
      await addShopping(ctx.actor, { title: t, qty: qty.trim(), note: note.trim(), link: fixLink(link), category: cat, urgent });
      toast({ text: `נוסף ל${catOf(cat).label}: ${t}` }, 2500);
      setTitle(''); setQty(''); setNote(''); setLink(''); setUrgent(false); ref.current?.focus();
    } catch (e) { setErr((e as Error).message || 'לא נשמר'); } finally { setBusy(false); }
  };
  return (
    <Form onSubmit={submit}>
      <Seg label="לאיזו רשימה?" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c.id, label: c.label }))} />
      <Field label={cat === 'giveaway' ? 'מה מחפשים?' : 'מה לקנות?'} help={catOf(cat).hint || undefined}>{(id) => <input id={id} ref={ref} className="r-input big" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} maxLength={200} enterKeyHint="done" autoComplete="off" />}</Field>
      {!title && usual.length > 0 && <div className="r-sugg" style={{ padding: 0 }}><span>קונים בדרך כלל:</span>{usual.map((t) => <button key={t} type="button" onClick={() => { setTitle(t); ref.current?.focus(); }}>{t}</button>)}</div>}
      <Field label="כמה?" help="לא חובה. 6 קרטונים, 2 חבילות, 50 מטר">{(id) => <input id={id} className="r-input" value={qty} onChange={(e) => setQty(e.target.value)} maxLength={40} enterKeyHint="done" autoComplete="off" />}</Field>
      {err && <p className="r-err" role="alert">{err}</p>}
      <h2 className="r-optional">אפשר גם, לא חובה</h2>
      <Tick on={urgent} onChange={setUrgent} help="עולה לראש הרשימה">דחוף</Tick>
      <details className="r-details">
        <summary>הערה או קישור</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="הערה">{(id) => <input id={id} className="r-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="איזה סוג, מאיזו חנות" />}</Field>
          <Field label="קישור למוצר">{(id) => <input id={id} className="r-input" dir="ltr" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} maxLength={2000} placeholder="https://" />}</Field>
        </div>
      </details>
      <div className="r-dock"><span className="r-what">{[catOf(cat).label, qty.trim(), urgent && 'דחוף'].filter(Boolean).join(' · ')}</span><Btn type="submit" fit disabled={busy}>הוספה</Btn></div>
    </Form>
  );
}
