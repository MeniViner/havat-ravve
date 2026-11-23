// L1 (recurring tasks, reached from the managers-only row at the bottom of Tasks) and Q24 (one recurring task, in the add
// form). Templates feed store.materializeToday: every morning an active template due that weekday becomes a task
// "<templateId>_<date>". Old template fields stay; assignee / placeId are optional.
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { TopBar, PageTitle, Button, Card, Toggle, EmptyState } from '../../kit';
import { firstName, ddmm } from '../../format';
import type { Template } from '../../../types';
import { useTemplateTasks } from '../../../store';
import { todayKey } from '../../../clock';
import { templateMeta, setTemplateActive, addDays } from '../../data/tasks';
import { record30 } from '../manage/calc';
import { AddForm, NotFound } from './Add';
import { to, useFail } from './shared';
import './tasks.css';
import './recurring.css';

/** The last 30 days of one template (tasks "<templateId>_<date>" since 30 days ago). */
function useRecord(t: Template | undefined) {
  const today = todayKey();
  const tasks = useTemplateTasks(t?.id || '', addDays(today, -30) + 'T00:00:00.000Z', !!t).items;
  return record30(t?.days || [], tasks, today, firstName);
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

/** Q24: a recurring task is created and edited in the normal add form ("חוזרת"); the separate recurring form is gone.
 *  /manage/recurring/new opens the form on "חוזרת"; /manage/recurring/:id opens it on the recurring task, with its
 *  30-day record as a card under the form (the small-additions table) and delete behind ⋯. */
export function RecurringForm({ ctx, params }: ScreenProps) {
  const existing = params.id ? ctx.templates.find((t) => t.id === params.id) : undefined;
  if (params.id && !existing) return <NotFound title="המשימה החוזרת לא נמצאה" backTo="/manage/recurring" />;
  return <AddForm key={existing?.id || 'new'} ctx={ctx} params={params} task={null} item={null} template={existing} recurringStart={!existing}
    below={existing ? <Record t={existing} /> : undefined} />;
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
