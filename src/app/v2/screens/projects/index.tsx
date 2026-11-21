// v2 screens: projects (P2-P5) and the projects block shown above the tasks for managers (P1, P6).
// Managers and owners only (routes are manager-gated; the block renders nothing for staff).
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useToast } from '../../core';
import {
  TopBar, PageTitle, FormHeader, Button, IconButton, Tag, Avatar, AvatarStack, Card, ProgressSegments, Chip, ChipRow,
  Hero, Icon, DetailList, DetailRow, Quote, SectionHeader, Row, BottomBar, Field, TextAreaField, Sheet, RadioList, RadioRow,
} from '../../kit';
import { href as appHref, back, useParam } from '../../../router';
import { isConflict } from '../../../db';
import { useClockVersion } from '../../../clock';
import { ddmm, dayComma, dayTime, firstName } from '../../format';
import type { Actor } from '../../../types';
import {
  useProjects, useProject, useSteps, projectLink, stepLink,
  createProject, saveProject, takeStep, releaseStep, completeStep, reopenStep, postUpdate, splitStep, updateStep,
  type ProjectDoc, type StepDoc, type DraftStep,
} from '../../data/projects';
import {
  progressOf, freeLabel, countLabel, deadlineLabel, deadlineUrgent, goalLine, shortTitle, membersOf, stepState, stepMeta,
  stepNumber, previousStep, filterProjects, blockProjects, deadlineInput, type ListTab,
} from './logic';
import './projects.css';

/** Props for an in-app link: a real href (long-press, new tab) that navigates inside the SPA. */
const to = (path: string) => ({
  href: appHref(path),
  onClick: (e: MouseEvent<HTMLElement>) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(path); },
});
/** X1 on a conflict, the error text otherwise. */
function useFail() {
  const toast = useToast();
  return (e: unknown) => {
    if (isConflict(e)) toast.refused();
    else toast.refused(`לא נשמר. ${(e as Error)?.message || ''}`.trim());
  };
}
const ManagersTag = () => <Tag tone="warm">מנהלים</Tag>;

// ---------- project card (P1 block, P2 list) ----------
function ProjectCard({ project, variant }: { project: ProjectDoc; variant: 'block' | 'list' }) {
  const steps = useSteps(project.id);
  const p = progressOf(steps.items);
  const members = membersOf(project);
  const done = project.status === 'done';
  const when = done ? (project.doneAt ? `הושלם ${ddmm(project.doneAt)}` : 'הושלם') : deadlineLabel(project);
  const red = !done && variant === 'list' && deadlineUrgent(project);
  return (
    <Card layout="col" className="projects-card" {...to(projectLink(project.id))}>
      <div className="projects-card__head">
        <b className="projects-card__title">{project.title}</b>
        <span className="projects-card__count">{countLabel(p)}</span>
      </div>
      {p.total > 0 && <ProgressSegments tone="warm" total={p.total} done={p.done} label={`${p.done} מתוך ${p.total} צעדים הושלמו`} />}
      <div className="projects-card__meta">
        <AvatarStack label={members.map((m) => m.name).join(', ')}>{members.map((m) => <Avatar key={m.uid} name={m.name} size={28} />)}</AvatarStack>
        <span className="projects-card__free">{done ? '' : freeLabel(p)}</span>
        {red ? <Tag tone="urgent">{when}</Tag> : <span className="projects-card__when">{when}</span>}
      </div>
    </Card>
  );
}

// ---------- P1 / P6: the block above the tasks ----------
/** The 'פרויקטים' block that TasksRoot shows above all regular tasks for managers (P1/P6). Renders nothing for staff.
 *  It returns a fragment, so its header and cards take the root's own gap. `spaced` adds the 8px P6 shows above the header. */
export function ProjectsBlock({ ctx, spaced }: { ctx: V2Ctx; spaced?: boolean }): ReactNode {
  useClockVersion();
  const projects = useProjects(ctx.manager);
  if (!ctx.manager) return null;
  const active = projects.items.filter((p) => p.status !== 'done');
  const shown = blockProjects(projects.items, ctx.user.uid);
  return (
    <>
      <div className={`projects-blockhead${spaced ? ' projects-blockhead--spaced' : ''}`}>
        <h2 className="projects-blockhead__title">פרויקטים<ManagersTag /></h2>
        <a className="projects-blockhead__all" {...to('/projects')}><span>{active.length ? <>הכל · <span className="k-num">{active.length}</span></> : 'הכל'}</span></a>
      </div>
      {shown.map((p) => <ProjectCard key={p.id} project={p} variant="block" />)}
    </>
  );
}

// ---------- P2: list ----------
const TABS: { value: ListTab; label: string }[] = [{ value: 'active', label: 'פעילים' }, { value: 'mine', label: 'שלי' }, { value: 'done', label: 'הושלמו' }];
export function ProjectsList({ ctx }: ScreenProps): ReactNode {
  useClockVersion();
  const projects = useProjects(ctx.manager);
  const q = useParam('tab');
  const tab: ListTab = q === 'mine' || q === 'done' ? q : 'active';
  const uid = ctx.user.uid;
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.value, filterProjects(projects.items, t.value, uid).length])), [projects.items, uid]);
  const list = filterProjects(projects.items, tab, uid);
  const empty = tab === 'done' ? 'עוד אין פרויקטים שהושלמו.' : tab === 'mine' ? 'אין פרויקט שאת/ה חלק ממנו.' : 'אין פרויקטים פעילים.';
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'משימות', ...to('/tasks') }} end={<Button icon="plus" iconSize={18} {...to('/projects/new')}>פרויקט חדש</Button>} />
      <div className="projects-titlerow"><PageTitle>פרויקטים</PageTitle><ManagersTag /></div>
      <ChipRow label="סינון">
        {TABS.map((t) => (
          <Chip key={t.value} selected={tab === t.value} onClick={() => go(t.value === 'active' ? '/projects' : `/projects?tab=${t.value}`, true)}>
            {t.label} · <span className="k-num">{counts[t.value]}</span>
          </Chip>
        ))}
      </ChipRow>
      {list.map((p) => <ProjectCard key={p.id} project={p} variant="list" />)}
      {!projects.loading && !list.length && <p className="projects-empty">{empty}</p>}
      <span className="projects-note">מתנדבים לא רואים את המסך הזה.</span>
    </AppScreen>
  );
}

// ---------- P3: project ----------
function Segments({ total, done }: { total: number; done: number }) {
  return (
    <span role="img" aria-label={`${done} מתוך ${total} צעדים הושלמו`} className="projects-segs">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`projects-segs__seg${i < done ? ' projects-segs__seg--on' : ''}`} />)}
    </span>
  );
}
function StepRow({ step, n, pid, uid, onTake }: { step: StepDoc; n: number; pid: string; uid: string; onTake: () => void }) {
  const st = stepState(step, uid);
  return (
    <li className={`projects-step${st === 'done' ? ' projects-step--done' : ''}`}>
      {st === 'done'
        ? <span className="projects-mark projects-mark--done" role="img" aria-label="בוצע"><Icon name="check" size={16} /></span>
        : <span className={`projects-mark${st === 'free' ? ' projects-mark--free' : ''}`} aria-hidden="true">{n}</span>}
      <a className="projects-step__link" {...to(stepLink(pid, step.id))}>
        <span className="projects-step__title">{step.title}</span>
        {stepMeta(step, uid) && <span className="projects-step__meta">{stepMeta(step, uid)}</span>}
      </a>
      {st === 'mine' && <Tag tone="outline">שלך</Tag>}
      {st === 'other' && <Avatar name={step.assignee!.name} size={28} label={step.assignee!.name} />}
      {st === 'free' && <Button variant="outline" onClick={onTake}>לקחת</Button>}
    </li>
  );
}
function Missing({ backLabel, backTo }: { backLabel: string; backTo: string }) {
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: backLabel, ...to(backTo) }} />
      <p className="projects-empty">הפרויקט לא נמצא. אולי נמחק.</p>
    </AppScreen>
  );
}
export function ProjectScreen({ ctx, params }: ScreenProps): ReactNode {
  useClockVersion();
  const pid = params.id;
  const project = useProject(pid, ctx.manager);
  const steps = useSteps(pid, ctx.manager);
  const fail = useFail();
  const p = project.item;
  if (!p) return project.loading ? <AppScreen variant="detail"><TopBar back={{ label: 'פרויקטים', ...to('/projects') }} /></AppScreen> : <Missing backLabel="פרויקטים" backTo="/projects" />;
  const prog = progressOf(steps.items);
  const members = membersOf(p);
  const take = (sid: string) => takeStep(ctx, pid, sid).catch(fail);
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'פרויקטים', ...to('/projects') }} end={<Button variant="outline" icon="edit" iconSize={16} {...to(`/projects/${pid}/edit`)}>עריכה</Button>} />
      <Hero className="projects-hero">
        <div className="projects-hero__head">
          <span className="k-hero__meta">{goalLine(p)}</span>
          <h1 className="projects-hero__title">{p.title}</h1>
        </div>
        {prog.total > 0 && <Segments total={prog.total} done={prog.done} />}
        <div className="projects-hero__foot">
          <span className="projects-hero__count">{prog.done} מתוך {prog.total} צעדים</span>
          <AvatarStack onHero label={members.map((m) => m.name).join(', ')}>{members.map((m) => <Avatar key={m.uid} name={m.name} size={28} tone="ondark" />)}</AvatarStack>
        </div>
      </Hero>
      {steps.items.length > 0 && (
        <section className="k-card k-card--list" aria-label="הצעדים">
          <ul className="projects-steps">
            {steps.items.map((s, i) => <StepRow key={s.id} step={s} n={i + 1} pid={pid} uid={ctx.user.uid} onTake={() => take(s.id)} />)}
          </ul>
        </section>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block {...to(`/projects/${pid}/edit?add=1`)}>צעד נוסף</Button>
    </AppScreen>
  );
}

// ---------- P4: step ----------
export function StepScreen({ ctx, params }: ScreenProps): ReactNode {
  useClockVersion();
  const { id: pid, sid } = params;
  const project = useProject(pid, ctx.manager);
  const steps = useSteps(pid, ctx.manager);
  const toast = useToast();
  const fail = useFail();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const p = project.item;
  const step = steps.items.find((s) => s.id === sid) || null;
  if (!p || !step) {
    const loading = project.loading || steps.loading;
    return loading ? <AppScreen variant="detail"><TopBar back={{ label: 'פרויקטים', ...to('/projects') }} /></AppScreen> : <Missing backLabel={p ? shortTitle(p) : 'פרויקטים'} backTo={p ? projectLink(pid) : '/projects'} />;
  }
  const uid = ctx.user.uid;
  const st = stepState(step, uid);
  const { n, total } = stepNumber(steps.items, sid);
  const prev = previousStep(steps.items, sid);
  const updates = step.updates || [];
  const done = async () => {
    try {
      await completeStep(ctx, pid, sid, steps.items);
      go(projectLink(pid));
      toast.show({ text: `בוצע: ${step.title}`, check: true, actions: [{ label: 'ביטול', onClick: () => { void reopenStep(ctx, pid, sid).catch(fail); } }] });
    } catch (e) { fail(e); }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    setText('');
    postUpdate(ctx, p, step, t).catch((err) => { setText(t); fail(err); });
  };
  const who = st === 'mine' ? 'עליך' : st === 'free' ? 'פנוי' : st === 'done' ? (step.doneBy?.name || '') : step.assignee!.name;
  const whoAction = st === 'mine' ? <Button variant="outline" onClick={() => releaseStep(ctx, pid, sid).catch(fail)}>לשחרר</Button>
    : st === 'free' ? <Button variant="outline" onClick={() => takeStep(ctx, pid, sid).catch(fail)}>לקחת</Button> : undefined;
  const bar = st === 'done'
    ? <BottomBar><Button variant="secondary" size="bar" grow onClick={() => reopenStep(ctx, pid, sid).catch(fail)}>להחזיר לרשימה</Button></BottomBar>
    : <BottomBar><Button size="bar" grow icon="check" onClick={done}>בוצע</Button><Button variant="secondary" size="bar" style={{ padding: '0 18px' }} onClick={() => setSplitting(true)}>לפצל לצעדים</Button></BottomBar>;
  return (
    <AppScreen variant="detail" gap={10} bar={bar}>
      <TopBar back={{ label: shortTitle(p), ...to(projectLink(pid)) }} end={<Button variant="outline" icon="edit" iconSize={16} onClick={() => setEditing(true)}>עריכה</Button>} />
      <div className="projects-sub">
        <span className="projects-sub__line">צעד {n} מתוך {total} · פרויקט של מנהלים</span>
        <PageTitle size="detail" className="k-h1--detail-tight">{step.title}</PageTitle>
      </div>
      <DetailList className="projects-dl">
        <DetailRow term={st === 'done' ? 'בוצע על ידי' : 'על מי'} action={whoAction}>{who}</DetailRow>
        <DetailRow term="עד מתי">{step.due ? dayComma(step.due) : 'בלי תאריך'}</DetailRow>
        {prev && <DetailRow term="אחרי">{prev.title} {prev.done && <Tag tone="warm">בוצע</Tag>}</DetailRow>}
      </DetailList>
      {step.note && <Quote>{step.note}</Quote>}
      <section className="k-card k-card--list projects-updates">
        <SectionHeader title="עדכונים" count={updates.length || undefined} />
        {updates.length > 0 && (
          <ul className="k-list">
            {updates.map((u, i) => (
              <Row key={i} leading={<Avatar name={u.by.name} size={32} tone={u.by.uid === uid ? 'me' : 'default'} />} title={u.text} meta={`${firstName(u.by.name)} · ${dayTime(u.at)}`} />
            ))}
          </ul>
        )}
        <form className="projects-composer" onSubmit={send}>
          <label htmlFor="projects-update" className="k-sr">עדכון קצר</label>
          <input id="projects-update" className="projects-composer__input" type="text" maxLength={500} placeholder="עדכון קצר למנהלים" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit">שליחה</Button>
        </form>
      </section>
      <StepEditSheet open={editing} onClose={() => setEditing(false)} step={step} onSave={(v) => { setEditing(false); updateStep(ctx, pid, sid, v).catch(fail); }} />
      <SplitSheet open={splitting} onClose={() => setSplitting(false)} onSave={(titles) => { setSplitting(false); splitStep(ctx, pid, steps.items, step, titles).then(() => go(projectLink(pid))).catch(fail); }} />
    </AppScreen>
  );
}
function StepEditSheet({ open, onClose, step, onSave }: { open: boolean; onClose: () => void; step: StepDoc; onSave: (v: { title: string; due: string; note: string }) => void }) {
  const [title, setTitle] = useState(step.title); const [due, setDue] = useState(step.due); const [note, setNote] = useState(step.note);
  useEffect(() => { if (open) { setTitle(step.title); setDue(step.due); setNote(step.note); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={open} onClose={onClose} title="עריכת צעד">
      <Field label="הצעד" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Field label="עד מתי" type="date" ltr value={due} onChange={(e) => setDue(e.target.value)} />
      <TextAreaField label="הערה" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="bar" block disabled={!title.trim()} onClick={() => onSave({ title, due, note })}>שמירה</Button>
    </Sheet>
  );
}
function SplitSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (titles: string[]) => void }) {
  const [rows, setRows] = useState(['', '']);
  useEffect(() => { if (open) setRows(['', '']); }, [open]);
  const ok = rows.some((r) => r.trim());
  return (
    <Sheet open={open} onClose={onClose} title="לפצל לצעדים">
      <section className="k-card k-card--list">
        <ul className="projects-steps">
          {rows.map((r, i) => (
            <li key={i} className="projects-draft">
              <span className="projects-draft__n">{i + 1}</span>
              <label htmlFor={`projects-split-${i}`} className="k-sr">צעד {i + 1}</label>
              <input id={`projects-split-${i}`} className="projects-draft__input" type="text" value={r} onChange={(e) => setRows(rows.map((x, k) => (k === i ? e.target.value : x)))} />
            </li>
          ))}
        </ul>
      </section>
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => setRows([...rows, ''])}>צעד נוסף</Button>
      <Button size="bar" block disabled={!ok} onClick={() => onSave(rows)}>יצירת הצעדים</Button>
    </Sheet>
  );
}

// ---------- P5: new / edit ----------
type Draft = DraftStep & { key: number };
let draftKey = 0;
const blank = (): Draft => ({ key: ++draftKey, title: '', assignee: null });
export function ProjectForm({ ctx, params }: ScreenProps): ReactNode {
  const pid = params.id || '';
  const add = useParam('add');
  const editing = !!pid;
  const project = useProject(pid, ctx.manager && editing);
  const steps = useSteps(pid, ctx.manager && editing);
  const fail = useFail();
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>(() => (editing ? [] : [blank()]));
  const [ready, setReady] = useState(!editing);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const focusKey = useRef<number | null>(null);
  const managers = useMemo(() => ctx.team.filter((u) => (u.role === 'manager' || u.role === 'owner') && u.status !== 'blocked')
    .map((u): Actor => ({ uid: u.uid, name: u.displayName })).sort((a, b) => (a.uid === ctx.user.uid ? -1 : b.uid === ctx.user.uid ? 1 : a.name.localeCompare(b.name, 'he'))), [ctx.team, ctx.user.uid]);

  // edit mode: fill the form once the project and its steps arrive; "?add=1" (P3 "צעד נוסף") opens an empty row at the end
  useEffect(() => {
    if (ready || !editing || !project.item || steps.loading) return;
    const p = project.item;
    setTitle(p.title); setDeadline(deadlineInput(p));
    const rows: Draft[] = steps.items.map((s) => ({ key: ++draftKey, id: s.id, title: s.title, assignee: s.assignee }));
    if (add || !rows.length) { const b = blank(); rows.push(b); focusKey.current = b.key; }
    setDrafts(rows); setReady(true);
  }, [ready, editing, project.item, steps.loading, steps.items, add]);
  useEffect(() => {
    if (focusKey.current === null) return;
    const el = document.getElementById(`projects-step-${focusKey.current}`);
    if (el) { el.focus(); focusKey.current = null; }
  }, [drafts]);

  const addRow = () => { const b = blank(); focusKey.current = b.key; setDrafts((d) => [...d, b]); };
  const setRow = (key: number, patch: Partial<Draft>) => setDrafts((d) => d.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const cancel = () => back(editing ? projectLink(pid) : '/projects');
  const submit = async () => {
    if (!title.trim()) { setError('צריך לכתוב לאן רוצים להגיע'); return; }
    setBusy(true);
    try {
      if (editing && project.item) { await saveProject(ctx, project.item, steps.items, { title, deadline, steps: drafts }); go(projectLink(pid), true); }
      else { const id = await createProject(ctx, { title, deadline, steps: drafts }); go(projectLink(id), true); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  if (editing && !ready && !project.loading && !project.item) return <Missing backLabel="פרויקטים" backTo="/projects" />;
  const picked = picking === null ? null : drafts.find((d) => d.key === picking) || null;
  const pickedN = picked ? drafts.indexOf(picked) + 1 : 0;
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow disabled={busy || !ready} onClick={submit}>{editing ? 'שמירה' : 'יצירת הפרויקט'}</Button></BottomBar>}>
      <FormHeader title={editing ? 'עריכת פרויקט' : 'פרויקט חדש'} onCancel={cancel} />
      <Field label="לאן רוצים להגיע" value={title} error={error || undefined} onChange={(e) => { setTitle(e.target.value); if (error) setError(''); }} />
      <Field label="עד מתי" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <div className="projects-group">
        <span className="projects-group__label" id="projects-steps-label">הצעדים בדרך</span>
        {drafts.length > 0 && (
          <section className="k-card k-card--list" aria-labelledby="projects-steps-label">
            <ul className="projects-steps">
              {drafts.map((d, i) => (
                <li key={d.key} className="projects-draft">
                  <span className="projects-draft__n">{i + 1}</span>
                  <label htmlFor={`projects-step-${d.key}`} className="k-sr">צעד {i + 1}</label>
                  <input id={`projects-step-${d.key}`} className="projects-draft__input" type="text" maxLength={200} value={d.title} onChange={(e) => setRow(d.key, { title: e.target.value })} />
                  {d.assignee
                    ? <button type="button" className="projects-draft__who" aria-label={`${d.assignee.name}, לשנות מי לוקח את צעד ${i + 1}`} onClick={() => setPicking(d.key)}><Avatar name={d.assignee.name} size={28} /></button>
                    : <IconButton variant="dashed" round icon="plus" iconSize={18} label={`לשייך מנהל לצעד ${i + 1}`} onClick={() => setPicking(d.key)} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={addRow}>צעד נוסף</Button>
      <span className="projects-hint">צעד בלי מנהל נשאר פנוי, וכל מנהל יכול לקחת אותו.</span>
      <Sheet open={!!picked} onClose={() => setPicking(null)} title={`על מי צעד ${pickedN}`}>
        <RadioList label="על מי">
          <RadioRow compact checked={!picked?.assignee} title="פנוי" meta="כל מנהל יכול לקחת אותו" onSelect={() => { if (picked) setRow(picked.key, { assignee: null }); setPicking(null); }} />
          {managers.map((m) => (
            <RadioRow key={m.uid} compact checked={picked?.assignee?.uid === m.uid} leading={<Avatar name={m.name} size={36} tone={m.uid === ctx.user.uid ? 'me' : 'default'} />}
              title={m.uid === ctx.user.uid ? `${m.name} (אני)` : m.name} onSelect={() => { if (picked) setRow(picked.key, { assignee: m }); setPicking(null); }} />
          ))}
        </RadioList>
      </Sheet>
    </AppScreen>
  );
}

export type { V2Ctx };
