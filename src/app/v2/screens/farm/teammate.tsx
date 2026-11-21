// C5-Teammate: role, at the farm now, WhatsApp / call, what is on them now, their week, counts.
import { AppScreen, go, telUrl, useExternal, waUrl } from '../../core';
import { back } from '../../../router';
import { Avatar, Button, EmptyState, ListCard, Row, StatRow, StatTile } from '../../kit';
import { dayName, relDay } from '../../format';
import type { ScreenProps, V2Ctx } from '../../ctx';
import type { Project, Task } from '../../../types';
import { useActiveProjects, useCalendarRange, useDoneBy, useStepsOn, useTasksOn } from '../../data/farm';
import { addDays, dayEntries, heroHours, isPresence, israelIso, monthStart, rangeText, hoursOf } from './logic';
import { ROLE_WORD, TopRow, femaleOf, useNowMin } from './parts';

export function TeammateScreen({ ctx, params }: ScreenProps) {
  const uid = params.uid || '';
  const open = useExternal();
  const nowMin = useNowMin();
  const today = ctx.today;
  const p = ctx.peopleByUid.get(uid) || null;
  const cal = useCalendarRange(today, addDays(today, 6), ctx.manager, !!uid);
  const tasks = useTasksOn(uid, ctx.manager);
  const doneMonth = useDoneBy(uid, israelIso(monthStart(today), '00:00'), ctx.manager);
  const projects = useActiveProjects(ctx.manager && !!uid);
  if (!p) {
    return (
      <AppScreen variant="root" gap={10}>
        <TopRow back="חזרה" onBack={() => back('/farm')} />
        <EmptyState variant="card" icon="user" title="לא מצאנו את האדם הזה" text="אולי הוא כבר לא בצוות." />
      </AppScreen>
    );
  }
  const name = p.displayName;
  const female = femaleOf(name, p);
  const todayEntry = dayEntries(cal.items, today, nowMin).find((e) => e.uid === uid);
  const where = !todayEntry || todayEntry.status === 'past' ? '' : todayEntry.status === 'now'
    ? `בחווה עכשיו, ${heroHours(todayEntry, female)}` : heroHours(todayEntry, female);
  const role = ROLE_WORD(p.role, female);
  const week = cal.items.filter((it) => it.ownerUid === uid && isPresence(it)).sort((a, b) => a.date.localeCompare(b.date) || (hoursOf(a).from || '').localeCompare(hoursOf(b).from || ''));
  const todayIso = israelIso(today, '00:00');
  const doneToday = new Set(doneMonth.items.filter((a) => a.at >= todayIso).map((a) => a.refId)).size;
  const doneCount = new Set(doneMonth.items.map((a) => a.refId)).size;
  const phone = p.phone || '';
  const isMe = uid === ctx.user.uid;

  return (
    <AppScreen variant="root" gap={10}>
      <TopRow back="חזרה" onBack={() => back('/farm')} />
      <div className="farm-person">
        <Avatar name={name} size={56} tone="me" src={(p as { photoSource?: string; photo?: string }).photoSource === 'custom' ? (p as { photo?: string }).photo : undefined} />
        <div className="farm-person__text"><b className="farm-person__name">{name}</b><span className="farm-person__meta">{[role, where].filter(Boolean).join(' · ')}</span></div>
      </div>
      {phone && !isMe && (
        <div className="farm-actions">
          <Button size="tall" icon="message" onClick={() => open(waUrl(phone))}>וואטסאפ</Button>
          <Button size="tall" variant="outline" icon="phone" onClick={() => open(telUrl(phone))}>התקשרות</Button>
        </div>
      )}
      <OnThem ctx={ctx} uid={uid} female={female} tasks={tasks.items} projects={projects.items} />
      <ListCard title="השבוע בחווה">
        {week.length ? week.map((it) => (
          <Row key={it.id} minHeight={46} title={relDay(it.date)}
            meta={[rangeText(hoursOf(it)), it.note || ''].filter(Boolean).join(' · ')} />
        )) : <Row minHeight={46} title={female ? 'לא רשומה השבוע' : 'לא רשום השבוע'} />}
      </ListCard>
      <StatRow>
        <StatTile value={doneToday} label="בוצעו היום" />
        <StatTile value={doneCount} label="החודש" />
      </StatRow>
    </AppScreen>
  );
}

/** "עליה עכשיו": open tasks on the person, then (managers) open project steps on them. */
function OnThem({ ctx, uid, female, tasks, projects }: { ctx: V2Ctx; uid: string; female: boolean; tasks: Task[]; projects: Project[] }) {
  const title = female ? 'עליה עכשיו' : 'עליו עכשיו';
  const rows = tasks.map((t) => (
    <Row key={t.id} onClick={() => go(`/tasks/${encodeURIComponent(t.id)}`)} title={t.title}
      meta={[t.location?.placeName || '', t.dueDate ? `עד ${t.dueDate === ctx.today ? 'היום' : dayName(t.dueDate)}` : ''].filter(Boolean).join(' · ') || undefined} />
  ));
  return (
    <StepsCounter projects={ctx.manager ? projects : []} uid={uid} render={(steps) => {
      const n = tasks.length + steps.length;
      return (
        <ListCard title={title} count={n}>
          {rows}
          {steps}
          {!n && <Row title="אין משימות פתוחות" />}
        </ListCard>
      );
    }} />
  );
}

/** Steps live under each project (projects/{id}/steps): one small reader per active project. */
function StepsCounter({ projects, uid, render }: { projects: Project[]; uid: string; render: (steps: React.ReactNode[]) => React.ReactNode }) {
  const list = projects.slice(0, 6);
  return <StepsChain projects={list} i={0} uid={uid} acc={[]} render={render} />;
}
function StepsChain({ projects, i, uid, acc, render }: { projects: Project[]; i: number; uid: string; acc: React.ReactNode[]; render: (steps: React.ReactNode[]) => React.ReactNode }) {
  const pr = projects[i];
  const steps = useStepsOn(pr?.id || '', uid, !!pr);
  if (!pr) return <>{render(acc)}</>;
  const rows = steps.items.map((s) => (
    <Row key={`${pr.id}/${s.id}`} onClick={() => go(`/projects/${encodeURIComponent(pr.id)}/steps/${encodeURIComponent(s.id)}`)}
      title={s.title} tags={<span className="farm-tag">פרויקט</span>} meta={`${pr.title} · צעד ${s.n}`} />
  ));
  return <StepsChain projects={projects} i={i + 1} uid={uid} acc={[...acc, ...rows]} render={render} />;
}
