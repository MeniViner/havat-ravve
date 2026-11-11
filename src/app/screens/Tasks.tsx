import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task, Place, TaskLocation, Actor, Profile } from '../types';
import { addTask, editTask, setTaskDone, setTaskDoneDetails, deleteTask, compressPhoto, getPosition, type NewTask } from '../store';
import { useActivityFor } from '../activity';
import { Timeline } from './Shopping';
import { Icon, Sheet, Button, Check, Empty, Avatar, useToast, fmtDate, fmtTime, relTime, firstName } from '../ui';
import { todayKey } from '../firebase';
import { navigate } from '../router';

export type TaskCtx = { actor: Actor; manager: boolean; places: Place[]; team?: Profile[] };

export function TaskRow({ task, ctx, onOpen }: { task: Task; ctx: TaskCtx; onOpen: (t: Task) => void }) {
  const toast = useToast();
  const overdue = !task.done && task.dueDate && task.dueDate < todayKey();
  const mine = task.assignee?.uid === ctx.actor.uid;
  const toggle = async (v: boolean) => {
    try {
      await setTaskDone(ctx.actor, task, v);
      if (v) toast({ text: 'סומן כבוצע', action: { label: 'ביטול', onClick: () => setTaskDone(ctx.actor, { ...task, done: true }, false) } }, 6000);
    } catch { toast({ text: 'לא הצלחנו לשמור', kind: 'error' }); }
  };
  return (
    <button type="button" className={'row ' + (task.done ? 'done' : '') + (task.urgent && !task.done ? ' urgent' : '')} onClick={() => onOpen(task)}>
      <Check checked={task.done} onChange={toggle} label={task.done ? 'בטל סימון' : 'סמן כבוצע'} />
      <div className="row-main">
        <div className="row-title">{task.title}</div>
        <div className="row-meta">
          {task.done && task.doneBy ? <span className="who"><Icon name="check" />{firstName(task.doneBy.name)} · {relTime(task.doneAt)}</span>
            : task.assignee ? <span className={'who ' + (mine ? 'tag ok' : '')}><Icon name="user" />{mine ? 'שלי' : firstName(task.assignee.name)}</span>
            : <span className="who">{firstName(task.createdBy.name)}</span>}
          {task.urgent && !task.done && <span className="tag bad">דחוף</span>}
          {task.templateId && <span className="who"><Icon name="repeat" />חוזרת</span>}
          {!task.templateId && task.dueDate && <span className={'who ' + (overdue ? 'tag bad' : '')}><Icon name="clock" />{task.dueDate === todayKey() ? 'היום' : fmtDate(task.dueDate)}</span>}
          {task.location && <span className="who"><Icon name="pin" />{task.location.placeName || 'מיקום'}</span>}
          {task.note && <span className="who"><Icon name="info" /></span>}
          {task.managersOnly && <span className="tag gold">מנהלים</span>}
        </div>
      </div>
      {(task.photo || task.donePhoto) && <img className="row-thumb" src={task.donePhoto || task.photo} alt="" />}
    </button>
  );
}

export function TaskList({ tasks, ctx, onOpen, empty }: { tasks: Task[]; ctx: TaskCtx; onOpen: (t: Task) => void; empty: React.ReactNode }) {
  if (!tasks.length) return <>{empty}</>;
  return <div className="list">{tasks.map((t) => <TaskRow key={t.id} task={t} ctx={ctx} onOpen={onOpen} />)}</div>;
}

// ---------- pickers ----------
export function PhotoPicker({ value, onChange, label = 'תמונה' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="field">
      <span>{label}</span>
      <div className="photo-pick">
        {value && <img src={value} alt="" />}
        <Button kind="secondary" className="sm" disabled={busy} onClick={() => input.current?.click()}><Icon name="camera" />{busy ? 'דוחס…' : value ? 'החלפה' : 'צילום או בחירה'}</Button>
        {value && <Button kind="quiet" className="sm" onClick={() => onChange('')}>הסרה</Button>}
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          setBusy(true); try { onChange(await compressPhoto(f)); } catch (err: any) { toast({ text: err.message, kind: 'error' }); } finally { setBusy(false); }
        }} />
      </div>
    </div>
  );
}

export function LocationPicker({ value, onChange, places }: { value: TaskLocation | null; onChange: (v: TaskLocation | null) => void; places: Place[] }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="field">
      <span>מיקום (לא חובה)</span>
      <div className="chips">
        <button type="button" className={'chip ' + (value && !value.placeId ? 'on' : '')} disabled={busy} onClick={async () => {
          setBusy(true); try { const p = await getPosition(); onChange({ ...p, placeName: 'המיקום שלי' }); } catch (e: any) { toast({ text: e.message, kind: 'error' }); } finally { setBusy(false); }
        }}><Icon name="pin" />{busy ? 'מאתר…' : 'כאן, איפה שאני'}</button>
        {places.map((p) => <button key={p.id} type="button" className={'chip ' + (value?.placeId === p.id ? 'on' : '')} onClick={() => onChange(value?.placeId === p.id ? null : { lat: p.lat, lng: p.lng, placeId: p.id, placeName: p.name })}>{p.name}</button>)}
        {value && <button type="button" className="chip" onClick={() => onChange(null)}><Icon name="x" />בלי מיקום</button>}
      </div>
    </div>
  );
}

function AssigneePicker({ value, onChange, team, me }: { value: Actor | null; onChange: (v: Actor | null) => void; team: Profile[]; me: Actor }) {
  const people = useMemo(() => { const list = team.filter((p) => p.status === 'active' && p.role !== 'guest').map((p) => ({ uid: p.uid, name: p.displayName })); if (!list.some((p) => p.uid === me.uid)) list.unshift(me); return list; }, [team, me.uid]);
  return (
    <div className="field">
      <span>למי? (לא חובה)</span>
      <div className="chips">
        <button type="button" className={'chip ' + (!value ? 'on' : '')} onClick={() => onChange(null)}>כל מי שפנוי</button>
        {people.map((p) => <button key={p.uid} type="button" className={'chip ' + (value?.uid === p.uid ? 'on' : '')} onClick={() => onChange(value?.uid === p.uid ? null : p)}>{p.uid === me.uid ? 'אני' : firstName(p.name)}</button>)}
      </div>
    </div>
  );
}

// ---------- add / edit ----------
const blank: NewTask = { title: '', note: '', photo: '', location: null, dueDate: '', managersOnly: false, assignee: null, urgent: false };
export function TaskForm({ open, onClose, ctx, existing, initial }: { open: boolean; onClose: () => void; ctx: TaskCtx; existing?: Task | null; initial?: Partial<NewTask> }) {
  const [form, setForm] = useState<NewTask>(blank);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (open) setForm(existing ? { title: existing.title, note: existing.note, photo: existing.photo, location: existing.location, dueDate: existing.dueDate, managersOnly: existing.managersOnly, assignee: existing.assignee || null, urgent: !!existing.urgent } : { ...blank, ...(initial || {}) }); }, [open, existing?.id]);
  const save = async () => {
    if (!form.title.trim()) return toast({ text: 'מה צריך לעשות?', kind: 'error' });
    setBusy(true);
    try {
      if (existing) await editTask(ctx.actor, existing, form); else await addTask(ctx.actor, form);
      onClose(); toast({ text: existing ? 'המשימה עודכנה' : form.assignee ? `המשימה נוספה ל${firstName(form.assignee.name)}` : 'המשימה נוספה' }, 2500);
    } catch { toast({ text: 'לא הצלחנו לשמור. ננסה שוב כשיש קליטה.', kind: 'error' }); }
    finally { setBusy(false); }
  };
  const quick = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(d); };
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'עריכת משימה' : 'משימה חדשה'}>
      <label className="field"><span>מה צריך לעשות?</span><input data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="למשל: להחליף את הדגל ליד הכניסה" /></label>
      <div className="chips" style={{ marginBottom: 16 }}>
        <button type="button" className={'chip ' + (form.urgent ? 'on bad' : '')} onClick={() => setForm({ ...form, urgent: !form.urgent })}>{form.urgent ? 'דחוף ✓' : 'דחוף'}</button>
        <button type="button" className={'chip ' + (form.dueDate === quick(0) ? 'on' : '')} onClick={() => setForm({ ...form, dueDate: form.dueDate === quick(0) ? '' : quick(0) })}>היום</button>
        <button type="button" className={'chip ' + (form.dueDate === quick(1) ? 'on' : '')} onClick={() => setForm({ ...form, dueDate: form.dueDate === quick(1) ? '' : quick(1) })}>מחר</button>
        <button type="button" className={'chip ' + (form.dueDate === quick(7) ? 'on' : '')} onClick={() => setForm({ ...form, dueDate: form.dueDate === quick(7) ? '' : quick(7) })}>בעוד שבוע</button>
      </div>
      <AssigneePicker value={form.assignee} onChange={(assignee) => setForm({ ...form, assignee })} team={ctx.team || []} me={ctx.actor} />
      <label className="field"><span>הסבר קצר (לא חובה)</span><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="פרטים שיעזרו למי שמבצע: איפה הכלים, מה בדיוק" /></label>
      <PhotoPicker value={form.photo} onChange={(photo) => setForm({ ...form, photo })} label="תמונה (לא חובה)" />
      <LocationPicker value={form.location} onChange={(location) => setForm({ ...form, location })} places={ctx.places} />
      <label className="field"><span>תאריך יעד (לא חובה)</span><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} dir="ltr" /></label>
      {ctx.manager && (
        <div className="toggle"><div>למנהלים בלבד<small>מתנדבים לא יראו את המשימה</small></div><button type="button" role="switch" aria-checked={form.managersOnly} className="switch" aria-label="למנהלים בלבד" onClick={() => setForm({ ...form, managersOnly: !form.managersOnly })} /></div>
      )}
      <div className="sheet-foot"><Button kind="primary" disabled={busy} onClick={save}>{existing ? 'שמירה' : 'הוספה'}</Button><Button kind="quiet" onClick={onClose}>ביטול</Button></div>
    </Sheet>
  );
}

/** One tap from the field: take a photo, name it, done. */
export function QuickPhotoButton({ ctx }: { ctx: TaskCtx }) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState('');
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <button type="button" className="quick-photo" onClick={() => input.current?.click()}><Icon name="camera" />צילום מהשטח</button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setPhoto(await compressPhoto(f)); setOpen(true); } catch (err: any) { toast({ text: err.message, kind: 'error' }); } }} />
      <TaskForm open={open} onClose={() => setOpen(false)} ctx={ctx} initial={{ photo }} />
    </>
  );
}

// ---------- detail ----------
export function TaskDetail({ task, onClose, ctx, onEdit }: { task: Task | null; onClose: () => void; ctx: TaskCtx; onEdit: (t: Task) => void }) {
  const toast = useToast();
  const [doneNote, setDoneNote] = useState('');
  const activity = useActivityFor(task?.id || '', !!task);
  useEffect(() => { setDoneNote(task?.doneNote || ''); }, [task?.id]);
  if (!task) return <Sheet open={false} onClose={onClose}><div /></Sheet>;
  const canEdit = ctx.manager || task.createdBy.uid === ctx.actor.uid;
  const navUrl = task.location ? `https://www.google.com/maps/dir/?api=1&destination=${task.location.lat},${task.location.lng}&travelmode=walking` : '';
  return (
    <Sheet open={!!task} onClose={onClose} title={task.title}>
      {task.urgent && !task.done && <span className="tag bad" style={{ marginBottom: 10, display: 'inline-flex' }}>דחוף</span>}
      {task.photo && <img className="photo-big" src={task.photo} alt="" style={{ marginBottom: 14 }} />}
      <div className="detail-list">
        {task.note && <p className="note">{task.note}</p>}
        {task.assignee && <div className="kv"><Avatar name={task.assignee.name} size={22} /><div>{task.assignee.uid === ctx.actor.uid ? 'המשימה שלי' : `באחריות ${task.assignee.name}`}</div></div>}
        <div className="kv"><Icon name="user" size={18} /><div>{task.createdBy.name} יצר/ה<br /><span>{fmtDate(task.createdAt)} · {fmtTime(task.createdAt)}</span></div></div>
        {task.dueDate && !task.templateId && <div className="kv"><Icon name="clock" size={18} /><div>עד {fmtDate(task.dueDate)}</div></div>}
        {task.templateId && <div className="kv"><Icon name="repeat" size={18} /><div>משימה חוזרת<br /><span>{fmtDate(task.dateKey)}</span></div></div>}
        {task.location && <div className="kv"><Icon name="pin" size={18} /><div>{task.location.placeName || 'מיקום'}<br /><a href={navUrl} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--olive)' }}>ניווט ב־Google Maps ↗</a></div></div>}
        {task.done && task.doneBy && <div className="kv"><Icon name="check" size={18} /><div>בוצע על ידי {task.doneBy.name}<br /><span>{fmtDate(task.doneAt)} · {fmtTime(task.doneAt)}</span></div></div>}
      </div>
      {task.done && (
        <div className="section">
          <div className="section-head"><h2>אחרי הביצוע (לא חובה)</h2></div>
          {task.donePhoto && <img className="photo-big" src={task.donePhoto} alt="" style={{ marginBottom: 10 }} />}
          <PhotoPicker value={task.donePhoto} onChange={(donePhoto) => setTaskDoneDetails(ctx.actor, task, { donePhoto }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }))} label="תמונה של התוצאה" />
          <label className="field"><span>הערה</span><input value={doneNote} onChange={(e) => setDoneNote(e.target.value)} onBlur={() => { if (doneNote !== task.doneNote) setTaskDoneDetails(ctx.actor, task, { doneNote }).catch(() => {}); }} placeholder="למשל: המקדח בארגז הכלים" /></label>
        </div>
      )}
      <Timeline items={activity.items} />
      <div className="sheet-foot">
        <Button kind={task.done ? 'secondary' : 'primary'} onClick={async () => { await setTaskDone(ctx.actor, task, !task.done).catch(() => toast({ text: 'לא נשמר', kind: 'error' })); if (!task.done) onClose(); }}><Icon name="check" />{task.done ? 'החזרה לביצוע' : 'בוצע'}</Button>
        {!task.done && !task.assignee && <Button kind="secondary" onClick={() => editTask(ctx.actor, task, { assignee: ctx.actor }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }))}>אני על זה</Button>}
        {canEdit && !task.templateId && <Button kind="quiet" onClick={() => onEdit(task)}><Icon name="edit" />עריכה</Button>}
        {canEdit && <Button kind="quiet" onClick={async () => { if (!confirm('למחוק את המשימה?')) return; await deleteTask(ctx.actor, task).catch(() => toast({ text: 'לא נמחק', kind: 'error' })); onClose(); }}><Icon name="trash" />מחיקה</Button>}
      </div>
    </Sheet>
  );
}

// ---------- screen ----------
type Filter = 'all' | 'mine' | 'urgent';
export function TasksScreen({ open, recent, ctx, loading }: { open: Task[]; recent: Task[]; ctx: TaskCtx; loading: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const today = todayKey();
  const visible = useMemo(() => open.filter((t) => filter === 'all' || (filter === 'mine' ? t.assignee?.uid === ctx.actor.uid : t.urgent)), [open, filter, ctx.actor.uid]);
  const sections = useMemo(() => {
    const by = (a: Task, b: Task) => Number(b.urgent) - Number(a.urgent) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt.localeCompare(a.createdAt);
    const overdue = visible.filter((t) => t.dueDate && t.dueDate < today).sort(by);
    const todays = visible.filter((t) => t.dueDate === today).sort(by);
    const later = visible.filter((t) => t.dueDate && t.dueDate > today).sort(by);
    const open = visible.filter((t) => !t.dueDate).sort(by);
    return [['באיחור', overdue], ['היום', todays], ['בהמשך', later], ['כשמתפנים', open]] as [string, Task[]][];
  }, [visible, today]);
  const mineCount = open.filter((t) => t.assignee?.uid === ctx.actor.uid).length;
  const urgentCount = open.filter((t) => t.urgent).length;
  const live = selected ? (open.find((t) => t.id === selected.id) || recent.find((t) => t.id === selected.id) || selected) : null;
  return (
    <>
      <header className="topbar"><div><h1>משימות</h1><div className="sub">{open.length ? `${open.length} לביצוע` : 'אין משימות פתוחות'}{recent.length ? ` · ${recent.length} בוצעו ביממה` : ''}</div></div>
        <div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => navigate('/history')} aria-label="היסטוריה"><Icon name="history" /></button></div></header>
      <div className="chips" style={{ marginBottom: 14 }}>
        <button type="button" className={'chip ' + (filter === 'all' ? 'on' : '')} onClick={() => setFilter('all')}>הכל</button>
        <button type="button" className={'chip ' + (filter === 'mine' ? 'on' : '')} onClick={() => setFilter('mine')}>שלי{mineCount ? ` · ${mineCount}` : ''}</button>
        <button type="button" className={'chip ' + (filter === 'urgent' ? 'on bad' : '')} onClick={() => setFilter('urgent')}>דחוף{urgentCount ? ` · ${urgentCount}` : ''}</button>
      </div>
      {loading && !open.length ? <div className="loading">טוען…</div> : !visible.length ? (
        <Empty title={filter === 'mine' ? 'אין משימות עליך' : filter === 'urgent' ? 'אין דחופות' : 'הכל בוצע'} text={filter === 'all' ? 'אין משימות פתוחות כרגע. אפשר להוסיף בכפתור למטה.' : undefined} icon="check" />
      ) : sections.map(([name, tasks]) => tasks.length > 0 && (
        <div className="section" key={name}><div className="section-head"><h2>{name} · {tasks.length}</h2></div><TaskList tasks={tasks} ctx={ctx} onOpen={setSelected} empty={null} /></div>
      ))}
      {recent.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>בוצע ביממה האחרונה</h2><a href="/app/history" onClick={(e) => { e.preventDefault(); navigate('/history'); }}>היסטוריה</a></div>
          <TaskList tasks={recent} ctx={ctx} onOpen={setSelected} empty={null} />
        </div>
      )}
      <button type="button" className="fab" onClick={() => { setEditing(null); setAdding(true); }}><Icon name="plus" />משימה</button>
      <TaskForm open={adding} onClose={() => setAdding(false)} ctx={ctx} existing={editing} />
      <TaskDetail task={adding ? null : live} onClose={() => setSelected(null)} ctx={ctx} onEdit={(t) => { setSelected(null); setEditing(t); setAdding(true); }} />
    </>
  );
}
