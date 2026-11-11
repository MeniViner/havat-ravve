import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Task, TaskLocation } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Sec, Row, Chk, Pill, Btn, Icon, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Days as _Days, Loading, useToast, useUndoable, fmtTime, firstName, dayLabel, todayISO, addDays, relTime, whenText, useDesktop, useOpenSections, fmtDayShort } from '../ui';
import { navigate, match, useRoute } from '../router';
import { setTaskDone, addTask, editTask, deleteTask, restoreTask, setTaskDoneDetails, useTask, compressPhoto, getPosition, useHistoryTasks, useBoughtHistory, type NewTask } from '../store';
import { useActivityFor, ACTION_LABELS, useActivityByKind } from '../activity';
import { byPriority, TaskRow, TaskOwner, useTakeTask } from './Today';
import { KIND_LABELS } from '../types';
void _Days;

// ---------- shared bits ----------
export function taskMeta(t: Task, ctx: TeamCtx, today: string, noOwner = false): ReactNode {
  const parts: ReactNode[] = [];
  if (t.templateId) { const tpl = ctx.templates.find((x) => x.id === t.templateId); parts.push(<span key="r"><Icon name="repeat" /> {tpl?.days.length ? 'חוזרת' : 'כל יום'}{tpl?.time ? ` עד ${tpl.time}` : ''}</span>); }
  else if (t.dueDate && t.dueDate < today) parts.push(<span key="d" style={{ color: 'var(--rust)', fontWeight: 600 }}>היה עד {dayLabel(t.dueDate)}</span>);
  else if (t.dueDate && t.dueDate !== today) parts.push(<span key="d">{dayLabel(t.dueDate)}</span>);
  if (!noOwner && t.assignee && t.assignee.uid !== ctx.actor.uid) parts.push(<span key="a">{firstName(t.assignee.name)}</span>);
  if (!t.templateId && t.createdBy.uid !== ctx.actor.uid && (!t.assignee || t.assignee.uid === ctx.actor.uid)) parts.push(<span key="c">{firstName(t.createdBy.name)}{t.assignee ? ' ביקש' : ''}{!t.assignee ? ` · ${relTime(t.createdAt)}` : ''}</span>);
  if (t.location) parts.push(<span key="l"><Icon name="pin" /> {t.location.placeName || 'נקודה'}</span>);
  if (t.note && !t.photo) parts.push(<Icon key="n" name="info" />);
  return parts;
}

export function PhotoPicker({ value, onChange, label = 'צילום', big }: { value: string; onChange: (v: string) => void; label?: string; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div style={{ padding: '0 20px', marginTop: 14 }}>
      {value && <div className="photo" style={{ margin: '0 0 10px' }}><img src={value} alt="" /></div>}
      <div className="inline">
        <Btn kind="ghost" size={big ? undefined : 'sm'} icon="camera" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'דוחס…' : value ? 'החלפת תמונה' : label}</Btn>
        {value && <Btn kind="quiet" size="sm" onClick={() => onChange('')}>הסרה</Btn>}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { onChange(await compressPhoto(f)); } catch (err) { toast({ text: (err as Error).message, kind: 'error' }); } finally { setBusy(false); } }} />
    </div>
  );
}
export const mapsLink = (l: TaskLocation) => `https://maps.google.com/?q=${l.lat},${l.lng}`;

// ---------- list ----------
type Filter = 'all' | 'mine' | 'free' | 'theirs' | 'urgent' | 'managers';
export function TasksScreen({ ctx, open, recent, loading, selectedId }: { ctx: TeamCtx; open: Task[]; recent: Task[]; loading: boolean; selectedId?: string }) {
  const desktop = useDesktop();
  const today = todayISO();
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = useState('');
  const mineCount = open.filter((t) => t.assignee?.uid === ctx.actor.uid).length;
  const list = useMemo(() => open.filter((t) => filter === 'mine' ? t.assignee?.uid === ctx.actor.uid : filter === 'free' ? !t.assignee : filter === 'theirs' ? !!t.assignee && t.assignee.uid !== ctx.actor.uid : filter === 'urgent' ? t.urgent : filter === 'managers' ? t.managersOnly : true)
    .filter((t) => !who || (who === 'none' ? !t.assignee : t.assignee?.uid === who)).sort(byPriority(ctx.actor.uid, today)), [open, filter, who, today]);
  const groups = [
    { key: 'late', title: 'באיחור', items: list.filter((t) => t.dueDate && t.dueDate < today) },
    { key: 'today', title: 'היום', items: list.filter((t) => t.dueDate === today || (t.urgent && (!t.dueDate || t.dueDate === today))) },
    { key: 'later', title: 'בהמשך', items: list.filter((t) => t.dueDate && t.dueDate > today && !t.urgent) },
    { key: 'nodate', title: 'בלי תאריך', items: list.filter((t) => !t.dueDate && !t.urgent) },
  ].filter((g) => g.items.length);
  const toggleDone = (t: Task, v: boolean) => setTaskDone(ctx.actor, t, v).catch(() => {});
  const { isOpen, toggle } = useOpenSections(['late', 'today', 'later', 'nodate', 'done'], 'tasks');
  const chips = <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'הכל', n: open.length }, { value: 'mine', label: 'עליי', n: mineCount }, { value: 'free', label: 'פנויות', n: open.filter((t) => !t.assignee).length }, { value: 'theirs', label: 'אצל אחרים', n: open.filter((t) => t.assignee && t.assignee.uid !== ctx.actor.uid).length || undefined }, { value: 'urgent', label: 'דחוף', n: open.filter((t) => t.urgent).length || undefined }, ...(ctx.manager ? [{ value: 'managers' as Filter, label: 'מנהלים בלבד', n: open.filter((t) => t.managersOnly).length || undefined }] : [])]} scroll={!desktop} />;

  return (
    <>
      <Top title="משימות" sub={`${open.length} לביצוע · ${mineCount} עליך · ${recent.length} בוצעו ביממה${desktop ? '. מסמנים בעיגול, והשם של המבצע נרשם לבד.' : ''}`}
        end={desktop ? <>{ctx.manager && <Btn kind="ghost" size="sm" icon="repeat" to="/manage/templates">משימות חוזרות</Btn>}{ctx.manager && <Btn kind="ghost" size="sm" icon="pin" to="/manage/places">מקומות</Btn>}<Btn kind="ghost" size="sm" icon="history" to="/history">היסטוריה</Btn><Btn size="sm" icon="plus" to="/tasks/new">משימה</Btn></> : <Btn kind="quiet" size="sm" icon="history" to="/history">היסטוריה</Btn>} />
      <div style={{ padding: desktop ? '8px 20px 0' : '8px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {chips}
        {desktop && <><span className="muted">·</span><Chips value={who} onChange={setWho} options={[{ value: '', label: 'כולם' }, ...ctx.team.filter((p) => p.role !== 'guest' && p.status === 'active').slice(0, 8).map((p) => ({ value: p.uid, label: firstName(p.displayName) })), { value: 'none', label: 'לא הוקצה' }]} /></>}
      </div>
      {loading && !open.length ? <Loading /> : !groups.length ? <Empty title={filter === 'mine' ? 'אין משימות עליך' : filter === 'free' ? 'אין משימות פנויות' : 'אין משימות כאלה'} text={filter === 'mine' ? 'אפשר לקחת אחת מהפנויות.' : 'אפשר להוסיף משימה בכפתור הפלוס.'} /> : desktop ? (
        <div className="tablewrap"><table>
          <thead><tr><th style={{ width: 44 }}></th><th>מתי</th><th>משימה</th><th>של מי</th><th className="opt">מקום</th><th className="opt">יצר/ה</th></tr></thead>
          <tbody>{groups.map((g) => <GroupRows key={g.key} g={g} ctx={ctx} today={today} selectedId={selectedId} onDone={toggleDone} />)}</tbody>
        </table></div>
      ) : groups.map((g) => (
        <div key={g.key}>
          <Sec serif tone={g.key === 'late' ? 'rust' : undefined} title={g.title} n={g.items.length} open={isOpen(g.key)} onToggle={() => toggle(g.key)} />
          {isOpen(g.key) && <div className="list">{g.items.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div>}
        </div>
      ))}
      {!desktop && recent.length > 0 && <>
        <Sec serif title="בוצע ביממה האחרונה" n={recent.length} link="היסטוריה" linkTo="/history" open={isOpen('done')} onToggle={() => toggle('done')} />
        {isOpen('done') && <div className="list">{recent.slice(0, 10).map((t) => <Row key={t.id} done to={`/tasks/${t.id}`} start={<Chk round on onChange={(v) => toggleDone(t, v)} label={`להחזיר לביצוע: ${t.title}`} />} title={t.title} meta={<span>{firstName(t.doneBy?.name || '')} · {whenText(t.doneAt!)}</span>} />)}</div>}
      </>}
    </>
  );
}
function GroupRows({ g, ctx, today, selectedId, onDone }: { g: { key: string; title: string; items: Task[] }; ctx: TeamCtx; today: string; selectedId?: string; onDone: (t: Task, v: boolean) => void }) {
  const take = useTakeTask(ctx);
  return <>
    <tr className="grp"><td colSpan={6} className={g.key === 'late' ? 'rust' : ''}>{g.title}<span className="n"> · {g.items.length}</span></td></tr>
    {g.items.map((t) => { const tpl = t.templateId ? ctx.templates.find((x) => x.id === t.templateId) : null; return <tr key={t.id} className={'link ' + (t.id === selectedId ? 'sel' : '') + (t.assignee?.uid === ctx.actor.uid ? ' mine' : '')} onClick={() => navigate(`/tasks/${t.id}`)}>
      <td onClick={(e) => e.stopPropagation()}><Chk round small on={t.done} onChange={(v) => onDone(t, v)} label={`בוצע: ${t.title}`} rust={t.urgent} /></td>
      <td>{t.urgent ? <Pill tone="rust">דחוף</Pill> : tpl ? <span className="muted">{tpl.time ? `עד ${tpl.time}` : 'חוזרת'}</span> : t.dueDate ? (t.dueDate < today ? <span style={{ color: 'var(--rust)', fontWeight: 600 }}>היה עד {dayLabel(t.dueDate)}</span> : dayLabel(t.dueDate)) : <span className="muted">{relTime(t.createdAt)}</span>}</td>
      <td className="wrap" style={{ fontWeight: 600 }}>{t.title}{t.managersOnly && <> <Pill>מנהלים</Pill></>}</td>
      <td onClick={(e) => { if (!t.assignee && !t.templateId) e.stopPropagation(); }}><TaskOwner t={t} ctx={ctx} onTake={() => take(t)} /></td>
      <td className="opt">{t.location?.placeName || <span className="muted">—</span>}</td>
      <td className="opt muted">{t.templateId ? 'חוזרת' : firstName(t.createdBy.name)}</td>
    </tr>; })}
  </>;
}

// ---------- detail ----------
export function TaskDetail({ id, ctx, panel }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item: t, loading } = useTask(id);
  const log = useActivityFor(id);
  const toast = useToast();
  const undoable = useUndoable();
  const today = todayISO();
  const [note, setNote] = useState('');
  if (loading) return <Loading />;
  if (!t) return <><Top backTo="/tasks" title="המשימה לא נמצאה" /><Empty title="אולי נמחקה" action={<Btn kind="ghost" to="/tasks">לרשימה</Btn>} /></>;
  const mine = t.assignee?.uid === ctx.actor.uid;
  const canEdit = ctx.manager || t.createdBy.uid === ctx.actor.uid;
  const done = (v: boolean) => setTaskDone(ctx.actor, t, v).then(() => { if (v) toast({ text: 'סומן בוצע. אפשר להוסיף תמונה של התוצאה.', action: { label: 'ביטול', onClick: () => setTaskDone(ctx.actor, t, false) } }, 6000); }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const take = () => editTask(ctx.actor, t, { assignee: mine ? null : ctx.actor }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const tpl = t.templateId ? ctx.templates.find((x) => x.id === t.templateId) : null;
  return (
    <>
      <Top backTo={panel ? undefined : '/tasks'} back={panel} backLabel={panel ? 'סגירה' : 'משימות'} title={t.title} end={canEdit && !t.done ? <Btn kind="quiet" size="sm" icon="edit" to={`/tasks/${t.id}/edit`}>עריכה</Btn> : undefined} />
      <div className="inline pad">
        {t.done ? <Pill tone="ok">בוצע · {firstName(t.doneBy?.name || '')} · {whenText(t.doneAt!)}</Pill> : <>
          {t.urgent && <Pill tone="rust">דחוף</Pill>}
          {tpl ? <Pill>{tpl.days.length ? 'חוזרת' : 'כל יום'}{tpl.time ? ` · עד ${tpl.time}` : ''}</Pill> : t.dueDate ? <Pill tone={t.dueDate < today ? 'rust' : undefined}>{t.dueDate < today ? `היה עד ${dayLabel(t.dueDate)}` : dayLabel(t.dueDate)}</Pill> : <Pill>כשמתפנים</Pill>}
          {t.managersOnly && <Pill>מנהלים בלבד</Pill>}
        </>}
      </div>
      {t.photo && <div className="photo" style={{ marginTop: 14 }}><img src={t.photo} alt="" /></div>}
      {t.note && <p className="lead ink" style={{ paddingTop: 14, fontSize: 17 }}>{t.note}</p>}
      <dl className="kv" style={{ marginTop: 10 }}>
        {t.location && <><dt>איפה</dt><dd style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span><b>{t.location.placeName || 'נקודה במפה'}</b>{t.location.placeId && <span className="muted"> · מקום שמור</span>}</span><a className="btn ghost xs" href={mapsLink(t.location)} target="_blank" rel="noopener"><Icon name="nav" size={16} />נווט</a></dd></>}
        <dt>למי</dt><dd>{t.assignee ? <b>{t.assignee.name}{mine ? ' (את/ה)' : ''}</b> : <><b>כל מי שפנוי</b><span className="muted"> · עוד לא נלקח</span></>}</dd>
        <dt>יצר/ה</dt><dd>{t.templateId ? 'משימה חוזרת' : t.createdBy.name} <span className="muted">· {whenText(t.createdAt)}</span></dd>
      </dl>
      {t.done && <>
        {t.donePhoto && <div className="photo" style={{ marginTop: 14 }}><img src={t.donePhoto} alt="" /></div>}
        {t.doneNote && <blockquote className="quote">{t.doneNote}</blockquote>}
        {(t.doneBy?.uid === ctx.actor.uid || ctx.manager) && <>
          <PhotoPicker value={t.donePhoto} label="תמונה של התוצאה" onChange={(donePhoto) => setTaskDoneDetails(ctx.actor, t, { donePhoto }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }))} />
          {!t.doneNote && <Field><div style={{ display: 'flex', gap: 8 }}><Input placeholder="הערה קצרה על מה שנעשה" value={note} onChange={(e) => setNote(e.target.value)} /><Btn kind="ghost" disabled={!note.trim()} onClick={() => setTaskDoneDetails(ctx.actor, t, { doneNote: note.trim() }).then(() => setNote(''))}>שמירה</Btn></div></Field>}
        </>}
      </>}
      <Sec title="היסטוריה" n={log.items.length || undefined} />
      <div className="list">{log.items.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action}{a.text.includes(':') && a.action !== 'done' ? '' : ''} · {firstName(a.by.name)}</span>} meta={<span>{whenText(a.at)}</span>} />)}{!log.items.length && <p className="lead">נוצרה {whenText(t.createdAt)} · {t.createdBy.name}</p>}</div>
      <div className="actions sticky">
        {!t.done ? <>
          <Btn size="big" icon="check" onClick={() => done(true)}>בוצע</Btn>
          <div className="actions row2" style={{ padding: 0 }}>{!t.templateId && <Btn kind="ghost" onClick={take}>{mine ? 'לשחרר' : 'אני על זה'}</Btn>}{canEdit && <Btn kind="ghost" onClick={() => editTask(ctx.actor, t, { urgent: !t.urgent })}>{t.urgent ? 'לא דחוף' : 'דחוף'}</Btn>}</div>
        </> : <Btn kind="ghost" onClick={() => done(false)}>להחזיר לביצוע</Btn>}
        {canEdit && !t.templateId && <Btn kind="danger" size="sm" onClick={() => undoable('המשימה נמחקה', async () => { await deleteTask(ctx.actor, t); navigate('/tasks', true); }, () => restoreTask(t))}>מחיקה</Btn>}
      </div>
    </>
  );
}

// ---------- new / edit ----------
type When = 'today' | 'tomorrow' | 'week' | 'date' | 'none';
export function TaskForm({ ctx, existing }: { ctx: TeamCtx; existing?: Task }) {
  const toast = useToast();
  const today = todayISO();
  const [f, setF] = useState<NewTask>(() => existing ? { title: existing.title, note: existing.note, photo: existing.photo, location: existing.location, dueDate: existing.dueDate, managersOnly: existing.managersOnly, assignee: existing.assignee, urgent: existing.urgent } : { title: '', note: '', photo: '', location: null, dueDate: today, managersOnly: false, assignee: null, urgent: false });
  const [when, setWhen] = useState<When>(() => !f.dueDate ? 'none' : f.dueDate === today ? 'today' : f.dueDate === addDays(today, 1) ? 'tomorrow' : 'date');
  const [locBusy, setLocBusy] = useState(false);
  const [more, setMore] = useState(!!existing && (!!existing.note || existing.managersOnly));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewTask>) => setF((s) => ({ ...s, ...p }));
  const pickWhen = (w: When) => { setWhen(w); set({ dueDate: w === 'today' ? today : w === 'tomorrow' ? addDays(today, 1) : w === 'week' ? addDays(today, 7 - new Date().getDay() - 1 || 6) : w === 'none' ? '' : f.dueDate || today }); };
  const here = async () => { setLocBusy(true); try { const p = await getPosition(); set({ location: { lat: p.lat, lng: p.lng } }); } catch (e) { toast({ text: (e as Error).message, kind: 'error' }); } finally { setLocBusy(false); } };
  const save = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    try { if (existing) { await editTask(ctx.actor, existing, f); navigate(`/tasks/${existing.id}`, true); } else { const id = await addTask(ctx.actor, f); toast({ text: 'נוספה', action: { label: 'פתיחה', onClick: () => navigate(`/tasks/${id}`) } }, 3000); navigate('/tasks', true); } }
    catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); }
  };
  const team = ctx.team.filter((p) => p.status === 'active' && p.role !== 'guest' && p.uid !== ctx.actor.uid);
  return (
    <>
      <Top back title={existing ? 'עריכת משימה' : 'משימה חדשה'} end={<Btn kind="quiet" size="sm" onClick={() => navigate(existing ? `/tasks/${existing.id}` : '/tasks', true)}>ביטול</Btn>} />
      <Field><Input big autoFocus placeholder="מה צריך לעשות?" value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <PhotoPicker value={f.photo} onChange={(photo) => set({ photo })} />
      <Field label="איפה?" hint={f.location && !f.location.placeId ? 'המיקום נשמר כנקודה. אפשר לבחור מקום שמור במקום.' : undefined}>
        <div className="chips">
          <Chip on={!!f.location && !f.location.placeId} onClick={here}><Icon name="pin" size={16} />{locBusy ? 'מאתר…' : 'כאן, איפה שאני'}</Chip>
          {ctx.places.slice(0, 12).map((p) => <Chip key={p.id} on={f.location?.placeId === p.id} onClick={() => set({ location: f.location?.placeId === p.id ? null : { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name } })}>{p.name}</Chip>)}
          {f.location && <Chip onClick={() => set({ location: null })}><Icon name="x" size={14} />בלי מקום</Chip>}
        </div>
      </Field>
      <Field label="למי?"><div className="chips"><Chip on={!f.assignee} onClick={() => set({ assignee: null })}>כל מי שפנוי</Chip><Chip on={f.assignee?.uid === ctx.actor.uid} onClick={() => set({ assignee: ctx.actor })}>אני</Chip>{team.map((p) => <Chip key={p.uid} on={f.assignee?.uid === p.uid} onClick={() => set({ assignee: { uid: p.uid, name: p.displayName } })}>{firstName(p.displayName)}</Chip>)}</div></Field>
      <Field label="מתי?"><div className="chips"><Chips value={when} onChange={pickWhen} options={[{ value: 'today', label: 'היום' }, { value: 'tomorrow', label: 'מחר' }, { value: 'week', label: 'השבוע' }, { value: 'date', label: 'תאריך…' }, { value: 'none', label: 'כשמתפנים' }]} /></div>{when === 'date' && <Input type="date" dir="ltr" style={{ marginTop: 10 }} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />}</Field>
      <div style={{ marginTop: 14 }}>
        <SwitchRow on={f.urgent} onChange={(urgent) => set({ urgent })} title="דחוף" meta="מופיע ראשון אצל כולם, בריבוע אדום" />
        {ctx.manager && <SwitchRow on={f.managersOnly} onChange={(managersOnly) => set({ managersOnly })} title="למנהלים בלבד" meta="מתנדבים לא יראו" />}
      </div>
      {!more ? <div className="inline pad" style={{ paddingTop: 12 }}><Btn kind="quiet" size="sm" icon="plus" onClick={() => setMore(true)}>הסבר קצר (לא חובה)</Btn></div>
        : <Field label="הסבר קצר (לא חובה)"><Textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="מה בדיוק, איפה הכלים, על מה לשים לב" /></Field>}
      <div className="actions sticky"><Btn size="big" disabled={!f.title.trim() || busy} onClick={save}>{existing ? 'שמירה' : 'הוספה'}</Btn></div>
    </>
  );
}
export function TaskEditPage({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const { item, loading } = useTask(id);
  if (loading) return <Loading />;
  if (!item) return <Empty title="המשימה לא נמצאה" />;
  return <TaskForm ctx={ctx} existing={item} />;
}

// ---------- history ----------
type HistTab = 'tasks' | 'shopping' | 'all';
export function HistoryScreen({ ctx, tab }: { ctx: TeamCtx; tab: HistTab }) {
  const [range, setRange] = useState<'week' | 'month' | '3m'>('week');
  const [q, setQ] = useState('');
  const today = todayISO();
  const from = addDays(today, range === 'week' ? -7 : range === 'month' ? -30 : -90) + 'T00:00:00.000Z';
  const tasks = useHistoryTasks(tab === 'tasks', ctx.manager, from, today + 'T23:59:59.999Z');
  const bought = useBoughtHistory(tab === 'shopping', from);
  const acts = useActivityByKind('all', tab === 'all', 300);
  const s = q.trim();
  const items = tab === 'tasks' ? tasks.items.filter((t) => !s || t.title.includes(s)).map((t) => ({ id: t.id, at: t.doneAt!, title: t.title, who: t.doneBy?.name || '', extra: t.donePhoto ? 'תמונה' : t.doneNote ? `"${t.doneNote}"` : '', to: `/tasks/${t.id}` }))
    : tab === 'shopping' ? bought.items.filter((i) => !s || i.title.includes(s)).map((i) => ({ id: i.id, at: i.boughtAt!, title: `${i.title}${i.qty ? ' · ' + i.qty : ''}`, who: i.boughtBy?.name || '', extra: '', to: `/shopping/${i.id}` }))
      : acts.items.filter((a) => !s || a.text.includes(s) || a.by.name.includes(s)).map((a) => ({ id: a.id, at: a.at, title: `${firstName(a.by.name)} · ${ACTION_LABELS[a.action] || a.action}: ${a.text}`, who: '', extra: KIND_LABELS[a.kind], to: '' }));
  const byDay = useMemo(() => { const m = new Map<string, typeof items>(); for (const i of items) { const k = i.at.slice(0, 10); m.set(k, [...(m.get(k) || []), i]); } return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])); }, [items]);
  const perPerson = useMemo(() => { const m = new Map<string, number>(); for (const i of items) if (i.who) m.set(firstName(i.who), (m.get(firstName(i.who)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [items]);
  const max = perPerson[0]?.[1] || 1;
  return (
    <>
      <Top backTo="/tasks" backLabel="משימות" title="היסטוריה" sub="מי עשה מה ומתי. נשמר לתמיד." />
      <div style={{ padding: '8px 20px 0' }}><Chips value={tab} onChange={(v) => navigate('/history/' + v, true)} options={[{ value: 'tasks', label: 'משימות' }, { value: 'shopping', label: 'קניות' }, { value: 'all', label: 'כל הפעילות' }]} /></div>
      <div className="inline pad"><Input placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minHeight: 44 }} /><Chips value={range} onChange={setRange} options={[{ value: 'week', label: 'שבוע' }, { value: 'month', label: 'חודש' }, { value: '3m', label: '3 חודשים' }]} /></div>
      {tab !== 'all' && perPerson.length > 0 && <><Sec title={`${items.length} ${tab === 'tasks' ? 'משימות בוצעו' : 'פריטים נקנו'}`} n={range === 'week' ? 'השבוע' : range === 'month' ? 'החודש' : '3 חודשים'} /><div className="bars">{perPerson.slice(0, 6).map(([n, c]) => <div className="bar" key={n}><span>{n}</span><i style={{ width: `${(c / max) * 100}%` }} /><b>{c}</b></div>)}</div></>}
      {byDay.map(([day, list]) => <div key={day}><Sec title={dayLabel(day) === fmtDayShort(day) ? fmtDayShort(day) : `${dayLabel(day)}, ${fmtDayShort(day).split(' ')[0]}`} n={list.length} /><div className="list">{list.map((i) => <Row key={i.id} to={i.to || undefined} center={!i.to} title={<span style={{ fontWeight: i.to ? 500 : 400, fontSize: i.to ? 17 : 15 }}>{i.title}</span>} meta={<span>{i.who ? firstName(i.who) + ' · ' : ''}{fmtTime(i.at)}{i.extra ? ' · ' + i.extra : ''}</span>} chev={!!i.to} />)}</div></div>)}
      {!byDay.length && <Empty title="אין כלום בתקופה הזו" />}
    </>
  );
}

// ---------- route glue ----------
export function useTaskRoute() { const r = useRoute(); return { detail: match(r, '/tasks/:id'), edit: match(r, '/tasks/:id/edit') }; }

