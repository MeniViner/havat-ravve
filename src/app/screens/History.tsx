import { useMemo, useState } from 'react';
import type { Task, Actor, Place } from '../types';
import { KIND_LABELS } from '../types';
import { useHistoryTasks } from '../store';
import { useActivityByKind, ACTION_LABELS } from '../activity';
import { TaskList, TaskDetail } from './Tasks';
import { ShoppingHistoryScreen } from './Shopping';
import { Icon, Empty, Segmented, Avatar, fmtDayLong, fmtTime, firstName } from '../ui';
import { back, navigate } from '../router';
import { dateKeyOf } from '../firebase';

type Range = '7' | '30' | '90';
type Tab = 'tasks' | 'shopping' | 'activity';

export function HistoryScreen({ ctx, tab = 'tasks' }: { ctx: { actor: Actor; manager: boolean; places: Place[] }; tab?: Tab }) {
  const setTab = (t: Tab) => navigate('/history' + (t === 'tasks' ? '' : '/' + t), true);
  return (
    <>
      <header className="topbar"><div><h1>היסטוריה</h1><div className="sub">מי עשה מה ומתי. נשמר לתמיד.</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/tasks')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'tasks', label: 'משימות' }, { value: 'shopping', label: 'קניות' }, { value: 'activity', label: 'כל הפעילות' }]} />
      {tab === 'tasks' && <TasksHistory ctx={ctx} />}
      {tab === 'shopping' && <ShoppingHistoryScreen ctx={ctx} />}
      {tab === 'activity' && <ActivityList manager={ctx.manager} />}
    </>
  );
}

function TasksHistory({ ctx }: { ctx: { actor: Actor; manager: boolean; places: Place[] } }) {
  const [range, setRange] = useState<Range>('7');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const from = useMemo(() => new Date(Date.now() - Number(range) * 86400_000).toISOString(), [range]);
  const to = useMemo(() => new Date(Date.now() + 86400_000).toISOString(), [range]);
  const { items, loading } = useHistoryTasks(true, ctx.manager, from, to);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? items.filter((t) => t.title.toLowerCase().includes(s) || t.doneBy?.name.toLowerCase().includes(s) || t.note.toLowerCase().includes(s)) : items; }, [items, q]);
  const groups = useMemo(() => { const m = new Map<string, Task[]>(); for (const t of filtered) { const k = dateKeyOf(new Date(t.doneAt!)); (m.get(k) || m.set(k, []).get(k)!).push(t); } return [...m.entries()]; }, [filtered]);
  const byPerson = useMemo(() => { const m = new Map<string, number>(); for (const t of filtered) if (t.doneBy) m.set(t.doneBy.name, (m.get(t.doneBy.name) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6); }, [filtered]);
  const live = selected ? items.find((t) => t.id === selected.id) || selected : null;
  return (
    <>
      <Segmented value={range} onChange={setRange} options={[{ value: '7', label: 'שבוע' }, { value: '30', label: 'חודש' }, { value: '90', label: '3 חודשים' }]} />
      <label className="field"><span className="sr-only">חיפוש</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי משימה או לפי מי ביצע" /></label>
      {byPerson.length > 0 && <div className="chips" style={{ marginBottom: 6 }}>{byPerson.map(([n, c]) => <button key={n} type="button" className={'chip ' + (q === n ? 'on' : '')} onClick={() => setQ(q === n ? '' : n)}>{n} <b>{c}</b></button>)}</div>}
      <p className="hint" style={{ margin: '6px 0 2px' }}>{filtered.length} משימות בוצעו</p>
      {loading && !items.length ? <div className="loading">טוען…</div> : !groups.length ? <Empty title="אין משימות בתקופה הזו" icon="history" /> : groups.map(([day, tasks]) => (
        <div className="day-group" key={day}><h3>{fmtDayLong(day)} · {tasks.length}</h3><TaskList tasks={tasks} ctx={ctx} onOpen={setSelected} empty={null} /></div>
      ))}
      <TaskDetail task={live} onClose={() => setSelected(null)} ctx={ctx} onEdit={() => setSelected(null)} />
    </>
  );
}

/** Everything that happened, newest first. Staff see team activity; managers see all. */
export function ActivityList({ manager, kind: initial = 'all' }: { manager: boolean; kind?: 'all' | keyof typeof KIND_LABELS }) {
  const [kind, setKind] = useState<'all' | keyof typeof KIND_LABELS>(initial);
  const { items, loading } = useActivityByKind(kind, true, 300);
  const kinds = (manager ? ['all', 'task', 'shopping', 'ticket', 'tab', 'visit', 'donation', 'user', 'event'] : ['all', 'task', 'shopping', 'ticket', 'tab', 'event']) as ('all' | keyof typeof KIND_LABELS)[];
  const groups = useMemo(() => { const m = new Map<string, typeof items>(); for (const a of items) { const k = dateKeyOf(new Date(a.at)); (m.get(k) || m.set(k, []).get(k)!).push(a); } return [...m.entries()]; }, [items]);
  return (
    <>
      <div className="chips" style={{ marginBottom: 12 }}>{kinds.map((k) => <button key={k} type="button" className={'chip ' + (kind === k ? 'on' : '')} onClick={() => setKind(k)}>{k === 'all' ? 'הכל' : KIND_LABELS[k]}</button>)}</div>
      {loading && !items.length ? <div className="loading">טוען…</div> : !groups.length ? <Empty title="עדיין אין פעילות" icon="history" /> : groups.map(([day, rows]) => (
        <div className="day-group" key={day}><h3>{fmtDayLong(day)}</h3><div className="list">{rows.map((a) => (
          <div className="row" key={a.id} style={{ alignItems: 'center' }}><Avatar name={a.by.name} size={32} /><div className="row-main"><div className="row-title" style={{ fontSize: 15 }}><b style={{ fontWeight: 600 }}>{firstName(a.by.name)}</b> · {ACTION_LABELS[a.action] || a.action}{a.text ? ': ' + a.text : ''}</div><div className="row-meta"><span className="tag">{KIND_LABELS[a.kind]}</span><span>{fmtTime(a.at)}</span></div></div></div>
        ))}</div></div>
      ))}
    </>
  );
}
