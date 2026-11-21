// F4-Presence: when I am at the farm. Pick days, hours (all day / morning / afternoon / other), a note; my existing entries.
import { useMemo, useState } from 'react';
import { AppScreen, useRemove, useToast } from '../../core';
import { back } from '../../../router';
import { BottomBar, Button, ChoiceChip, ConfirmSheet, Field, FormHeader } from '../../kit';
import { DAY_LETTERS } from '../../format';
import type { ScreenProps } from '../../ctx';
import { removePresence, savePresence, useCalendarRange } from '../../data/farm';
import { PRESETS, addDays, dayNum, entryText, hoursOf, hoursValid, isPresence, labelOf, nextDays, normTime, saveLabel, weekdayOf, type Hours, type PresenceLabel } from './logic';
import { DayPicker } from './parts';

const MODES: { value: PresenceLabel; label: string }[] = [{ value: 'allDay', label: 'כל היום' }, { value: 'morning', label: 'בוקר' }, { value: 'afternoon', label: 'אחה״צ' }, { value: 'other', label: 'אחר' }];
const validDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

export function PresenceScreen({ ctx, params }: ScreenProps) {
  const toast = useToast();
  const today = ctx.today;
  const first = validDate(params.date) && params.date >= today ? params.date : today;
  const [start, setStart] = useState(first > addDays(today, 6) ? first : today);
  const cal = useCalendarRange(today, addDays(today, 90), true);
  const mine = useMemo(() => cal.items.filter((it) => it.ownerUid === ctx.user.uid && isPresence(it) && it.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [cal.items, ctx.user.uid, today]);
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
    if (e.date > addDays(start, 6) || e.date < start) setStart(e.date > addDays(today, 6) ? e.date : today);
    setDays([e.date]); const h = hoursOf(e); setHours(h); setMode(labelOf(h)); setNote(e.note || ''); setEditing(e.kind === 'presence' ? e.id : '');
  };
  const toggle = (d: string) => { setEditing(''); setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d])); };
  const h: Hours = mode === 'allDay' ? { from: '', to: '' } : { from: normTime(hours.from) || hours.from, to: normTime(hours.to) || hours.to };
  const ok = days.length > 0 && hoursValid(h) && (mode === 'allDay' || !!h.from || !!h.to);

  async function save() {
    if (!ok) return;
    try {
      await savePresence(ctx.actor, days, cal.items, { from: normTime(h.from), to: normTime(h.to) }, note);
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
      <FormHeader title="מתי אני בחווה" onCancel={() => back('/farm')} />
      <div className="farm-group">
        <span className="farm-group__label">באילו ימים</span>
        <DayPicker days={nextDays(start)} selected={days} onToggle={toggle} />
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
          <div className="farm-cardhead" style={{ minHeight: 40 }}><h2 style={{ fontSize: 15 }}>כבר רשום אצלך</h2></div>
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
