// T1 / T2 / T4 / L5 (staff) and P1 / P6 (managers, owners): the tasks root, the home screen of the team.
import { useMemo } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, RootHead, go, useToast, useV2 } from '../../core';
import { ProgressSegments, NextUpCard, Button, Segmented, ListCard, Row, CheckButton, EmptyState } from '../../kit';
import { useParam } from '../../../router';
import { useClockVersion, nowMs, nowIso } from '../../../clock';
import { useDemo, useDemoStates } from '../../../demo/store';
import { dayOverline, ddmm } from '../../format';
import { ProjectsBlock } from '../projects';
import { BroadcastCard } from '../broadcast';
import { useMySteps, useSteps, completeStep, reopenStep, projectLink, stepLink, type MyStep } from '../../data/projects';
import {
  useRootTasks, pickNextUp, progressOf, progressCaption, groupByPlace, groupByTime, ordered, isMine, isForToday, isFree,
  rowMeta, dueText, DONE_VISIBLE_MS,
} from '../../data/tasks';
import { TaskRow, TasksCapture, useTaskActions, useFail, to } from './shared';
import './tasks.css';

type View = 'place' | 'time' | 'mine';
const VIEWS: { value: View; label: string }[] = [{ value: 'place', label: 'לפי מקום' }, { value: 'time', label: 'לפי זמן' }, { value: 'mine', label: 'רק שלי' }];
const ProjectTag = () => <span className="tasks-tag-project">פרויקט</span>;
const DAY30 = 30 * 86400_000;

export function TasksRoot({ ctx }: ScreenProps) {
  useClockVersion();
  const demo = useDemo(); const states = useDemoStates();
  const view = (useParam('view') || 'place') as View;
  const root = useRootTasks(ctx);
  const steps = useMySteps(ctx);
  const uid = ctx.user.uid; const today = ctx.today; const now = nowMs();
  const a = useTaskActions();

  // L5 in the demo ("רשימות ריקות"): everything that was on me today shows as done.
  const tasks = useMemo(() => (demo.on && states.empty
    ? root.items.map((t) => (isMine(t, uid) && isForToday(t, today) ? { ...t, done: true, doneBy: ctx.actor, doneAt: nowIso() } : t))
    : root.items), [root.items, demo.on, states.empty, uid, today, ctx.actor]);

  const nameOf = (id: string) => ctx.places.find((p) => p.id === id)?.name;
  const nextStep: MyStep | undefined = ctx.manager ? steps.items.find((s) => !s.step.done) : undefined;
  const nextTask = nextStep ? null : pickNextUp(tasks, uid, today);
  const lists = nextTask ? tasks.filter((t) => t.id !== nextTask.id) : tasks;

  // P6 "עליך": my tasks (open, and done in the last 24h) and my project steps, without the one in "הבא בתור".
  const mineTasks = ordered(lists.filter((t) => isMine(t, uid) && (!t.done || now - Date.parse(t.doneAt || '') < DONE_VISIBLE_MS)), uid, today);
  const mineSteps = steps.items.filter((s) => s !== nextStep && (!s.step.done || now - Date.parse(s.step.doneAt || '') < DAY30));
  const mineCount = mineTasks.length + mineSteps.length;
  const progress = ctx.manager
    ? { total: mineCount + (nextStep || nextTask ? 1 : 0), done: mineTasks.filter((t) => t.done).length + mineSteps.filter((s) => s.step.done).length }
    : progressOf(tasks, uid, today);
  const caption = progressCaption(progress.done, progress.total);

  const setView = (v: View) => go(v === 'place' ? '/tasks' : `/tasks?view=${v}`, true);
  const free = tasks.filter((t) => isFree(t) && isForToday(t, today));
  const placeGroups = groupByPlace(lists, uid, today, nameOf);
  const timeGroups = groupByTime(lists, uid, today);
  const myOpen = lists.filter((t) => isMine(t, uid) && !t.done);
  const myRows = ordered(lists.filter((t) => isMine(t, uid) && (!t.done || now - Date.parse(t.doneAt || '') < DONE_VISIBLE_MS)), uid, today);
  const doneToday = progress.done;

  return (
    <AppScreen variant="root" capture={<TasksCapture />}>
      <RootHead overline={dayOverline(today)} title="משימות" />
      <BroadcastCard ctx={ctx} />
      {progress.total > 0 && <ProgressSegments total={progress.total} done={progress.done} caption={caption} />}
      {nextStep && <NextStepCard s={nextStep} />}
      {nextTask && (
        <NextUpCard title={nextTask.title}
          meta={[nextTask.location?.placeName, rowMeta(nextTask, { uid, view: 'place', today, now })].filter(Boolean).join(' · ')}
          actions={<>
            <Button size="big" grow icon="check" onClick={() => a.done(nextTask)}>בוצע</Button>
            <Button variant="secondary" size="lg" icon="camera" onClick={() => go(`/tasks/${nextTask.id}/done`)}>צילום</Button>
          </>} />
      )}
      {ctx.manager && mineCount > 0 && (
        <ListCard title="עליך" count={mineCount}>
          {mineTasks.map((t) => <TaskRow key={t.id} t={t} view="mine" />)}
          {mineSteps.map((s) => <StepRow key={s.step.id} s={s} />)}
        </ListCard>
      )}
      {ctx.manager && <ProjectsBlock ctx={ctx} />}
      {ctx.manager && <div className="tasks-allhead"><h2>כל המשימות בחווה</h2></div>}
      <Segmented label="תצוגה" value={view} onChange={setView} options={VIEWS} />

      {view === 'place' && placeGroups.map((g) => (
        <ListCard key={g.key} title={g.title} icon="pin" count={g.rows.length}>
          {g.rows.map((t) => <TaskRow key={t.id} t={t} view="place" placeName={g.title} strip />)}
        </ListCard>
      ))}
      {view === 'time' && timeGroups.map((g) => (
        <ListCard key={g.key} title={g.title} count={g.rows.length} tone="quiet">
          {g.rows.map((t) => <TaskRow key={t.id} t={t} view={g.key === 'today' || g.key === 'none' ? 'time' : 'later'} />)}
        </ListCard>
      ))}
      {view === 'mine' && (myOpen.length === 0 && !nextTask && !root.loading ? (
        <EmptyState variant="done" title="סיימת את כל מה שעליך" text={doneToday === 1 ? 'משימה אחת היום' : `${doneToday} משימות היום`}
          action={free.length > 0 ? <Button className="tasks-take-free" onClick={() => setView('place')}>{`לקחת אחת מהפנויות · ${free.length}`}</Button> : undefined} />
      ) : myRows.length > 0 && (
        <ListCard title="עליך" count={myRows.length}>
          {myRows.map((t) => <TaskRow key={t.id} t={t} view="mine" />)}
        </ListCard>
      ))}
      {view !== 'mine' && !root.loading && lists.length === 0 && (
        <EmptyState variant="card" title="אין משימות פתוחות" text="משימה חדשה נכנסת מהשורה למטה" />
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

/** A project step in "עליך" (P6). */
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

