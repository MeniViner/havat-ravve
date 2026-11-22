// L1 (recurring tasks) and L2 (one recurring task). Templates feed store.materializeToday: every morning an active
// template due that weekday becomes a task "<templateId>_<date>". Old template fields stay; assignee / placeId are optional.
import { useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useRemove, useToast } from '../../core';
import { TopBar, PageTitle, Button, Card, Toggle, FormHeader, Field, FieldRow, TextAreaField, ChoiceGroup, ChoiceChip, BottomBar, Row, EmptyState, ConfirmSheet } from '../../kit';
import { back } from '../../../router';
import { DAY_LETTERS, firstName, ddmm } from '../../format';
import type { Template } from '../../../types';
import { useTemplateTasks } from '../../../store';
import { todayKey } from '../../../clock';
import { templateMeta, setTemplateActive, saveTemplateV2, removeTemplate, daysToSave, addDays } from '../../data/tasks';
import { record30 } from '../manage/calc';
import { to, useFail } from './shared';
import './tasks.css';
import './recurring.css';

/** The last 30 days of one template (tasks "<templateId>_<date>" since 30 days ago). */
function useRecord(t: Template | undefined) {
  const today = todayKey();
  const tasks = useTemplateTasks(t?.id || '', addDays(today, -30) + 'T00:00:00.000Z', !!t).items;
  return record30(t?.days || [], tasks, today, firstName);
}
/** "בוצעה X מ־Y" in the list (the old Done30). */
function Done30({ t }: { t: Template }) {
  const r = useRecord(t);
  return r.expected ? <span className="tasks-meta">{`בוצעה ${r.done} מ־${r.expected}`}</span> : null;
}

export function RecurringList({ ctx }: ScreenProps) {
  const fail = useFail();
  const list = [...ctx.templates].sort((a, b) => Number(!a.active) - Number(!b.active));
  const active = list.filter((t) => t.active).length;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'משימות', ...to('/tasks') }} end={<Button icon="plus" iconSize={18} {...to('/manage/recurring/new')}>חדשה</Button>} />
      <PageTitle size="root">משימות חוזרות</PageTitle>
      {list.length > 0 ? (
        <Card as="section">
          <ul className="k-list k-list--flush" style={{ margin: 0 }}>
            {list.map((t) => (
              <li key={t.id} className={`tasks-tpl${t.active ? '' : ' tasks-tpl--off'}`}>
                <a className="tasks-tpl__link" {...to(`/manage/recurring/${t.id}`)}>
                  <span className="tasks-tpl__title">{t.title}</span>
                  <span className="tasks-meta">{templateMeta(t)}</span>
                  {t.active && <Done30 t={t} />}
                </a>
                <Toggle checked={t.active} onChange={(v) => setTemplateActive(t, v).catch(fail)} label={`פעילה: ${t.title}`} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState variant="card" title="עוד אין משימות חוזרות" text="משימה חוזרת נכנסת כל בוקר לרשימת המשימות של היום" />
      )}
      {list.length > 0 && <span className="tasks-meta">{`${active === 1 ? 'אחת פעילה' : `${active} פעילות`}. כל בוקר הן נכנסות לרשימת המשימות של היום.`}</span>}
    </AppScreen>
  );
}

type Who = 'free' | 'person' | 'managers';
export function RecurringForm({ ctx, params }: ScreenProps) {
  const existing = params.id ? ctx.templates.find((t) => t.id === params.id) : undefined;
  if (params.id && !existing) {
    return (
      <AppScreen variant="form">
        <FormHeader title="משימה חוזרת" onCancel={() => back('/manage/recurring')} />
        <EmptyState variant="card" title="המשימה החוזרת לא נמצאה" text="אולי נמחקה בינתיים" />
      </AppScreen>
    );
  }
  return <TemplateForm key={existing?.id || 'new'} ctx={ctx} params={params} existing={existing} />;
}

function TemplateForm({ ctx, existing }: ScreenProps & { existing?: Template }) {
  const toast = useToast(); const fail = useFail();
  const [title, setTitle] = useState(existing?.title || '');
  const [note, setNote] = useState(existing?.note || '');
  const [days, setDays] = useState<number[]>(existing ? (existing.days.length ? existing.days : [0, 1, 2, 3, 4, 5, 6]) : [0, 1, 2, 3, 4, 5, 6]);
  const [time, setTime] = useState(existing?.time || '');
  const [placeText, setPlaceText] = useState(ctx.places.find((p) => p.id === existing?.placeId)?.name || '');
  const [who, setWho] = useState<Who>(existing?.managersOnly ? 'managers' : existing?.assignee ? 'person' : 'free');
  const [person, setPerson] = useState(existing?.assignee?.uid || '');
  const [active, setActive] = useState(existing ? existing.active : true);
  const [busy, setBusy] = useState(false);
  const toggleDay = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  const place = ctx.places.find((p) => p.name.trim() === placeText.trim());
  const placeBad = !!placeText.trim() && !place;
  const timeBad = !!time.trim() && !/^\d{1,2}:\d{2}$/.test(time.trim());

  const save = async () => {
    if (!title.trim() || !days.length || placeBad || timeBad) return;
    if (who === 'person' && !person) { toast.refused('לא נשמר. בחרו מי עושה אותה'); return; }
    setBusy(true);
    const p = ctx.team.find((x) => x.uid === person);
    try {
      await saveTemplateV2(ctx.actor, {
        title, note: note.trim(), days: daysToSave(days), time: time.trim() ? time.trim().padStart(5, '0') : '', active,
        managersOnly: who === 'managers', assignee: who === 'person' && p ? { uid: p.uid, name: p.displayName } : null, placeId: place?.id || '',
      }, existing);
      toast.show({ text: 'נשמר' });
      back('/manage/recurring');
    } catch (e) { fail(e); setBusy(false); }
  };
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();
  return (
    <AppScreen variant="form" gap={16} bar={
      <BottomBar>
        <Button size="bar" grow disabled={busy || !title.trim() || !days.length || placeBad || timeBad} onClick={save}>שמירה</Button>
        {existing && <Button variant="secondary" size="bar" onClick={() => setAskDelete(true)}>מחיקה</Button>}
      </BottomBar>
    }>
      <FormHeader title="משימה חוזרת" onCancel={() => back('/manage/recurring')} />
      <Field label="מה עושים" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label="הסבר קצר (לא חובה)" height={76} placeholder="10 דקות לכל עציץ, לבדוק שהצינור לא סתום." value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="tasks-days">
        <span className="tasks-days__label">באילו ימים</span>
        <div className="tasks-days__row" role="group" aria-label="באילו ימים">
          {DAY_LETTERS.map((l, i) => (
            <ChoiceChip key={i} fill tall selected={days.includes(i)} onClick={() => toggleDay(i)}><span aria-label={`יום ${l}`}>{l}</span></ChoiceChip>
          ))}
        </div>
      </div>
      <FieldRow className="tasks-halves">
        <Field label="עד איזו שעה" ltr inputMode="numeric" placeholder="07:00" value={time} onChange={(e) => setTime(e.target.value)} error={timeBad ? 'למשל 07:00' : undefined} />
        <Field label="איפה" list="tasks-places" value={placeText} onChange={(e) => setPlaceText(e.target.value)} error={placeBad ? 'אין מקום בשם הזה' : undefined} />
      </FieldRow>
      <datalist id="tasks-places">{ctx.places.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <ChoiceGroup label="על מי" value={who} onChange={setWho} options={[{ value: 'free', label: 'מי שפנוי' }, { value: 'person', label: 'אדם קבוע' }, { value: 'managers', label: 'מנהלים בלבד' }]} />
      {who === 'person' && (
        <ChoiceGroup label="מי" value={person} onChange={setPerson} options={ctx.team.filter((p) => p.status === 'active').map((p) => ({ value: p.uid, label: p.displayName }))} />
      )}
      <Card as="section">
        <ul className="k-list k-list--flush" style={{ margin: 0 }}>
          <Row title="פעילה" meta="כשכבויה, לא נוצרת משימה בבוקר" minHeight={58} actions={<Toggle checked={active} onChange={setActive} label="פעילה" />} />
        </ul>
      </Card>
      {existing && <Record t={existing} />}
      {existing && (
        <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את המשימה החוזרת?"
          text={`"${existing.title}" לא תיווצר יותר. משימות שכבר נוצרו נשארות.`} confirmLabel="מחיקה"
          onConfirm={() => remove(() => removeTemplate(existing.id), { text: 'המשימה החוזרת נמחקה', after: () => go('/manage/recurring', true) })} />
      )}
    </AppScreen>
  );
}

/** "30 הימים האחרונים": a 30-day grid (done / not done / not due), done of due, and who did it. */
function Record({ t }: { t: Template }) {
  const r = useRecord(t);
  return (
    <Card as="section" className="recurring-record" aria-label="30 הימים האחרונים">
      <div className="recurring-record__head">
        <span>30 הימים האחרונים</span>
        <span className="recurring-record__count">{`בוצעה ${r.done} מ־${r.expected}`}</span>
      </div>
      <ul className="recurring-grid">
        {r.grid.map((g) => {
          const state = !g.due ? 'לא רלוונטי' : g.done ? 'בוצע' : 'לא בוצע';
          return <li key={g.k} className={`recurring-grid__day${g.done ? ' recurring-grid__day--done' : g.due ? ' recurring-grid__day--missed' : ''}`}
            title={`${ddmm(g.k)} · ${state}${g.by ? ' · ' + g.by : ''}`} aria-label={`${ddmm(g.k)} ${state}${g.by ? ' ' + g.by : ''}`} />;
        })}
      </ul>
      <p className="recurring-record__lead">{`ירוק בוצע · בהיר לא בוצע · אפור לא רלוונטי.${r.who.length ? ` מבצעים: ${r.who.map(([n, c]) => `${n} ${c}`).join(', ')}.` : ''}`}</p>
    </Card>
  );
}
