import { useCallback, useState } from 'react';
import { AppScreen, go } from '../../core';
import type { V2Ctx } from '../../ctx';
import type { FarmEvent, Task } from '../../../types';
import { useList, transact, ConflictError } from '../../../db';
import { nowIso } from '../../../clock';
import { usePrepTasks, markTaskDone, takeTask } from '../../data/farm';
import { useProjects, useSteps, type ProjectDoc } from '../../data/projects';
import { BottomBar, Button, CheckButton, Chip, ChipRow, EmptyState, ListCard, PageTitle, Row, Sheet, Tag, TopBar } from '../../kit';
import { backTo, useRun } from './shared';
import { dayName, ddmm } from '../../format';

export const sectionPath = (id:string, section:string) => '/farm/events/' + encodeURIComponent(id) + '?section=' + section;
const sortedTasks = (items:Task[]) => [...items].sort((a,b) => Number(b.urgent)-Number(a.urgent) || (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.title.localeCompare(b.title,'he'));
export function PrepTaskCard({ctx,event}:{ctx:V2Ctx;event:FarmEvent}) {
  const tasks = usePrepTasks(event.id,ctx.manager);
  const urgent = sortedTasks(tasks.items.filter((t) => t.urgent)).slice(0,3);
  return <ListCard title="משימות הכנה" count={tasks.items.length}>
    {urgent.map((t) => <Row key={t.id} title={t.title} tags={<Tag tone="urgent">דחוף</Tag>} meta={t.assignee?.name} onClick={() => go('/tasks/'+t.id)} />)}
    <Row title="לכל משימות האירוע" meta={urgent.length ? undefined : 'אין משימות דחופות'} onClick={() => go(sectionPath(event.id,'tasks'))} />
  </ListCard>;
}
export function EventTasks({ctx,event}:{ctx:V2Ctx;event:FarmEvent}) {
  const [mine,setMine] = useState(false);
  const result = usePrepTasks(event.id,ctx.manager);
  const rows = sortedTasks(result.items.filter((t) => !mine || t.assignee?.uid === ctx.user.uid));
  const run = useRun();
  return <AppScreen variant="detail" bar={ctx.manager && <BottomBar><Button size="bar" grow onClick={() => go('/tasks/new?event='+encodeURIComponent(event.id))}>הוספת משימה</Button></BottomBar>}>
    <TopBar back={backTo(event.title,(ctx.manager ? '/manage/events/' : '/farm/events/') + event.id)} /><PageTitle>משימות האירוע</PageTitle>
    <ChipRow label="סינון משימות"><Chip selected={!mine} onClick={() => setMine(false)}>כל המשימות</Chip><Chip selected={mine} onClick={() => setMine(true)}>שלי</Chip></ChipRow>
    {rows.length ? <ListCard>{rows.map((t) => <Row key={t.id} title={t.title} tags={t.urgent && <Tag tone="urgent">דחוף</Tag>} meta={[t.assignee?.name,t.dueDate && ddmm(t.dueDate)].filter(Boolean).join(' · ')} onClick={() => go('/tasks/'+t.id)}
      check={<CheckButton checked={false} label={'סימון בוצע '+t.title} onChange={() => void run(() => markTaskDone(ctx.actor,t,true))} />}
      actions={!t.assignee && <Button variant="outline" onClick={() => void run(() => takeTask(ctx.actor,t))}>לקחת</Button>} />)}</ListCard> : !result.loading && <EmptyState title={mine ? 'אין לך משימות פתוחות באירוע' : 'אין משימות פתוחות לאירוע'} />}
  </AppScreen>;
}
type EventProject = ProjectDoc & {eventId?:string};
export function EventProjects({ctx,event}:{ctx:V2Ctx;event:FarmEvent}) {
  const linked = useList<EventProject>('projects',{where:[['eventId','==',event.id]]});
  const all = useProjects(ctx.manager);
  const [choose,setChoose] = useState(false);
  const close = useCallback(() => setChoose(false),[]);
  const run = useRun();
  const attach = async (id:string) => { const ok = await run(async () => { await transact(async (tx) => {
    const project = await tx.get<EventProject>('projects',id);
    if (!project || project.eventId && project.eventId !== event.id) throw new ConflictError('הפרויקט כבר משויך לאירוע אחר.');
    tx.update('projects',id,{eventId:event.id,updatedAt:nowIso()});
  }); return true; }); if (ok) close(); };
  return <>
    <ListCard title="פרויקט ושלבים">{linked.items.map((p) => <EventProjectSteps key={p.id} project={p} manager={ctx.manager} />)}
      {ctx.manager && <Row title="שיוך פרויקט לאירוע" onClick={() => setChoose(true)} />}
      {!ctx.manager && !linked.loading && !linked.items.length && <Row title="טרם שויך פרויקט" />}
    </ListCard>
    <Sheet open={choose} onClose={close} title="שיוך פרויקט"><div className="events-sheet">
      {all.items.filter((p:EventProject) => !p.eventId).map((p) => <Button key={p.id} variant="outline" onClick={() => attach(p.id)}>{p.title}</Button>)}
      <Button variant="outline" onClick={() => go('/projects/new?event='+encodeURIComponent(event.id))}>יצירת פרויקט עם שלבים</Button>
    </div></Sheet>
  </>;
}
function EventProjectSteps({project,manager}:{project:EventProject;manager:boolean}) {
  const steps = useSteps(project.id);
  const [open,setOpen] = useState(false);
  return <><Row title={project.title} meta={steps.items.filter((s) => s.done).length + ' מתוך ' + steps.items.length + ' שלבים הושלמו'} onClick={() => setOpen(!open)} />
    {open && steps.items.map((s) => <Row key={s.id} title={s.title} meta={[s.done ? 'בוצע' : 'פתוח',s.assignee?.name,s.due && dayName(s.due)+' '+ddmm(s.due)].filter(Boolean).join(' · ')} />)}
    {open && manager && <Row title="עריכת הפרויקט והשלבים" onClick={() => go('/projects/'+project.id)} />}
  </>;
}
