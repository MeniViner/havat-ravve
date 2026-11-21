// C11-CalItem: new (or edit) calendar item: what, when, hours, who sees, participants, reminder. Managers; volunteers go to F4.
import { useEffect, useState } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { back } from '../../../router';
import { BottomBar, Button, ChoiceChip, EmptyState, Field, FormHeader, ListCard, Row, Toggle } from '../../kit';
import type { ScreenProps } from '../../ctx';
import { deleteCalItem, saveCalItem, useCalItem, type FarmCalItem } from '../../data/farm';
import { addDays, firstOf, hoursOf, hoursValid, isPresence, nextDays, normTime } from './logic';
import { DayPicker } from './parts';

const validDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

export function CalItemForm({ ctx, params }: ScreenProps) {
  const id = params.id || '';
  const item = useCalItem(id);
  useEffect(() => {
    if (ctx.manager) return;
    // volunteers add only their own presence (F4)
    go(`/farm/presence${validDate(params.date) ? `?date=${params.date}` : ''}`, true);
  }, [ctx.manager]);
  if (!ctx.manager) return null;
  if (id && item.loading) return <AppScreen variant="form"><FormHeader title="פריט ביומן" onCancel={() => back('/farm/calendar')} /></AppScreen>;
  if (id && (!item.item || item.item.kind === 'event' || item.item.kind === 'visit' || isPresence(item.item))) {
    return (
      <AppScreen variant="form">
        <FormHeader title="פריט ביומן" onCancel={() => back('/farm/calendar')} />
        <EmptyState variant="card" icon="calendar" title={item.item ? 'את הפריט הזה עורכים במקום אחר' : 'הפריט לא נמצא'} text={item.item ? 'אירועים וביקורים נערכים בניהול, ונוכחות במסך הנוכחות.' : 'אולי הוא נמחק.'} />
      </AppScreen>
    );
  }
  return <Form key={id || 'new'} ctx={ctx} params={params} existing={item.item} />;
}

function Form({ ctx, params, existing }: ScreenProps & { existing: FarmCalItem | null }) {
  const toast = useToast();
  const today = ctx.today;
  const h0 = existing ? hoursOf(existing) : { from: '', to: '' };
  const [title, setTitle] = useState(existing?.title || '');
  const [date, setDate] = useState(existing?.date || validDate(params.date) || today);
  const [from, setFrom] = useState(h0.from);
  const [to, setTo] = useState(h0.to);
  const [audience, setAudience] = useState<'all' | 'managers'>(existing?.audience === 'managers' ? 'managers' : 'all');
  const [participants, setParticipants] = useState<string[]>(existing?.participants || []);
  const [reminder, setReminder] = useState(existing ? !!existing.reminder : true);
  const start = date < today || date > addDays(today, 6) ? date : today;
  const rank = (r: string) => (r === 'owner' ? 0 : r === 'manager' ? 1 : 2);
  const people = ctx.team.filter((p) => audience === 'all' || rank(p.role) < 2)
    .sort((a, b) => rank(a.role) - rank(b.role) || a.displayName.localeCompare(b.displayName, 'he'));
  const extra = participants.filter((u) => !people.some((p) => p.uid === u));
  const h = { from: normTime(from) || from, to: normTime(to) || to };
  const fromBad = !!from && !normTime(from), toBad = !!to && !normTime(to);
  const ok = !!title.trim() && !!validDate(date) && hoursValid(h);
  const toggle = (uid: string) => setParticipants((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));

  async function save() {
    if (!ok) return;
    try {
      await saveCalItem(ctx.actor, { title, date, from: normTime(from), to: normTime(to), audience, participants, reminder }, existing);
      toast.show({ text: existing ? 'נשמר ביומן' : 'נוסף ליומן' });
      back(`/farm/calendar?view=day&date=${date}`);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
  }
  async function remove() {
    if (!existing) return;
    try { await deleteCalItem(existing.id); toast.show({ text: 'הפריט הוסר מהיומן' }); back(`/farm/calendar?view=day&date=${date}`); } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
  }
  const bar = (
    <BottomBar column={!!existing}>
      <Button size="bar" grow={!existing} block={!!existing} disabled={!ok} onClick={save}>{existing ? 'שמירה' : 'הוספה ליומן'}</Button>
      {existing && <Button variant="danger" onClick={remove}>מחיקה מהיומן</Button>}
    </BottomBar>
  );
  return (
    <AppScreen variant="form" bar={bar}>
      <FormHeader title="פריט ביומן" onCancel={() => back('/farm/calendar')} />
      <Field label="מה קורה" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <div className="farm-group" style={{ gap: 6 }}>
        <span className="farm-group__label">מתי</span>
        <DayPicker days={nextDays(start)} selected={[date]} onToggle={setDate} />
      </div>
      <div className="k-fieldrow" style={{ gap: 12 }}>
        <Field grow label="משעה" ltr inputMode="numeric" value={from} error={fromBad ? 'למשל 10:30' : undefined} onChange={(e) => setFrom(e.target.value)} onBlur={() => setFrom((v) => normTime(v) || v)} />
        <Field grow label="עד שעה" ltr inputMode="numeric" value={to} error={toBad ? 'למשל 11:30' : !fromBad && !toBad && !hoursValid(h) ? 'אחרי שעת ההתחלה' : undefined} onChange={(e) => setTo(e.target.value)} onBlur={() => setTo((v) => normTime(v) || v)} />
      </div>
      <div className="farm-group">
        <span className="farm-group__label">מי רואה</span>
        <div className="k-chips k-chips--wrap">
          <ChoiceChip selected={audience === 'all'} onClick={() => setAudience('all')}>כל הצוות</ChoiceChip>
          <ChoiceChip selected={audience === 'managers'} onClick={() => setAudience('managers')}>מנהלים בלבד</ChoiceChip>
        </div>
      </div>
      <div className="farm-group">
        <span className="farm-group__label">מי משתתף</span>
        <div className="k-chips k-chips--wrap">
          {people.map((p) => <ChoiceChip key={p.uid} selected={participants.includes(p.uid)} onClick={() => toggle(p.uid)}>{firstOf(p.displayName)}</ChoiceChip>)}
          {extra.map((u) => <ChoiceChip key={u} selected onClick={() => toggle(u)}>{firstOf(ctx.peopleByUid.get(u)?.displayName || u)}</ChoiceChip>)}
        </div>
      </div>
      <ListCard>
        <Row minHeight={58} title="להזכיר שעה לפני" meta="התראה למי שמשתתף" actions={<Toggle checked={reminder} onChange={setReminder} label="להזכיר שעה לפני" />} />
      </ListCard>
    </AppScreen>
  );
}
