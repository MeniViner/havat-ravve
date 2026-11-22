// F4-Presence: when I am at the farm. Pick days, hours (all day / morning / afternoon / other), a note; my existing entries.
// Managers also register presence for someone else ("מי בחווה", ?uid=) and change or remove that person's entries, as the old calendar did.
import { useMemo, useState } from 'react';
import { AppScreen, useRemove, useToast } from '../../core';
import { back } from '../../../router';
import { BottomBar, Button, ChoiceChip, ConfirmSheet, Field, FormHeader } from '../../kit';
import { DAY_LETTERS } from '../../format';
import type { ScreenProps } from '../../ctx';
import { removePresence, savePresence, useCalendarRange } from '../../data/farm';
import { PRESETS, addDays, dayNum, entryText, firstOf, hoursOf, hoursValid, isPresence, labelOf, normTime, pickerDays, pickerStart, presencePeople, saveLabel, weekdayOf, type Hours, type PresenceLabel } from './logic';
import { DayPicker, OtherDate } from './parts';

const MODES: { value: PresenceLabel; label: string }[] = [{ value: 'allDay', label: 'כל היום' }, { value: 'morning', label: 'בוקר' }, { value: 'afternoon', label: 'אחה״צ' }, { value: 'other', label: 'אחר' }];
const validDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

export function PresenceScreen({ ctx, params }: ScreenProps) {
  const toast = useToast();
  const today = ctx.today;
  const first = validDate(params.date) && params.date >= today ? params.date : today;
  const [start, setStart] = useState(pickerStart(first, today));
  // whose presence: me, or (managers) the person picked under "מי בחווה"
  const people = useMemo(() => (ctx.manager ? presencePeople(ctx.team, ctx.profile) : [ctx.profile]), [ctx.manager, ctx.team, ctx.profile]);
  const [whoUid, setWhoUid] = useState(() => (ctx.manager && params.uid && people.some((p) => p.uid === params.uid) ? params.uid : ctx.user.uid));
  const whoP = people.find((p) => p.uid === whoUid);
  const me = whoUid === ctx.user.uid;
  const who = me || !whoP ? ctx.actor : { uid: whoP.uid, name: whoP.displayName };
  const cal = useCalendarRange(today, addDays(today, 90), true);
  const mine = useMemo(() => cal.items.filter((it) => it.ownerUid === who.uid && isPresence(it) && it.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [cal.items, who.uid, today]);
  const existing = mine.find((it) => it.date === first && it.kind === 'presence');
  const [days, setDays] = useState<string[]>([first]);
  const [hours, setHours] = useState<Hours>(existing ? hoursOf(existing) : PRESETS.morning);
  const [mode, setMode] = useState<PresenceLabel>(existing ? labelOf(hoursOf(existing)) : 'morning');
  const [note, setNote] = useState(existing?.note || '');
  // a new registration by default (the design); "שינוי" on an entry below switches to editing it
  const [editing, setEditing] = useState<string>('');
  const [loaded, setLoaded] = useState(!!existing || !cal.loading);
  // the entries arrive after the first render on Firestore: fill the form once from today's entry
  if (!loaded && !cal.loading) {
    setLoaded(true);
    const e = mine.find((it) => it.date === first && it.kind === 'presence');
    if (e) { setHours(hoursOf(e)); setMode(labelOf(hoursOf(e))); setNote(e.note || ''); }
  }

  const pick = (m: PresenceLabel) => {
    setMode(m);
    if (m === 'allDay') setHours({ from: '', to: '' });
    else if (m === 'morning' || m === 'afternoon') setHours(PRESETS[m]);
    else if (!hours.from && !hours.to) setHours(PRESETS.morning);
  };
  const edit = (id: string) => {
    const e = mine.find((x) => x.id === id); if (!e) return;
    if (e.date > addDays(start, 6) || e.date < start) setStart(pickerStart(e.date, today));
    setDays([e.date]); const h = hoursOf(e); setHours(h); setMode(labelOf(h)); setNote(e.note || ''); setEditing(e.kind === 'presence' ? e.id : '');
  };
  const toggle = (d: string) => { setEditing(''); setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d])); };
  // "תאריך אחר": any later day joins the chosen ones, and the picker's week moves to it
  const addDay = (d: string) => { setEditing(''); setStart(pickerStart(d, today)); setDays((s) => (s.includes(d) ? s : [...s, d])); };
  const pickWho = (uid: string) => {
    if (uid === whoUid) return;
    setWhoUid(uid); setEditing('');
    const e = cal.items.find((it) => it.ownerUid === uid && it.kind === 'presence' && it.date === days[0]);
    if (e) { const x = hoursOf(e); setHours(x); setMode(labelOf(x)); setNote(e.note || ''); } else setNote('');
  };
  const h: Hours = mode === 'allDay' ? { from: '', to: '' } : { from: normTime(hours.from) || hours.from, to: normTime(hours.to) || hours.to };
  const ok = days.length > 0 && hoursValid(h) && (mode === 'allDay' || !!h.from || !!h.to);

  async function save() {
    if (!ok) return;
    try {
      await savePresence(who, days, cal.items, { from: normTime(h.from), to: normTime(h.to) }, note);
      toast.show({ text: days.length === 1 ? 'נשמר ביומן' : `נשמר ביומן · ${days.length} ימים` });
      back('/farm');
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
  }
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();

  const bar = (
    <BottomBar column={!!editing}>
      <Button size="bar" grow={!editing} block={!!editing} disabled={!ok} onClick={save}>{saveLabel(days.length)}</Button>
      {editing && <Button variant="danger" onClick={() => setAskDelete(true)}>הסרה מהיומן</Button>}
    </BottomBar>
  );
  const fromBad = !!h.from && !normTime(h.from), toBad = !!h.to && !normTime(h.to);
  const orderBad = !fromBad && !toBad && !hoursValid(h);
  return (
    <AppScreen variant="form" gap={16} bar={bar}>
      <FormHeader title={me ? 'מתי אני בחווה' : `מתי ${firstOf(who.name)} בחווה`} onCancel={() => back('/farm')} />
      {ctx.manager && people.length > 1 && (
        <div className="farm-group">
          <span className="farm-group__label">מי בחווה</span>
          <div className="k-chips k-chips--wrap">
            {people.map((p) => <ChoiceChip key={p.uid} selected={whoUid === p.uid} onClick={() => pickWho(p.uid)}>{p.uid === ctx.user.uid ? 'אני' : firstOf(p.displayName)}</ChoiceChip>)}
          </div>
        </div>
      )}
      <div className="farm-group">
        <span className="farm-group__label">באילו ימים</span>
        <DayPicker days={pickerDays(start, days)} selected={days} onToggle={toggle} />
        <OtherDate min={today} onPick={addDay} />
      </div>
      <div className="farm-group">
        <span className="farm-group__label">באילו שעות</span>
        <div className="farm-hours">{MODES.map((m) => <ChoiceChip key={m.value} fill selected={mode === m.value} onClick={() => pick(m.value)}>{m.label}</ChoiceChip>)}</div>
      </div>
      {mode !== 'allDay' && (
        <div className="farm-row2">
          <Field label="משעה" numeric inputMode="numeric" value={hours.from} error={fromBad ? 'למשל 08:00' : orderBad ? 'לפני שעת הסיום' : undefined}
            onChange={(e) => { setHours({ ...hours, from: e.target.value }); setMode('other'); }} onBlur={() => setHours((x) => ({ ...x, from: normTime(x.from) || x.from }))} />
          <Field label="עד שעה" numeric inputMode="numeric" value={hours.to} error={toBad ? 'למשל 13:00' : undefined}
            onChange={(e) => { setHours({ ...hours, to: e.target.value }); setMode('other'); }} onBlur={() => setHours((x) => ({ ...x, to: normTime(x.to) || x.to }))} />
        </div>
      )}
      <Field label="הערה לצוות" placeholder="למשל: מביא את הטנדר" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      {mine.length > 0 && (
        <section className="farm-card" style={{ overflow: 'hidden' }}>
          <div className="farm-cardhead" style={{ minHeight: 40 }}><h2 style={{ fontSize: 15 }}>{me ? 'כבר רשום אצלך' : `כבר רשום אצל ${firstOf(who.name)}`}</h2></div>
          <ul className="farm-list">
            {mine.slice(0, 14).map((it) => (
              <li key={it.id} className="farm-item">
                <span className="farm-item__time">{DAY_LETTERS[weekdayOf(it.date)]} {dayNum(it.date)}</span>
                <div className="farm-item__body"><span className="farm-item__title">{entryText(hoursOf(it))}</span>{it.note && <span className="farm-item__meta">{it.note}</span>}</div>
                <button type="button" className="farm-link" onClick={() => edit(it.id)}>שינוי</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmSheet open={askDelete && !!editing} onClose={() => setAskDelete(false)} title="להסיר מהיומן?"
        text="היום הזה יוסר מהיומן של הצוות." confirmLabel="הסרה"
        onConfirm={() => remove(() => removePresence(editing), { text: 'הוסר מהיומן', after: () => back('/farm') })} />
    </AppScreen>
  );
}
