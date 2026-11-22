// The assistant log ("יומן אינסטינקט"), owners only: every request an API key made (api_log, written by the API Worker),
// as "<key name> <verb>: <operation>", grouped by day, with a key filter, reads / actions / failures, search, and a sheet
// with the full request (what was sent, what came back, which records it touched).
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { Avatar, Button, Chip, ChipRow, DetailList, DetailRow, EmptyState, PageTitle, SearchField, Sheet, Tag, TopBar } from '../../kit';
import { dayName, ddmm, daysFromToday, hhmm, keyOf } from '../../format';
import { useList } from '../../../db';
import { lnk, ExcelButton, Loading } from './shared';

export type ApiLogEntry = {
  id: string; at: string; credential: string; keyLabel: string;
  actor: { id: string; role: string; uid: string; name: string };
  kind: 'read' | 'write'; op: string; opHe: string; verb: string;
  method: string; path: string; query: string; body: string; result: string; count: number | null;
  refs: { col: string; id: string }[]; status: number; ok: boolean; code: string; message: string;
  replayed: boolean; idempotencyKey: string; ms: number;
};

type Show = 'actions' | 'all' | 'reads' | 'failed';
const SHOW: { v: Show; l: string }[] = [{ v: 'actions', l: 'פעולות' }, { v: 'all', l: 'הכל' }, { v: 'reads', l: 'קריאות' }, { v: 'failed', l: 'נכשלו' }];
const PAGE = 50;
const dayLabel = (key: string) => { const d = daysFromToday(key); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(key)} ${ddmm(key)}`; };
const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

export function InstinctLogScreen({ ctx }: ScreenProps) {
  const owner = ctx.role === 'owner';
  const { items, loading } = useList<ApiLogEntry>('api_log', { orderBy: [['at', 'desc']], limit: 1500 }, owner);
  const [show, setShow] = useState<Show>('actions');
  const [key, setKey] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<ApiLogEntry | null>(null);
  const keys = useMemo(() => [...new Map(items.map((e) => [e.credential, e.keyLabel])).entries()], [items]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items
      .filter((e) => (show === 'actions' ? e.kind === 'write' : show === 'reads' ? e.kind === 'read' : show === 'failed' ? !e.ok : true))
      .filter((e) => !key || e.credential === key)
      .filter((e) => !t || `${e.keyLabel} ${e.verb} ${e.opHe} ${e.op} ${e.body} ${e.code}`.toLowerCase().includes(t));
  }, [items, show, key, q]);
  const days = useMemo(() => {
    const m = new Map<string, ApiLogEntry[]>();
    for (const e of rows.slice(0, shown)) { const k = keyOf(e.at); m.set(k, [...(m.get(k) || []), e]); }
    return [...m.entries()];
  }, [rows, shown]);
  const back = { label: 'ניהול', path: '/manage' };
  if (!owner) return (
    <AppScreen variant="detail">
      <TopBar back={{ label: back.label, ...lnk(back.path) }} />
      <EmptyState variant="fill" icon="blocked" title="רק לבעלים" text="יומן אינסטינקט פתוח רק לבעלי החווה." />
    </AppScreen>
  );
  if (loading && !items.length) return <Loading back={back} />;
  const excel = (
    <ExcelButton filename="יומן אינסטינקט.csv" headers={['מתי', 'מפתח', 'פעולה', 'מה', 'שם הפעולה', 'הצליח', 'שגיאה', 'מה נשלח']}
      rows={() => rows.map((e) => [e.at, e.keyLabel, e.verb, e.opHe, e.op, e.ok ? 'כן' : 'לא', e.code, e.body])} />
  );
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: back.label, ...lnk(back.path) }} end={excel} />
      <PageTitle>יומן אינסטינקט</PageTitle>
      <SearchField label="חיפוש: פעולה, מפתח או ערך" placeholder="חיפוש: פעולה, מפתח או ערך" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
      <ChipRow label="מה להציג">
        {SHOW.map((f) => <Chip key={f.v} selected={show === f.v} onClick={() => { setShow(f.v); setShown(PAGE); }}>{f.l}</Chip>)}
      </ChipRow>
      {keys.length > 1 && (
        <ChipRow label="מפתח">
          <Chip selected={!key} onClick={() => { setKey(''); setShown(PAGE); }}>כל המפתחות</Chip>
          {keys.map(([id, label]) => <Chip key={id} selected={key === id} onClick={() => { setKey(id); setShown(PAGE); }}>{label}</Chip>)}
        </ChipRow>
      )}
      {days.map(([day, list]) => (
        <section key={day} className="k-card manage-feed" aria-label={dayLabel(day)}>
          <h2 className="manage-feed__day">{dayLabel(day)}</h2>
          <ul className="k-list">
            {list.map((e, i) => (
              <li key={e.id} className="manage-feed__item">
                <span className="manage-feed__time" dir="ltr">{hhmm(e.at)}</span>
                <span className="manage-feed__rail">
                  <Avatar name={e.actor.name || e.keyLabel} />
                  <span className={i === list.length - 1 ? 'manage-feed__line manage-feed__line--end' : 'manage-feed__line'} />
                </span>
                <button type="button" className="manage-feed__body instinct-log__row" onClick={() => setOpen(e)} aria-label={`${e.keyLabel} ${e.verb}: ${e.opHe || e.op}. פרטים`}>
                  <span className="manage-feed__title">{e.keyLabel} {e.ok ? e.verb : `ניסה ו${e.verb === 'קרא' ? 'לא הצליח לקרוא' : 'נכשל'}`}</span>
                  <span className="manage-feed__meta">{e.opHe || e.op}{e.kind === 'read' && e.count !== null ? ` · ${e.count} רשומות` : ''}</span>
                  {(!e.ok || e.replayed) && <span className="instinct-log__tags">{!e.ok && <Tag tone="urgent">{e.code || 'נכשל'}</Tag>}{e.replayed && <Tag>חזרה על בקשה</Tag>}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {rows.length > shown && <Button variant="outline" className="manage-more" onClick={() => setShown((n) => n + PAGE)}>עוד</Button>}
      {!rows.length && <EmptyState variant="fill" icon="search" title={q ? 'לא נמצא' : 'אין עדיין רישומים'} text={q ? 'נסו מילה אחרת או סינון אחר.' : 'כל מה שאינסטינקט עושה דרך ה-API נרשם כאן, עם שם המפתח.'} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.keyLabel} ${open.verb}` : ''}>
        {open && (
          <div className="instinct-log__sheet">
            <DetailList>
              <DetailRow term="פעולה">{open.opHe || open.op}</DetailRow>
              <DetailRow term="שם בקטלוג"><span dir="ltr">{open.op}</span></DetailRow>
              <DetailRow term="מתי">{`${ddmm(keyOf(open.at))} ${hhmm(open.at)}`}</DetailRow>
              <DetailRow term="מפתח">{open.keyLabel}</DetailRow>
              <DetailRow term="מזהה מפתח"><span dir="ltr">{open.credential}</span></DetailRow>
              <DetailRow term="פועל בשם">{open.actor.name || open.actor.id}</DetailRow>
              <DetailRow term="תוצאה">{open.ok ? `הצליח (${open.status})` : <>{`נכשל: ${open.message.split(': ')[0]}`}<br /><span dir="ltr">{`${open.status} ${open.code} · ${open.message.split(': ').slice(1).join(': ')}`}</span></>}</DetailRow>
              {open.refs.length > 0 && <DetailRow term="רשומות"><span dir="ltr">{open.refs.map((r) => `${r.col}/${r.id}`).join('\n')}</span></DetailRow>}
              <DetailRow term="מזהה בקשה"><span dir="ltr">{open.id}</span></DetailRow>
            </DetailList>
            {open.query && <><h3 className="instinct-log__h">פרמטרים</h3><pre className="instinct-log__pre" dir="ltr">{decodeURIComponent(open.query)}</pre></>}
            {open.body && open.body !== '{}' && <><h3 className="instinct-log__h">מה נשלח</h3><pre className="instinct-log__pre" dir="ltr">{pretty(open.body)}</pre></>}
            {open.result && <><h3 className="instinct-log__h">מה חזר</h3><pre className="instinct-log__pre" dir="ltr">{pretty(open.result)}</pre></>}
          </div>
        )}
      </Sheet>
    </AppScreen>
  );
}
