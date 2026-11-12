// Tasks: whose it is comes first. A row says what, where and until when; everything else lives on the task's own page.
import { useMemo, useState } from 'react';
import type { Task, TaskLocation } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, useToast, fmtDate, fmtTime, dayLabel, whenText, firstName, todayISO, addDays, dateKey } from '../ui';
import { Head, Sect, Tabs, Check, Btn, Form, Empty, useLeaving, useSticky, pickImage } from '../kit';
import { navigate } from '../router';
import { useTask, setTaskDone, setTaskDoneDetails, editTask, addTask, compressPhoto, useHistoryTasks, useBoughtHistory, addShopping } from '../store';
import { useActivityFor, ACTION_LABELS } from '../activity';

// ---------- what a task is, in the words the screen uses ----------
export const mapsLink = (l: TaskLocation) => `https://maps.google.com/?q=${l.lat},${l.lng}`;
/** Today's instance of a recurring chore: nobody owns it, whoever does it ticks it. */
export const isRoutine = (t: Task) => !!t.templateId && !!t.dateKey;
type Bucket = 'late' | 'today' | 'later' | 'open';
const ORDER: Bucket[] = ['late', 'today', 'later', 'open'];
export const bucketOf = (t: Task, today: string): Bucket => (!t.dueDate ? 'open' : t.dueDate < today ? 'late' : t.dueDate === today ? 'today' : 'later');
export const sortTasks = (today: string) => (a: Task, b: Task) =>
  Number(b.urgent) - Number(a.urgent) || ORDER.indexOf(bucketOf(a, today)) - ORDER.indexOf(bucketOf(b, today)) || (a.dueDate || '9').localeCompare(b.dueDate || '9') || b.createdAt.localeCompare(a.createdAt);
export function dueText(t: Task, today: string): { text: string; late: boolean } {
  if (!t.dueDate) return { text: '', late: false };
  if (t.dueDate < today) return { text: t.dueDate === addDays(today, -1) ? 'מאתמול' : `מ־${fmtDate(t.dueDate)}`, late: true };
  return { text: dayLabel(t.dueDate), late: false };
}
export const placeText = (t: Task) => t.location?.placeName || (t.location ? 'נקודה במפה' : '');

// ---------- the actions, with an answer for each ----------
export function useTaskActions(ctx: TeamCtx) {
  const toast = useToast();
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  const photo = async (t: Task) => {
    const file = await pickImage(); if (!file) return;
    try { await setTaskDoneDetails(ctx.actor, t, { donePhoto: await compressPhoto(file) }); toast({ text: 'התמונה נשמרה' }, 2500); } catch (e) { fail(e); }
  };
  return {
    photo,
    done: (t: Task) => {
      setTaskDone(ctx.actor, t, true).catch(fail);
      toast({ text: `בוצע: ${t.title}`, actions: [{ label: 'ביטול', onClick: () => { setTaskDone(ctx.actor, t, false).catch(fail); } }, { label: 'תמונה', onClick: () => { void photo(t); } }] }, 7000);
    },
    undone: (t: Task) => { setTaskDone(ctx.actor, t, false).catch(fail); toast({ text: 'הוחזרה לביצוע' }, 2500); },
    take: (t: Task) => {
      editTask(ctx.actor, t, { assignee: ctx.actor }).catch(fail);
      toast({ text: `עליך: ${t.title}`, actions: [{ label: 'ביטול', onClick: () => { editTask(ctx.actor, t, { assignee: null }).catch(fail); } }] }, 5000);
    },
    release: (t: Task) => { editTask(ctx.actor, t, { assignee: null }).catch(fail); toast({ text: 'שוחררה, פנויה לכולם' }, 3000); },
    fail,
  };
}

// ---------- row ----------
type RowProps = { t: Task; ctx: TeamCtx; today: string; leaving?: boolean; onDone: (t: Task) => void; onTake?: (t: Task) => void; owner?: boolean; sel?: boolean; keep?: boolean };
export function TaskRow({ t, ctx, today, leaving, onDone, onTake, owner = true, sel, keep }: RowProps) {
  const due = dueText(t, today); const place = placeText(t); const routine = isRoutine(t);
  const time = routine ? ctx.templates.find((x) => x.id === t.templateId)?.time : '';
  const parts: { k: string; el: React.ReactNode }[] = [];
  if (t.urgent) parts.push({ k: 'u', el: <b>דחוף</b> });
  if (routine) { if (time) parts.push({ k: 'r', el: `עד ${time}` }); }
  else if (due.text && t.dueDate !== today) parts.push({ k: 'd', el: due.late ? <b>{due.text}</b> : due.text }); // "today" is the default reading, so it is not written
  if (place) parts.push({ k: 'p', el: place });
  if (t.managersOnly) parts.push({ k: 'm', el: 'מנהלים בלבד' });
  const mine = t.assignee?.uid === ctx.actor.uid;
  return (
    <div className={['r-task', t.urgent ? 'urgent' : '', leaving ? 'leaving' : '', sel ? 'sel' : ''].filter(Boolean).join(' ')}>
      <Check on={!!leaving} onChange={() => onDone(t)} label={`בוצע: ${t.title}`} />
      <A to={`/tasks/${t.id}`} keep={keep}>
        <span className="r-t">{t.title}</span>
        {parts.length > 0 && <span className="r-m">{parts.map((p, i) => <span key={p.k}>{i > 0 && <span className="r-sep">·</span>}{p.el}</span>)}</span>}
      </A>
      <div className="r-endcell">
        {t.photo && <img className="r-thumb" src={t.photo} alt="" />}
        {owner && (t.assignee ? <span className="r-who">{mine ? 'שלך' : firstName(t.assignee.name)}</span> : !routine && onTake ? <button type="button" className="r-take" onClick={() => onTake(t)}>לקחת</button> : null)}
      </div>
    </div>
  );
}
export const DoneLine = ({ t }: { t: Task }) => <A className="r-doneline" to={`/tasks/${t.id}`}><s>{t.title}</s><b>{firstName(t.doneBy?.name || '')}</b><span>{fmtTime(t.doneAt)}</span></A>;

// ---------- list ----------
type Tab = 'mine' | 'free' | 'theirs' | 'routine' | 'all';
const GROUP_LABEL: Record<Bucket, string> = { late: 'באיחור', today: 'להיום', later: 'בהמשך', open: 'בלי תאריך' };
export function TasksScreen({ ctx, open, recent, loading, selectedId }: { ctx: TeamCtx; open: Task[]; recent: Task[]; loading: boolean; selectedId?: string }) {
  const desktop = useDesktop(); const today = todayISO();
  const act = useTaskActions(ctx); const { leaving, leave } = useLeaving();
  const lists = useMemo(() => {
    const sorted = [...open].sort(sortTasks(today));
    return {
      mine: sorted.filter((t) => t.assignee?.uid === ctx.actor.uid),
      free: sorted.filter((t) => !t.assignee && !isRoutine(t)),
      theirs: sorted.filter((t) => t.assignee && t.assignee.uid !== ctx.actor.uid),
      routine: sorted.filter(isRoutine),
      all: sorted,
    };
  }, [open, today, ctx.actor.uid]);
  const [saved, setTab] = useSticky<Tab | ''>('tasks-tab', '');
  const tab: Tab = saved && (desktop || saved !== 'all') ? saved : lists.mine.length ? 'mine' : 'free';
  const rows = lists[tab];
  const routineDone = recent.filter((t) => isRoutine(t) && t.dateKey === today);
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'mine', label: 'שלי', n: lists.mine.length }, { id: 'free', label: 'פנויות', n: lists.free.length },
    { id: 'theirs', label: 'אצל אחרים', n: lists.theirs.length }, { id: 'routine', label: 'שגרה', n: lists.routine.length },
    ...(desktop ? [{ id: 'all' as Tab, label: 'הכל', n: lists.all.length }] : []),
  ];
  const done = (t: Task) => leave(t.id, () => act.done(t));
  const emptyText: Record<Tab, [string, string]> = {
    mine: ['אין עליך משימות כרגע', 'אפשר לקחת אחת מ״פנויות״.'], free: ['אין משימות פנויות', 'כל מה שפתוח כבר אצל מישהו.'],
    theirs: ['אין משימות אצל אחרים', ''], routine: ['השגרה של היום הושלמה', ''], all: ['אין משימות פתוחות', ''],
  };

  return (
    <>
      <Head title="משימות" end={<>{!desktop && <Btn small to="/tasks/new">הוספה</Btn>}<A className="r-textlink" to="/history">היסטוריה</A></>} />
      {desktop && <QuickTask ctx={ctx} />}
      <Tabs label="של מי המשימות" value={tab} onChange={setTab} items={tabs} />
      {loading ? <div className="r-empty">טוען…</div>
        : rows.length === 0 && !(tab === 'routine' && routineDone.length) ? <Empty title={emptyText[tab][0]}>{emptyText[tab][1]}</Empty>
          : desktop ? <TaskTable rows={rows} ctx={ctx} today={today} leaving={leaving} onDone={done} onTake={act.take} selectedId={selectedId} />
            : tab === 'routine' ? <>
              <p className="r-hint" style={{ paddingTop: 14 }}>מה שחוזר כל יום. מי שעושה מסמן.</p>
              {rows.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} owner={false} />)}
              {routineDone.map((t) => <DoneLine key={t.id} t={t} />)}
            </> : ORDER.map((b) => {
              const group = rows.filter((t) => bucketOf(t, today) === b);
              if (!group.length) return null;
              return <div key={b}><Sect title={GROUP_LABEL[b]} n={group.length} tone={b === 'late' ? 'late' : undefined} />{group.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} onTake={act.take} owner={tab !== 'mine'} />)}</div>;
            })}
      {!loading && recent.length > 0 && <div style={{ marginTop: 26 }}><A className="r-linkrow" to="/history"><div>בוצעו ביממה האחרונה <span>· {recent.length}</span></div><Icon name="chev" /></A></div>}
    </>
  );
}

/** Desktop: one line to type a task and press Enter. The details can be added later from the row. */
function QuickTask({ ctx }: { ctx: TeamCtx }) {
  const [title, setTitle] = useState(''); const act = useTaskActions(ctx); const toast = useToast();
  const add = async () => {
    const t = title.trim(); if (!t) return;
    setTitle('');
    try { await addTask(ctx.actor, { title: t, note: '', photo: '', location: null, dueDate: '', managersOnly: false, assignee: null, urgent: false }); toast({ text: `נוספה: ${t}` }, 2500); } catch (e) { setTitle(t); act.fail(e); }
  };
  return (
    <div className="r-toolbar">
      <Form onSubmit={add} className="r-addline"><input className="r-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="משימה חדשה… Enter מוסיף" aria-label="משימה חדשה" maxLength={200} /><Btn type="submit" disabled={!title.trim()}>הוספה</Btn></Form>
      <Btn kind="ghost" small to="/new">עם פרטים</Btn>
      {ctx.manager && <><Btn kind="quiet" small to="/manage/templates">משימות חוזרות</Btn><Btn kind="quiet" small to="/manage/places">מקומות</Btn></>}
    </div>
  );
}

function TaskTable({ rows, ctx, today, leaving, onDone, onTake, selectedId }: { rows: Task[]; ctx: TeamCtx; today: string; leaving: Set<string>; onDone: (t: Task) => void; onTake: (t: Task) => void; selectedId?: string }) {
  const openRow = (t: Task) => navigate(`/tasks/${t.id}`, false, true);
  return (
    <table className="r-table">
      <thead><tr><th aria-label="בוצע" /><th>משימה</th><th>איפה</th><th>על מי</th><th>עד מתי</th><th>ביקש/ה</th></tr></thead>
      <tbody>
        {rows.map((t) => {
          const due = dueText(t, today); const mine = t.assignee?.uid === ctx.actor.uid;
          return (
            <tr key={t.id} tabIndex={0} className={[t.urgent ? 'urgent' : '', t.id === selectedId ? 'sel' : '', leaving.has(t.id) ? 'leaving' : ''].filter(Boolean).join(' ')}
              onClick={() => openRow(t)} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter') openRow(t); if (e.key === ' ') { e.preventDefault(); onDone(t); } }}>
              <td className="r-c"><Check on={leaving.has(t.id)} onChange={() => onDone(t)} label={`בוצע: ${t.title}`} /></td>
              <td><span className="r-t">{t.title}</span>{t.urgent && <> <span className="r-tag">דחוף</span></>}</td>
              <td>{placeText(t)}</td>
              <td>{t.assignee ? <b>{mine ? 'שלך' : firstName(t.assignee.name)}</b> : isRoutine(t) ? 'שגרה' : <button type="button" className="r-take" onClick={(e) => { e.stopPropagation(); onTake(t); }}>לקחת</button>}</td>
              <td className={due.late ? 'late' : ''}>{due.text}</td>
              <td>{isRoutine(t) ? '' : firstName(t.createdBy.name)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- one task ----------
export function TaskDetail({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const { item: t, loading } = useTask(id);
  const log = useActivityFor('task', id);
  const act = useTaskActions(ctx); const toast = useToast(); const today = todayISO();
  const [note, setNote] = useState<string | null>(null);
  if (loading) return <><Head backTo="/tasks" backLabel="משימות" title="" /><div className="r-empty">טוען…</div></>;
  if (!t) return <><Head backTo="/tasks" backLabel="משימות" title="המשימה לא נמצאה" /><Empty title="ייתכן שנמחקה">אפשר לחפש אותה בהיסטוריה.</Empty></>;
  const mine = t.assignee?.uid === ctx.actor.uid; const routine = isRoutine(t);
  const canEdit = ctx.manager || (!routine && t.createdBy.uid === ctx.actor.uid);
  const due = dueText(t, today); const place = placeText(t);
  const assign = (uid: string) => {
    const p = ctx.team.find((x) => x.uid === uid);
    editTask(ctx.actor, t, { assignee: p ? { uid: p.uid, name: p.displayName } : null }).then(() => toast({ text: p ? `הועברה אל ${firstName(p.displayName)}` : 'פנויה לכולם' }, 2500)).catch(act.fail);
  };
  const saveNote = async () => { try { await setTaskDoneDetails(ctx.actor, t, { doneNote: (note || '').trim() }); setNote(null); toast({ text: 'נשמר' }, 2000); } catch (e) { act.fail(e); } };
  return (
    <>
      <Head backTo="/tasks" backLabel="משימות" title={t.title} over={[t.urgent ? 'דחוף' : '', routine ? 'שגרה יומית' : '', t.managersOnly ? 'מנהלים בלבד' : ''].filter(Boolean).join(' · ') || undefined}
        end={canEdit ? <A className="r-textlink" to={`/tasks/${t.id}/edit`}>עריכה</A> : undefined} />
      {t.photo && <img className="r-hero" src={t.photo} alt="תמונה שצורפה למשימה" />}
      {t.note && <p className="r-note">{t.note}</p>}
      {t.done && <div className="r-stamp">בוצע · {t.doneBy?.name} · {whenText(t.doneAt || t.updatedAt)}{t.doneNote && note === null && <small>{t.doneNote}</small>}</div>}
      {t.done && t.donePhoto && <img className="r-hero" src={t.donePhoto} alt="תמונה של מה שנעשה" style={{ marginTop: 14 }} />}
      {t.done && (note === null
        ? <div className="r-actions"><Btn kind="ghost" small onClick={() => act.photo(t)}>{t.donePhoto ? 'להחליף תמונה' : 'להוסיף תמונה'}</Btn><Btn kind="ghost" small onClick={() => setNote(t.doneNote || '')}>{t.doneNote ? 'לערוך הערה' : 'להוסיף הערה'}</Btn></div>
        : <Form onSubmit={saveNote}><textarea className="r-input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-label="הערה על מה שנעשה" placeholder="איפה הנחתי, מה חסר, מה נשאר…" /><div style={{ display: 'flex', gap: 10 }}><Btn type="submit">שמירה</Btn><Btn kind="quiet" onClick={() => setNote(null)}>ביטול</Btn></div></Form>)}
      <dl className="r-facts">
        <div><dt>על מי</dt><dd>{t.assignee ? (mine ? `עליך (${firstName(t.assignee.name)})` : t.assignee.name) : routine ? 'כולם, מי שעושה מסמן' : 'פנויה'}</dd>
          {ctx.manager && !routine && !t.done && <select className="r-input" style={{ minHeight: 44, width: 130, fontSize: 16 }} aria-label="להעביר למישהו" value={t.assignee?.uid || ''} onChange={(e) => assign(e.target.value)}><option value="">פנויה</option>{ctx.team.map((p) => <option key={p.uid} value={p.uid}>{firstName(p.displayName)}</option>)}</select>}</div>
        {place && <div><dt>איפה</dt><dd>{place}</dd>{t.location && <a className="r-btn ghost sm" href={mapsLink(t.location)} target="_blank" rel="noopener">ניווט</a>}</div>}
        {(due.text || routine) && <div><dt>עד מתי</dt><dd className={due.late ? 'late' : ''}>{routine ? `היום${ctx.templates.find((x) => x.id === t.templateId)?.time ? ', עד ' + ctx.templates.find((x) => x.id === t.templateId)!.time : ''}` : due.late ? `היה ${dayLabel(t.dueDate)}` : due.text}</dd></div>}
        {!routine && <div><dt>ביקש/ה</dt><dd>{t.createdBy.name}<small>{whenText(t.createdAt)}</small></dd></div>}
      </dl>
      {log.items.length > 0 && <><Sect title="מה קרה כאן" /><ul className="r-log">{log.items.map((a) => <li key={a.id}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}<span>{whenText(a.at)}</span></li>)}</ul></>}
      <div className="r-dock">
        {t.done ? <Btn kind="ghost" onClick={() => act.undone(t)}>להחזיר לביצוע</Btn>
          : <>
            <Btn onClick={() => { act.done(t); }}>בוצע</Btn>
            {!routine && !t.assignee && <Btn kind="ghost" fit onClick={() => act.take(t)}>לקחת</Btn>}
            {!routine && mine && <Btn kind="ghost" fit onClick={() => act.release(t)}>לשחרר</Btn>}
          </>}
      </div>
    </>
  );
}

// ---------- history ----------
type Range = '7' | '30' | '90';
export function HistoryScreen({ ctx, tab }: { ctx: TeamCtx; tab: 'tasks' | 'shopping' }) {
  const [range, setRange] = useSticky<Range>('history-range', '7');
  const [q, setQ] = useState('');
  const from = useMemo(() => new Date(Date.now() - Number(range) * 86400_000).toISOString(), [range]);
  const to = useMemo(() => new Date(Date.now() + 86400_000).toISOString(), [range]);
  const tasks = useHistoryTasks(tab === 'tasks', ctx.manager, from, to);
  const bought = useBoughtHistory(tab === 'shopping', from);
  const toast = useToast();
  const text = q.trim();
  const taskRows = tasks.items.filter((t) => !text || t.title.includes(text) || (t.doneBy?.name || '').includes(text) || (t.doneNote || '').includes(text));
  const shopRows = bought.items.filter((i) => !text || i.title.includes(text) || (i.boughtBy?.name || '').includes(text));
  const tally = useMemo(() => { const m = new Map<string, { name: string; n: number }>(); for (const t of taskRows) { if (!t.doneBy) continue; const x = m.get(t.doneBy.uid) || { name: t.doneBy.name, n: 0 }; x.n++; m.set(t.doneBy.uid, x); } return [...m.values()].sort((a, b) => b.n - a.n); }, [taskRows]);
  const days = <T extends { at: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = dateKey(new Date(r.at)); m.set(k, [...(m.get(k) || []), r]); } return [...m.entries()]; };
  const again = (title: string, qty: string, category: 'super' | 'building' | 'online' | 'giveaway') => addShopping(ctx.actor, { title, qty, note: '', link: '', category, urgent: false }).then(() => toast({ text: `חזר לרשימה: ${title}` }, 2500)).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const capped = (tab === 'tasks' ? tasks.items.length >= 500 : bought.items.length >= 400);
  return (
    <>
      <Head backTo={tab === 'tasks' ? '/tasks' : '/shopping'} backLabel={tab === 'tasks' ? 'משימות' : 'קניות'} title="היסטוריה" />
      <Tabs label="היסטוריה של" value={tab} onChange={(v) => navigate(v === 'tasks' ? '/history' : '/history/shopping', true)} items={[{ id: 'tasks', label: 'משימות' }, { id: 'shopping', label: 'קניות' }]} />
      <div className="r-form" style={{ paddingTop: 14, gap: 10 }}>
        <div className="r-seg" role="group" aria-label="תקופה">{(['7', '30', '90'] as Range[]).map((r) => <label key={r}><input type="radio" name="range" checked={range === r} onChange={() => setRange(r)} />{r === '7' ? 'שבוע' : r === '30' ? 'חודש' : '3 חודשים'}</label>)}</div>
        <input className="r-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'tasks' ? 'חיפוש: מה, מי, הערה' : 'חיפוש: מה, מי קנה'} aria-label="חיפוש בהיסטוריה" />
      </div>
      {tab === 'tasks' ? <>
        {tally.length > 0 && <p className="r-hint" style={{ paddingTop: 14, fontSize: 16, color: 'var(--r-ink)' }}><b>{taskRows.length} בוצעו.</b> {tally.map((x) => `${firstName(x.name)} ${x.n}`).join(' · ')}</p>}
        {tasks.loading ? <div className="r-empty">טוען…</div> : taskRows.length === 0 ? <Empty title="אין מה להציג">{text ? 'נסו מילה אחרת או תקופה ארוכה יותר.' : 'בתקופה הזו לא סומנו משימות.'}</Empty>
          : days(taskRows.map((t) => ({ ...t, at: t.doneAt || t.updatedAt }))).map(([k, rows]) => <div key={k}><Sect title={dayLabel(k)} n={rows.length} />{rows.map((t) => <DoneLine key={t.id} t={t} />)}</div>)}
      </> : <>
        {bought.loading ? <div className="r-empty">טוען…</div> : shopRows.length === 0 ? <Empty title="אין מה להציג">{text ? 'נסו מילה אחרת או תקופה ארוכה יותר.' : 'בתקופה הזו לא נקנה כלום.'}</Empty>
          : days(shopRows.map((i) => ({ ...i, at: i.boughtAt || i.updatedAt }))).map(([k, rows]) => <div key={k}><Sect title={dayLabel(k)} n={rows.length} />{rows.map((i) => <div key={i.id} className="r-doneline"><s style={{ textDecoration: 'none', color: 'var(--r-ink)' }}>{i.title}{i.qty ? ` · ${i.qty}` : ''}</s><b>{firstName(i.boughtBy?.name || '')}</b><button type="button" className="r-more" style={{ fontWeight: 600, textDecoration: 'underline', minHeight: 40 }} onClick={() => again(i.title, i.qty, i.category)}>שוב</button></div>)}</div>)}
      </>}
      {capped && <p className="r-hint" style={{ paddingTop: 16 }}>מוצגות הרשומות האחרונות בלבד. לתקופה ארוכה יותר: דוחות, במסך הניהול.</p>}
    </>
  );
}
