// Q20 the assistant log ("יומן אינסטינקט"), owners only: every request an API key made (api_log, written by the API Worker),
// in Hebrew sentences grouped by day and by whom the key acts for ("היום · בשם בני"), the subject on the meta line, and a
// failure tagged "לא הצליח" with a plain-Hebrew reason (rule 12: never an operation key or an error code on screen).
// Tapping a row opens the record itself; when there is none (a read, a delete), a short Hebrew summary. The raw fields
// (operation, code, what was sent and what came back) stay in the table view and the export behind ⋯.
// Search and the key filter are not pictured on Q20; they stay, the key filter as a Q16 dropdown (tidy-plan rows 127, 128).
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go } from '../../core';
import { Button, Chip, ChipRow, DetailList, DetailRow, Dropdown, EmptyState, Icon, MoreMenu, PageTitle, SearchField, Sheet, Tag, TopBar } from '../../kit';
import { useTableView } from '../../patterns';
import { dayName, ddmm, daysFromToday, firstName, hhmm, keyOf } from '../../format';
import { useList } from '../../../db';
import { instinctLine, instinctTarget, type ApiLogEntry } from '../../data/manage';
import { lnk, Loading } from './shared';

export type { ApiLogEntry };

type Show = 'actions' | 'failed' | 'reads' | 'all';
const PAGE = 50;
const dayLabel = (key: string) => { const d = daysFromToday(key); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(key)} ${ddmm(key)}`; };

export function InstinctLogScreen({ ctx }: ScreenProps) {
  const owner = ctx.role === 'owner';
  const { items, loading } = useList<ApiLogEntry>('api_log', { orderBy: [['at', 'desc']], limit: 1500 }, owner);
  const [show, setShow] = useState<Show>('actions');
  const [key, setKey] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<ApiLogEntry | null>(null);
  const keys = useMemo(() => [...new Map(items.map((e) => [e.credential, e.keyLabel])).entries()], [items]);
  const lines = useMemo(() => new Map(items.map((e) => [e.id, instinctLine(e)])), [items]);
  const byKey = items.filter((e) => !key || e.credential === key);
  const writes = byKey.filter((e) => e.kind === 'write' && e.ok).length, failed = byKey.filter((e) => !e.ok).length;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items
      .filter((e) => (show === 'actions' ? e.kind === 'write' && e.ok : show === 'reads' ? e.kind === 'read' && e.ok : show === 'failed' ? !e.ok : true))
      .filter((e) => !key || e.credential === key)
      .filter((e) => { if (!t) return true; const l = lines.get(e.id)!; return `${e.keyLabel} ${e.actor.name} ${l.title} ${l.meta} ${e.opHe}`.toLowerCase().includes(t); });
  }, [items, show, key, q, lines]);
  // one card per day and per person the key acts for
  const groups = useMemo(() => {
    const m = new Map<string, { day: string; who: string; list: ApiLogEntry[] }>();
    for (const e of rows.slice(0, shown)) {
      const day = keyOf(e.at), who = firstName(e.actor.name || '');
      const k = `${day}|${who}`;
      if (!m.has(k)) m.set(k, { day, who, list: [] });
      m.get(k)!.list.push(e);
    }
    return [...m.values()];
  }, [rows, shown]);
  const table = useTableView({
    title: 'יומן אינסטינקט', filename: 'יומן אינסטינקט.csv',
    headers: ['מתי', 'מפתח', 'בשם', 'מה קרה', 'פרטים', 'שם הפעולה', 'הצליח', 'קוד', 'הודעה', 'מה נשלח', 'מה חזר', 'רשומות', 'מזהה בקשה'],
    rows: () => rows.map((e) => { const l = lines.get(e.id)!; return [e.at, e.keyLabel, e.actor.name, l.title, l.meta, e.op, e.ok ? 'כן' : 'לא', e.code, e.message, e.body, e.result, e.refs.map((r) => `${r.col}/${r.id}`).join(' '), e.id]; }),
  });
  const back = { label: 'ניהול', path: '/manage' };
  if (!owner) return (
    <AppScreen variant="detail">
      <TopBar back={{ label: back.label, ...lnk(back.path) }} />
      <EmptyState variant="fill" icon="blocked" title="רק לבעלים" text="יומן אינסטינקט פתוח רק לבעלי החווה." />
    </AppScreen>
  );
  if (table.active) return table.screen;
  if (loading && !items.length) return <Loading back={back} />;
  const pick = (e: ApiLogEntry) => { const to = instinctTarget(e); if (to) go(to); else setOpen(e); };
  const chip = (v: Show, l: string, n?: number) => <Chip key={v} selected={show === v} onClick={() => { setShow(v); setShown(PAGE); }}>{n ? `${l} · ${n}` : l}</Chip>;
  const sel = open ? lines.get(open.id)! : null;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: back.label, ...lnk(back.path) }} end={<MoreMenu title="יומן אינסטינקט" items={table.items} />} />
      <div className="k-titleblock">
        <PageTitle>יומן אינסטינקט</PageTitle>
        <span className="k-titleblock__sub">מה העוזר האישי עשה בשמך באפליקציה</span>
      </div>
      <ChipRow label="מה להציג">
        {chip('actions', 'שינויים', writes)}
        {chip('failed', 'לא הצליחו', failed)}
        {chip('reads', 'קריאות')}
        {chip('all', 'הכל')}
      </ChipRow>
      <SearchField label="חיפוש ביומן" placeholder="חיפוש ביומן" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
      {keys.length > 1 && (
        <Dropdown label="מפתח" value={key} onChange={(v) => { setKey(v); setShown(PAGE); }}
          options={[{ value: '', label: 'כל המפתחות' }, ...keys.map(([id, label]) => ({ value: id, label }))]} />
      )}
      {groups.map((g) => (
        <section key={`${g.day}|${g.who}`} className="k-card manage-feed" aria-label={dayLabel(g.day)}>
          <h2 className="manage-feed__day">{dayLabel(g.day)}{g.who ? ` · בשם ${g.who}` : ''}</h2>
          <ul className="k-list">
            {g.list.map((e) => {
              const l = lines.get(e.id)!;
              return (
                <li key={e.id} className="manage-feed__item manage-feed__item--hit">
                  <button type="button" className="manage-feed__hit" onClick={() => pick(e)}>
                    <span className="manage-feed__time" dir="ltr">{hhmm(e.at)}</span>
                    <span className="instinct-log__icon" aria-hidden="true"><Icon name="robot" size={20} /></span>
                    <span className="manage-feed__body">
                      <span className="manage-feed__title">{l.title}{l.failed && <Tag tone="urgent">לא הצליח</Tag>}</span>
                      {l.meta && <span className="manage-feed__meta">{l.meta}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {rows.length > shown && <Button variant="outline" className="manage-more" onClick={() => setShown((n) => n + PAGE)}>עוד</Button>}
      {!rows.length && <EmptyState variant="fill" icon="search" title={q ? 'לא נמצא' : 'אין עדיין רישומים'} text={q ? 'נסו מילה אחרת או סינון אחר.' : 'כל מה שאינסטינקט עושה דרך ה-API נרשם כאן, עם שם המפתח.'} />}
      {rows.length > 0 && <p className="k-note">לחיצה על שורה פותחת את הדבר עצמו. רק בעלים רואים את היומן.</p>}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={sel?.title || ''}>
        {open && sel && (
          <DetailList>
            {sel.meta && <DetailRow term={sel.failed ? 'למה' : 'על מה'}>{sel.meta}</DetailRow>}
            <DetailRow term="מתי">{`${dayLabel(keyOf(open.at))} ${hhmm(open.at)}`}</DetailRow>
            <DetailRow term="מפתח">{open.keyLabel}</DetailRow>
            <DetailRow term="בשם">{open.actor.name || '—'}</DetailRow>
            <DetailRow term="תוצאה">{open.ok ? 'הצליח' : <Tag tone="urgent">לא הצליח</Tag>}</DetailRow>
            {open.kind === 'write' && open.refs.length > 0 && <DetailRow term="רשומות">{open.refs.length === 1 ? 'רשומה אחת' : `${open.refs.length} רשומות`}</DetailRow>}
          </DetailList>
        )}
      </Sheet>
    </AppScreen>
  );
}
