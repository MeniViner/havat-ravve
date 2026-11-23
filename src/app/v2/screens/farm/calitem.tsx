// Q31-CalItem (C11): new (or edit) calendar item: what, its kind ('סוג' chips under the title), when, hours, who sees,
// participants (chips up to five people, past that one row with a check-box picker, rule 9), reminder. Managers; volunteers go to F4. Editing: delete is in ⋯ beside "ביטול" (rule 6).
import { useEffect, useState } from 'react';
import { AppScreen, go, useRemove, useToast } from '../../core';
import { back } from '../../../router';
import { Avatar, BottomBar, Button, ChoiceChip, EmptyState, Field, FormHeader, ListCard, MoreMenu, PickerSheet, Row, SearchField, SelectRow, Toggle } from '../../kit';
import type { ScreenProps } from '../../ctx';
import { deleteCalItem, saveCalItem, useCalItem, type FarmCalItem } from '../../data/farm';
import { TEAM_KINDS, firstOf, hoursOf, hoursValid, isTeamItem, normTime, pickerDays, pickerStart, teamKindOf, type TeamKind } from './logic';
import { DayGroup, DayPicker, FormEnd } from './parts';

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
  if (id && (!item.item || !isTeamItem(item.item))) {
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
  const [kind, setKind] = useState<TeamKind>(existing ? teamKindOf(existing.kind) : 'manual');
  const start = pickerStart(date, today);
  const rank = (r: string) => (r === 'owner' ? 0 : r === 'manager' ? 1 : 2);
  // the design's order: the people already taking part first (in the order they were added), then owners, managers,
  // volunteers. Re-sorted only when the form opens or "מי רואה" changes, so chips never jump under a finger.
  const [first, setFirst] = useState<string[]>(() => existing?.participants || []);
  const pickAudience = (a: 'all' | 'managers') => { setAudience(a); setFirst(participants); };
  const pos = (uid: string) => { const i = first.indexOf(uid); return i < 0 ? first.length : i; };
  const people = ctx.team.filter((p) => audience === 'all' || rank(p.role) < 2)
    .sort((a, b) => pos(a.uid) - pos(b.uid) || rank(a.role) - rank(b.role) || a.displayName.localeCompare(b.displayName, 'he'));
  const extra = participants.filter((u) => !people.some((p) => p.uid === u));
  const all = [...people.map((p) => ({ uid: p.uid, name: p.displayName })), ...extra.map((u) => ({ uid: u, name: ctx.peopleByUid.get(u)?.displayName || u }))];
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const chosen = participants.map((u) => firstOf(all.find((p) => p.uid === u)?.name || u));
  const whoText = !chosen.length ? 'אין' : chosen.length <= 3 ? chosen.join(', ') : `${chosen.slice(0, 3).join(', ')} ועוד ${chosen.length - 3}`;
  const h = { from: normTime(from) || from, to: normTime(to) || to };
  const fromBad = !!from && !normTime(from), toBad = !!to && !normTime(to);
  const ok = !!title.trim() && !!validDate(date) && hoursValid(h);
  const toggle = (uid: string) => setParticipants((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));

  async function save() {
    if (!ok) return;
    try {
      await saveCalItem(ctx.actor, { title, date, from: normTime(from), to: normTime(to), audience, participants, reminder, kind }, existing);
      toast.show({ text: existing ? 'נשמר ביומן' : 'נוסף ליומן' });
      back(`/farm/calendar?view=day&date=${date}`);
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
  }
  const remove = useRemove();
  const bar = (
    <BottomBar>
      <Button size="bar" grow disabled={!ok} onClick={save}>{existing ? 'שמירה' : 'הוספה ליומן'}</Button>
    </BottomBar>
  );
  const more = existing ? (
    <MoreMenu title="פריט ביומן" items={[{
      label: 'מחיקה', icon: 'trash', tone: 'danger',
      confirm: {
        title: 'למחוק מהיומן?', text: `"${existing.title}" יימחק מהיומן של כולם.`, confirmLabel: 'מחיקה',
        onConfirm: () => remove(() => deleteCalItem(existing.id), { text: 'הפריט הוסר מהיומן', after: () => back(`/farm/calendar?view=day&date=${date}`) }),
      },
    }]} />
  ) : null;
  return (
    <AppScreen variant="form" bar={bar}>
      <FormHeader title="פריט ביומן" end={<FormEnd onCancel={() => back('/farm/calendar')} more={more} />} />
      <Field label="מה קורה" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <div className="farm-group">
        <span className="farm-group__label">סוג</span>
        <div className="k-chips k-chips--wrap">
          {TEAM_KINDS.map((k) => <ChoiceChip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</ChoiceChip>)}
        </div>
      </div>
      <DayGroup label="מתי" gap={6} onPick={setDate}>
        <DayPicker days={pickerDays(start, [date])} selected={[date]} onToggle={setDate} />
      </DayGroup>
      <div className="k-fieldrow" style={{ gap: 12 }}>
        <Field grow label="משעה" ltr inputMode="numeric" value={from} error={fromBad ? 'למשל 10:30' : undefined} onChange={(e) => setFrom(e.target.value)} onBlur={() => setFrom((v) => normTime(v) || v)} />
        <Field grow label="עד שעה" ltr inputMode="numeric" value={to} error={toBad ? 'למשל 11:30' : !fromBad && !toBad && !hoursValid(h) ? 'אחרי שעת ההתחלה' : undefined} onChange={(e) => setTo(e.target.value)} onBlur={() => setTo((v) => normTime(v) || v)} />
      </div>
      <div className="farm-group">
        <span className="farm-group__label">מי רואה</span>
        <div className="k-chips k-chips--wrap">
          <ChoiceChip selected={audience === 'all'} onClick={() => pickAudience('all')}>כל הצוות</ChoiceChip>
          <ChoiceChip selected={audience === 'managers'} onClick={() => pickAudience('managers')}>מנהלים בלבד</ChoiceChip>
        </div>
      </div>
      {all.length <= 5 ? (
        <div className="farm-group">
          <span className="farm-group__label">מי משתתף</span>
          <div className="k-chips k-chips--wrap">
            {all.map((p) => <ChoiceChip key={p.uid} selected={participants.includes(p.uid)} onClick={() => toggle(p.uid)}>{firstOf(p.name)}</ChoiceChip>)}
          </div>
        </div>
      ) : (
        // rule 9: past five people "מי משתתף" is one row that opens a picker with check boxes
        <>
          <SelectRow label="מי משתתף" value={whoText} onClick={() => { setQ(''); setPicking(true); }} />
          <PickerSheet open={picking} onClose={() => setPicking(false)} title="מי משתתף" multiple values={participants} value={null} onChange={toggle}
            head={all.length > 8 ? <SearchField label="חיפוש בצוות" placeholder="חיפוש: שם" size="sm" value={q} onChange={(e) => setQ(e.target.value)} /> : undefined}
            options={(q.trim() ? all.filter((p) => p.name.includes(q.trim())) : all).map((p) => ({ value: p.uid, label: p.name, leading: <Avatar name={p.name} size={32} /> }))} />
        </>
      )}
      <ListCard>
        <Row minHeight={58} title="להזכיר שעה לפני" meta="התראה למי שמשתתף" actions={<Toggle checked={reminder} onChange={setReminder} label="להזכיר שעה לפני" />} />
      </ListCard>
    </AppScreen>
  );
}
