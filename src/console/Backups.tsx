// גיבויים: the nightly copy of all the data in R2 (download it, look inside, put a document back as it was), and the
// recycle bin of what API requests deleted in the last 30 days (Instinct, the console, any key).
import { useMemo, useState } from 'react';
import { Button, Card, DetailList, DetailRow, ListCard, Row, SearchField, Sheet, Tag } from '../app/v2/kit';
import { ddmm, dayName, hhmm, daysFromToday } from '../app/v2/format';
import { ago, Section, useLoad } from './shared';
import { collectionName, size } from './labels';
import { errorText, source, type Backup, type BackupDoc, type TrashItem } from './source';

const dayTitle = (date: string) => { const d = daysFromToday(date); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(date)} ${ddmm(date)}`; };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** A stored value as a person reads it: dates as dates, a person as their name, lists joined. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (typeof v === 'string') return ISO.test(v) ? `${ddmm(v)}.${v.slice(2, 4)} ${hhmm(v)}` : v;
  if (typeof v === 'number') return v.toLocaleString('he-IL');
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '—';
  if (typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.name === 'string') return o.name; return JSON.stringify(v); }
  return String(v);
}

export function BackupsScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const list = useLoad(() => source.backups());
  const bin = useLoad(() => source.trash());
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<Backup | null>(null);
  const [binItem, setBinItem] = useState<TrashItem | null>(null);
  const last = list.data?.items[0];
  const stale = !last || Date.now() - Date.parse(last.finishedAt) > 36 * 3600_000;
  const runNow = async () => {
    setRunning('מתחיל…');
    try {
      for (let i = 0; i < 60; i++) {
        const r = await source.runBackup();
        if (r.done) { notify(`הגיבוי נשמר: ${r.docs.toLocaleString('he-IL')} רשומות`); break; }
        setRunning(`נשמרו ${r.docs.toLocaleString('he-IL')} רשומות…`);
      }
      list.reload();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setRunning(null); }
  };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">גיבויים</h1>
          <p className="c-sub">כל לילה אחרי 03:00 השרת שומר עותק של כל הנתונים ב־R2, בחינם. נשמרים 30 הימים האחרונים, והראשון של כל חודש לשנה.</p>
        </div>
        <Button variant="neutral" onClick={runNow} disabled={!!running}>{running || 'גיבוי עכשיו'}</Button>
      </div>
      {list.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את הגיבויים. {list.error}</Card>}
      {list.data && (
        <Card pad="lg" className="c-health">
          <span className={`k-dot ${stale ? '' : 'k-dot--green'}`} aria-hidden="true" />
          <div className="c-health__body">
            <b>{last ? `הגיבוי האחרון: ${dayTitle(last.date)} ${hhmm(last.finishedAt)}` : 'עוד אין גיבוי'}</b>
            <span className="c-soft">
              {last ? <><span className="k-num">{last.docs.toLocaleString('he-IL')}</span> רשומות · <span className="k-ltr">{size(last.bytes)}</span>{stale && ' · לא היה גיבוי ביממה וחצי האחרונות'}</> : 'הגיבוי הראשון יירשם הלילה, או עכשיו בכפתור.'}
              {list.data.running && <> · גיבוי בתהליך ({list.data.running.docs} רשומות עד עכשיו)</>}
            </span>
          </div>
        </Card>
      )}

      <Section title={`סל המחזור${bin.data ? ` · ${bin.data.length}` : ''}`}>
        {bin.error && <Card pad="md" className="c-error">{bin.error}</Card>}
        {bin.data && !bin.data.length && <Card pad="md" className="c-soft">סל המחזור ריק. מה שנמחק דרך אינסטינקט או הקונסולה נשמר כאן 30 יום.</Card>}
        {!!bin.data?.length && (
          <ListCard>
            {bin.data.slice(0, 100).map((t) => (
              <Row key={t.key} title={t.title || t.path} meta={<>{collectionName(t.collection)} · {t.by} · {ago(t.deletedAt)}</>} chevron onClick={() => setBinItem(t)} />
            ))}
          </ListCard>
        )}
        <p className="c-note">מחיקות מתוך האפליקציה עצמה לא נכנסות לסל. אותן משחזרים מהגיבוי של הלילה.</p>
      </Section>

      <Section title={`גיבויים שמורים${list.data ? ` · ${list.data.items.length}` : ''}`}>
        {!!list.data?.items.length && (
          <ListCard>
            {list.data.items.map((b) => (
              <Row key={b.date} title={dayTitle(b.date)} meta={<><span className="k-num">{b.docs.toLocaleString('he-IL')}</span> רשומות · <span className="k-ltr">{size(b.bytes)}</span>{b.by !== 'cron' && ` · ידני, ${b.by}`}</>} chevron onClick={() => setOpen(b)} />
            ))}
          </ListCard>
        )}
      </Section>

      {open && <BackupSheet b={open} onClose={() => setOpen(null)} notify={notify} />}
      {binItem && <TrashSheet t={binItem} onClose={() => setBinItem(null)} notify={notify} onDone={() => { setBinItem(null); bin.reload(); }} />}
    </>
  );
}

function TrashSheet({ t, onClose, notify, onDone }: { t: TrashItem; onClose: () => void; notify: (t: string, tone?: 'info' | 'alert') => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const r = await source.restoreTrash([t.key]);
      if (r.restored.length) notify('שוחזר');
      else if (r.exists.length) notify('לא שוחזר: בינתיים נוצרה רשומה חדשה באותו מקום', 'alert');
      else notify('כבר לא נמצא בסל', 'alert');
      onDone();
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={t.title || t.path}>
      <div className="c-form">
        <DetailList>
          <DetailRow term="מה זה">{collectionName(t.collection)}</DetailRow>
          <DetailRow term="מי מחק">{t.by}{t.who && t.who !== t.by ? ` (${t.who})` : ''}</DetailRow>
          <DetailRow term="מתי">{ago(t.deletedAt)}</DetailRow>
          <DetailRow term="נתיב"><span className="k-ltr" dir="ltr">{t.path}</span></DetailRow>
        </DetailList>
        <p className="c-note">השחזור מחזיר את הרשומה בדיוק כמו שהייתה לפני המחיקה. אם בינתיים נוצרה רשומה חדשה באותו מקום, היא לא נדרסת.</p>
        <Button size="lg" block disabled={busy} onClick={restore}>{busy ? 'משחזר…' : 'שחזור'}</Button>
      </div>
    </Sheet>
  );
}

type View = { kind: 'info' } | { kind: 'col'; col: string } | { kind: 'doc'; col: string; path: string };
function BackupSheet({ b, onClose, notify }: { b: Backup; onClose: () => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [view, setView] = useState<View>({ kind: 'info' });
  const [busy, setBusy] = useState(false);
  const cols = useMemo(() => Object.entries(b.collections).sort((x, y) => y[1] - x[1]), [b]);
  const download = async () => {
    if (source.demo) return notify('ההורדה עובדת בחשבון האמיתי');
    setBusy(true);
    try { await source.downloadBackup(b.date); } catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(false); }
  };
  const title = view.kind === 'info' ? `גיבוי ${dayTitle(b.date)}` : view.kind === 'col' ? collectionName(view.col) : 'רשומה מהגיבוי';
  return (
    <Sheet open onClose={onClose} title={title} aside={view.kind !== 'info' ? <Button variant="link" onClick={() => setView(view.kind === 'doc' ? { kind: 'col', col: view.col } : { kind: 'info' })}>חזרה</Button> : undefined}>
      {view.kind === 'info' && (
        <div className="c-form">
          <DetailList>
            <DetailRow term="נשמר">{ddmm(b.date)} · <span className="k-ltr">{hhmm(b.finishedAt)}</span></DetailRow>
            <DetailRow term="רשומות"><span className="k-num">{b.docs.toLocaleString('he-IL')}</span></DetailRow>
            <DetailRow term="גודל"><span className="k-ltr">{size(b.bytes)}</span></DetailRow>
          </DetailList>
          <Button variant="neutral" icon="download" block onClick={download} disabled={busy}>{busy ? 'מוריד…' : 'הורדת הקובץ'}</Button>
          <p className="c-section__title">מה יש בגיבוי</p>
          <ListCard>
            {cols.map(([c, n]) => <Row key={c} title={collectionName(c)} value={<span className="k-num">{n}</span>} chevron onClick={() => setView({ kind: 'col', col: c })} />)}
          </ListCard>
        </div>
      )}
      {view.kind === 'col' && <CollectionView date={b.date} col={view.col} onPick={(path) => setView({ kind: 'doc', col: view.col, path })} />}
      {view.kind === 'doc' && <DocView date={b.date} path={view.path} notify={notify} />}
    </Sheet>
  );
}

function CollectionView({ date, col, onPick }: { date: string; col: string; onPick: (path: string) => void }) {
  const docs = useLoad(() => source.backupDocs(date, col), [date, col]);
  const [q, setQ] = useState('');
  const rows = (docs.data?.items || []).filter((d) => !q.trim() || `${d.title} ${d.path}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="c-form">
      <SearchField label="חיפוש בגיבוי" placeholder="שם או מזהה" value={q} onChange={(e) => setQ(e.target.value)} active={!!q} />
      {docs.loading && <p className="c-soft">טוען…</p>}
      {docs.error && <p className="c-err">{docs.error}</p>}
      {!!rows.length && <ListCard>{rows.slice(0, 200).map((d) => <Row key={d.path} title={d.title || d.path.split('/').pop()} meta={<span className="k-ltr" dir="ltr">{d.path}</span>} chevron onClick={() => onPick(d.path)} />)}</ListCard>}
      {docs.data && !rows.length && <p className="c-soft">אין רשומות שמתאימות.</p>}
    </div>
  );
}

function DocView({ date, path, notify }: { date: string; path: string; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const doc = useLoad(() => source.backupDoc(date, path), [date, path]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const d: BackupDoc | null = doc.data;
  const keys = d ? [...new Set([...Object.keys(d.then), ...Object.keys(d.now || {})])].sort() : [];
  const changed = d ? keys.filter((k) => show(d.then[k]) !== show(d.now?.[k])) : [];
  const restore = async () => {
    setBusy(true);
    try { await source.restoreBackup(date, [path]); notify('הרשומה הוחזרה למצב שלה בגיבוי'); setConfirm(false); doc.reload(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  if (doc.loading && !d) return <p className="c-soft">טוען…</p>;
  if (doc.error) return <p className="c-err">{doc.error}</p>;
  if (!d) return null;
  return (
    <div className="c-form">
      <p className="c-sub"><span className="k-ltr" dir="ltr">{path}</span></p>
      <div>{!d.now ? <Tag tone="urgent">נמחקה מאז</Tag> : !changed.length ? <Tag tone="paid">זהה למצב היום</Tag> : <Tag tone="warm">{changed.length} שדות השתנו מאז</Tag>}</div>
      <div className="c-compare" role="table" aria-label="השוואה בין הגיבוי להיום">
        <div className="c-compare__row c-compare__head" role="row"><span role="columnheader">שדה</span><span role="columnheader">בגיבוי</span><span role="columnheader">היום</span></div>
        {keys.map((k) => (
          <div key={k} role="row" className={`c-compare__row${changed.includes(k) ? ' c-compare__row--diff' : ''}`}>
            <span role="cell" className="k-ltr" dir="ltr">{k}</span><span role="cell">{show(d.then[k])}</span><span role="cell">{d.now ? show(d.now[k]) : '—'}</span>
          </div>
        ))}
      </div>
      {(!d.now || changed.length > 0) && !confirm && <Button size="lg" block onClick={() => setConfirm(true)}>שחזור למצב בגיבוי</Button>}
      {confirm && (
        <>
          <p className="c-warn">{d.now ? 'הרשומה תוחלף במה שהיה בגיבוי, ושינויים שנעשו בה מאז יימחקו.' : 'הרשומה תחזור בדיוק כמו שהייתה בגיבוי.'}</p>
          <Button size="lg" block disabled={busy} onClick={restore}>{busy ? 'משחזר…' : 'כן, לשחזר'}</Button>
          <Button variant="quiet" block onClick={() => setConfirm(false)}>ביטול</Button>
        </>
      )}
    </div>
  );
}
