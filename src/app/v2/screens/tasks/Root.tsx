// T1 / T2 / T4 / L5 (staff) and P1 / P6 (managers, owners): the tasks root, the home screen of the team.
import { useMemo } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, RootHead, go, useToast, useV2 } from '../../core';
import { ProgressSegments, NextUpCard, Button, Segmented, ListCard, Row, CheckButton, EmptyState, ChipRow, Chip, Icon, Strip } from '../../kit';
import { useParam } from '../../../router';
import { useEvent } from '../../../data';
import { useClockVersion, nowMs, nowIso } from '../../../clock';
import { useDemo, useDemoStates } from '../../../demo/store';
import { dayOverline, ddmm } from '../../format';
import { ProjectsBlock } from '../projects';
import { BroadcastCard } from '../broadcast';
import { OfflineQueue } from '../system';
import { useOnline } from '../../../store';
import { useMySteps, useSteps, completeStep, reopenStep, projectLink, stepLink, type MyStep } from '../../data/projects';
import {
  useRootTasks, pickNextUp, progressOf, progressCaption, groupByPlace, groupByTime, ordered, isMine, isForToday, isFree,
  rowMeta, dueText, splitOverdue, routineTime, DONE_VISIBLE_MS,
} from '../../data/tasks';
import type { Task } from '../../../types';
import { TaskRow, TasksCapture, useTaskActions, useFail, useDoneHere, useProfileOf, to } from './shared';
import './tasks.css';

type View = 'place' | 'time' | 'mine' | 'free';
// "פנויות" is the old tab of free tasks: by place, free tasks only (the same list L5's ?free=1 opens)
const VIEWS: { value: View; label: string }[] = [{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }, { value: 'mine', label: 'רק שלי' }, { value: 'free', label: 'פנויות' }];
/** The old list's error line: a missing index while the system gets ready, otherwise the read error itself. */
const loadError = (e: string) => (e.includes('index') ? 'המערכת עדיין מתכוננת (אינדקסים). נסו שוב בעוד דקה.' : e);
const ProjectTag = () => <span className="tasks-tag-project">פרויקט</span>;
const DAY30 = 30 * 86400_000;

export function TasksRoot({ ctx }: ScreenProps) {
  useClockVersion();
  const demo = useDemo(); const states = useDemoStates();
  const online = useOnline();
  // C8: without reception the queue of kept writes takes the place of "הבא בתור" and the view switch
  const offline = !online || (demo.on && states.offline);
  const viewParam = useParam('view');
  // L5 "לקחת אחת מהפנויות": by place, free tasks only, until the chip is closed
  const freeParam = useParam('free') === '1';
  // "/tasks?event=<id>" (from the event's screen): only the tasks that prepare that event, by time unless a view was chosen
  const eventId = useParam('event');
  const ev = useEvent(eventId, !!eventId);
  const doneHere = useDoneHere(); const profileOf = useProfileOf();
  const view = (offline ? 'place' : viewParam || (eventId ? 'time' : 'place')) as View;
  const onlyFree = view === 'free' || (view === 'place' && freeParam);
  const root = useRootTasks(ctx);
  const steps = useMySteps(ctx);
  const uid = ctx.user.uid; const today = ctx.today; const now = nowMs();
  const a = useTaskActions();

  // L5 in the demo ("רשימות ריקות"): everything that was on me today shows as done.
  const all = useMemo(() => (demo.on && states.empty
    ? root.items.map((t) => (isMine(t, uid) && isForToday(t, today) ? { ...t, done: true, doneBy: ctx.actor, doneAt: nowIso() } : t))
    : root.items), [root.items, demo.on, states.empty, uid, today, ctx.actor]);
  const tasks = useMemo(() => (eventId ? all.filter((t) => t.eventId === eventId) : all), [all, eventId]);

  const nameOf = (id: string) => ctx.places.find((p) => p.id === id)?.name;
  const nextStep: MyStep | undefined = ctx.manager && !offline && !eventId ? steps.items.find((s) => !s.step.done) : undefined;
  const nextTask = nextStep || offline || eventId ? null : pickNextUp(tasks, uid, today);
  const lists = nextTask ? tasks.filter((t) => t.id !== nextTask.id) : tasks;

  // P6 "עליך": my tasks (open, and done in the last 24h) and my project steps, without the one in "הבא בתור".
  const mineTasks = ordered(lists.filter((t) => isMine(t, uid) && (!t.done || now - Date.parse(t.doneAt || '') < DONE_VISIBLE_MS)), uid, today);
  const mineSteps = steps.items.filter((s) => s !== nextStep && (!s.step.done || now - Date.parse(s.step.doneAt || '') < DAY30));
  const mineCount = mineTasks.length + mineSteps.length;
  const progress = ctx.manager
    ? { total: mineCount + (nextStep || nextTask ? 1 : 0), done: mineTasks.filter((t) => t.done).length + mineSteps.filter((s) => s.step.done).length }
    : progressOf(tasks, uid, today);
  const caption = progressCaption(progress.done, progress.total);

  const evQuery = eventId ? `event=${encodeURIComponent(eventId)}` : '';
  const setView = (v: View) => go(v === 'place' && !evQuery ? '/tasks' : `/tasks?${[v === 'place' && !evQuery ? '' : `view=${v}`, evQuery].filter(Boolean).join('&')}`, true);
  const free = tasks.filter((t) => isFree(t) && isForToday(t, today));
  // "באיחור" stands apart, in its own group (the old list's late section), in every view
  const [placeLate, placeRest] = splitOverdue(onlyFree ? lists.filter((t) => isFree(t) && !t.done) : lists, uid, today);
  const placeGroups = groupByPlace(placeRest, uid, today, nameOf, doneHere).filter((g) => g.rows.length);
  const timeGroups = groupByTime(lists, uid, today, true);
  const myOpen = lists.filter((t) => isMine(t, uid) && !t.done);
  const [myLate, myRows] = splitOverdue(ordered(lists.filter((t) => isMine(t, uid) && (!t.done || now - Date.parse(t.doneAt || '') < DONE_VISIBLE_MS)), uid, today), uid, today);
  const stepsShown = ctx.manager && !eventId ? mineSteps : [];
  const stepsOpen = stepsShown.filter((s) => !s.step.done);
  const stepsDone = stepsShown.filter((s) => s.step.done);
  const doneToday = progress.done;
  // the old "בוצעו ביממה האחרונה · N" link to the history (the root keeps done tasks for 24 hours)
  const recent = all.filter((t) => t.done).length;
  const failed = !!root.error && !root.loading;
  const lateCard = (rows: Task[]) => rows.length > 0 && (
    <ListCard title="באיחור" count={rows.length} tone="quiet" className="tasks-late">
      {rows.map((t) => <TaskRow key={t.id} t={t} view="late" />)}
    </ListCard>
  );
  const eventTitle = ev.item?.title || (ev.loading ? '…' : 'שנמחק');

  return (
    <AppScreen variant="root" capture={<TasksCapture />}>
      <RootHead overline={<span className="tasks-overline">{dayOverline(today)}</span>} title="משימות" />
      <BroadcastCard ctx={ctx} />
      {progress.total > 0 && <ProgressSegments className="tasks-progress" total={progress.total} done={progress.done} caption={caption} />}
      {offline && <OfflineQueue uid={uid} />}
      {nextStep && <NextStepCard s={nextStep} />}
      {nextTask && (
        <NextUpCard title={nextTask.title}
          meta={[nextTask.location?.placeName, rowMeta(nextTask, { uid, view: 'place', today, now, profileOf, time: routineTime(nextTask, ctx.templates) })].filter(Boolean).join(' · ')}
          actions={<>
            <Button size="big" grow icon="check" onClick={() => a.done(nextTask)}>בוצע</Button>
            <Button variant="secondary" size="lg" icon="camera" onClick={() => go(`/tasks/${nextTask.id}/done`)}>צילום</Button>
          </>} />
      )}
      {failed && <Strip tone="red" role="alert" className="tasks-loaderr">{loadError(root.error)}</Strip>}
      {ctx.manager && !eventId && <ProjectsBlock ctx={ctx} />}
      {eventId && (
        <ChipRow label="סינון">
          <Chip selected onClick={() => go('/tasks', true)}><span className="tasks-chip-x">{`משימות לאירוע ${eventTitle}${root.loading ? '' : ` · ${tasks.filter((t) => !t.done).length}`}`}<Icon name="close" size={16} /></span></Chip>
        </ChipRow>
      )}
      {!offline && <Segmented label="תצוגה" value={freeParam && view === 'place' ? 'free' : view} onChange={setView} options={VIEWS} />}
      {view === 'place' && freeParam && (
        <ChipRow label="סינון">
          <Chip selected onClick={() => go('/tasks', true)}><span className="tasks-chip-x">רק פנויות<Icon name="close" size={16} /></span></Chip>
        </ChipRow>
      )}

      {(view === 'place' || view === 'free') && lateCard(placeLate)}
      {(view === 'place' || view === 'free') && placeGroups.map((g) => (
        <ListCard key={g.key} title={g.title} icon="pin" count={g.open}>
          {g.rows.map((t) => <TaskRow key={t.id} t={t} view="place" placeName={g.title} strip />)}
        </ListCard>
      ))}
      {view === 'time' && timeGroups.map((g) => (
        <ListCard key={g.key} title={g.title} count={g.rows.length} tone="quiet" className={g.key === 'late' ? 'tasks-late' : undefined}>
          {g.rows.map((t) => <TaskRow key={t.id} t={t} view={g.key === 'late' ? 'late' : g.key === 'today' || g.key === 'none' ? 'time' : 'later'} />)}
        </ListCard>
      ))}
      {view === 'mine' && (myOpen.length === 0 && !stepsOpen.length && !nextTask && !root.loading && !failed ? (
        <EmptyState variant="done" className="tasks-empty-mine" title="סיימת את כל מה שעליך" text={doneToday === 1 ? 'משימה אחת היום' : `${doneToday} משימות היום`}
          action={free.length > 0 ? <Button className="tasks-take-free" onClick={() => go('/tasks?free=1', true)}>{`לקחת אחת מהפנויות · ${free.length}`}</Button> : undefined} />
      ) : <>
        {lateCard(myLate)}
        {/* Q2: "רק שלי" covers what the old "עליך" list showed, my project steps included (managers) */}
        {myRows.length + stepsShown.length > 0 && (
          <ListCard title="עליך" count={myRows.length + stepsShown.length}>
            {myRows.filter((t) => !t.done).map((t) => <TaskRow key={t.id} t={t} view="mine" />)}
            {stepsOpen.map((s) => <StepRow key={s.step.id} s={s} />)}
            {myRows.filter((t) => t.done).map((t) => <TaskRow key={t.id} t={t} view="mine" />)}
            {stepsDone.map((s) => <StepRow key={s.step.id} s={s} />)}
          </ListCard>
        )}
      </>)}
      {view !== 'mine' && !root.loading && !failed && lists.length === 0 && (
        <EmptyState variant="card" title="אין משימות פתוחות" text="משימה חדשה נכנסת מהשורה למטה" />
      )}
      {/* Q2: one row to the history and, for managers, one row to the recurring tasks. Places are reached from the Farm tab. */}
      {!eventId && (
        <ListCard aria-label="בוצעו ביממה האחרונה">
          <Row title={recent > 0 ? `בוצעו ביממה האחרונה · ${recent}` : 'היסטוריה'} {...to('/tasks/history')} />
        </ListCard>
      )}
      {!eventId && ctx.manager && (
        <ListCard aria-label="משימות חוזרות">
          <Row title={`משימות חוזרות · ${ctx.templates.length}`} meta="רק מנהלים רואים" {...to('/manage/recurring')} />
        </ListCard>
      )}
    </AppScreen>
  );
}

/** P1 next-up when it is a project step: "בוצע" closes the step (the project too when it was the last open one). */
function NextStepCard({ s }: { s: MyStep }) {
  const ctx = useV2(); const all = useSteps(s.project.id); const toast = useToast(); const fail = useFail();
  const done = async () => {
    try {
      await completeStep(ctx, s.project.id, s.step.id, all.items);
      toast.show({ text: `בוצע: ${s.step.title}`, actions: [{ label: 'ביטול', onClick: () => { reopenStep(ctx, s.project.id, s.step.id).catch(fail); } }] });
    } catch (e) { fail(e); }
  };
  const due = s.step.due ? `עד ${dueText(s.step.due, ctx.today)}` : '';
  return (
    <NextUpCard title={<span className="tasks-nextup-title">{s.step.title}<ProjectTag /></span>} metaIcon={null}
      meta={[s.short, `צעד ${s.n} מתוך ${s.total}`, due].filter(Boolean).join(' · ')}
      actions={<>
        <Button size="big" grow icon="check" onClick={done}>בוצע</Button>
        <Button variant="secondary" size="lg" {...to(projectLink(s.project.id))}>לפרויקט</Button>
      </>} />
  );
}

/** A project step in "רק שלי" (what the old "עליך" list showed, P6). */
function StepRow({ s }: { s: MyStep }) {
  const ctx = useV2(); const all = useSteps(s.project.id); const fail = useFail(); const toast = useToast();
  const toggle = async (v: boolean) => {
    try {
      if (v) {
        await completeStep(ctx, s.project.id, s.step.id, all.items);
        toast.show({ text: `בוצע: ${s.step.title}`, actions: [{ label: 'ביטול', onClick: () => { reopenStep(ctx, s.project.id, s.step.id).catch(fail); } }] });
      } else await reopenStep(ctx, s.project.id, s.step.id);
    } catch (e) { fail(e); }
  };
  const meta = s.step.done
    ? [s.short, `בוצע ${s.step.doneAt ? ddmm(s.step.doneAt) : ''}`.trim()].join(' · ')
    : [s.short, `צעד ${s.n} מתוך ${s.total}`].join(' · ');
  return (
    <Row check={<CheckButton checked={s.step.done} onChange={toggle} label={`סימון בוצע: ${s.step.title}`} />}
      title={s.step.title} tags={<ProjectTag />} meta={meta} done={s.step.done}
      {...to(stepLink(s.project.id, s.step.id))} chevron={false} />
  );
}

