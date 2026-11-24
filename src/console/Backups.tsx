// גיבויים: the nightly copy of all the data in the storage service (R2) (download it, look inside, put a document back as it was), and the
// recycle bin of what API requests deleted in the last 30 days (Instinct, the console, any key).
// Phone: lists and sheets. Computer: a table and a side column (desk/BackupsDesk.tsx). The work itself: desk/BackupsSpec.tsx.
import { useMemo, useState } from 'react';
import { Button, Card, DetailList, DetailRow, ListCard, Row, SearchField, Sheet, Tag } from '../app/v2/kit';
import { ddmm, hhmm } from '../app/v2/format';
import { ago, FieldName, Section, useLoad } from './shared';
import { collectionName, size, valueText as show } from './labels';
import { source, type Backup, type TrashItem } from './source';
import { useWide } from './desk/route';
import { dayTitle, isLate, isManual, type Notify, useBackupDoc, useBackups, useDownload, useTrashRestore } from './desk/BackupsSpec';
import { BackupsDesk } from './desk/BackupsDesk';

export function BackupsScreen({ notify }: { notify: Notify }) {
  const b = useBackups(notify);
  const wide = useWide();
  return wide ? <BackupsDesk b={b} notify={notify} /> : <BackupsPhone b={b} notify={notify} />;
}
function BackupsPhone({ b, notify }: { b: ReturnType<typeof useBackups>; notify: Notify }) {
  const { list, bin, storage, last, stale, running, runNow } = b;
  const [open, setOpen] = useState<Backup | null>(null);
  const [binItem, setBinItem] = useState<TrashItem | null>(null);
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">גיבויים</h1>
          <p className="c-sub">כל לילה אחרי 03:00 השרת שומר עותק של כל הנתונים בשירות האחסון, בחינם. נשמרים 30 הימים האחרונים, והראשון של כל חודש לשנה.</p>
        </div>
        <Button variant="neutral" onClick={runNow} disabled={!!running}>{running || 'גיבוי עכשיו'}</Button>
      </div>
      {list.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את הגיבויים. {list.error}</Card>}
      {list.loading && !list.data && <p className="c-soft">טוען…</p>}
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
        {bin.loading && !bin.data && <p className="c-soft">טוען…</p>}
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
        {list.data && !list.data.items.length && <Card pad="md" className="c-soft">עוד אין גיבויים שמורים. הראשון יישמר הלילה אחרי 03:00, או עכשיו בכפתור "גיבוי עכשיו".</Card>}
        {!!list.data?.items.length && (
          <ListCard>
            {list.data.items.map((b) => (
              <Row key={b.date} title={dayTitle(b.date)} meta={<><span className="k-num">{b.docs.toLocaleString('he-IL')}</span> רשומות · <span className="k-ltr">{size(b.bytes)}</span>{isManual(b) ? ` · ידני, ${b.by}` : isLate(b) ? ' · הושלם באיחור' : ''}</>} chevron onClick={() => setOpen(b)} />
            ))}
          </ListCard>
        )}
      </Section>

      {storage && (
        <Section title="אחסון">
          <Card pad="lg"><DetailList><DetailRow term="גיבויים וקבצים"><span className="k-ltr">{size(storage.used)}</span> מתוך <span className="k-ltr">{size(storage.limit)}</span></DetailRow></DetailList></Card>
        </Section>
      )}

      {open && <BackupSheet b={open} onClose={() => setOpen(null)} notify={notify} />}
      {binItem && <TrashSheet t={binItem} onClose={() => setBinItem(null)} notify={notify} onDone={() => { setBinItem(null); bin.reload(); }} />}
    </>
  );
}

function TrashSheet({ t, onClose, notify, onDone }: { t: TrashItem; onClose: () => void; notify: Notify; onDone: () => void }) {
  const { busy, restore } = useTrashRestore(t, notify, onDone);
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
function BackupSheet({ b, onClose, notify }: { b: Backup; onClose: () => void; notify: Notify }) {
  const [view, setView] = useState<View>({ kind: 'info' });
  const { downloading: busy, download } = useDownload(notify);
  const cols = useMemo(() => Object.entries(b.collections).sort((x, y) => y[1] - x[1]), [b]);
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
          <Button variant="neutral" icon="download" block onClick={() => download(b.date)} disabled={!!busy}>{busy ? 'מוריד…' : 'הורדת הקובץ'}</Button>
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

function DocView({ date, path, notify }: { date: string; path: string; notify: Notify }) {
  const { doc, d, keys, changed, state, ask, can, confirm, setConfirm, busy, restore } = useBackupDoc(date, path, notify);
  if (doc.loading && !d) return <p className="c-soft">טוען…</p>;
  if (doc.error) return <p className="c-err">{doc.error}</p>;
  if (!d) return null;
  return (
    <div className="c-form">
      <p className="c-sub"><span className="k-ltr" dir="ltr">{path}</span></p>
      {state && <div><Tag tone={state.tone === 'red' ? 'urgent' : state.tone === 'green' ? 'paid' : 'warm'}>{state.text}</Tag></div>}
      <div className="c-compare" role="table" aria-label="השוואה בין הגיבוי להיום">
        <div className="c-compare__row c-compare__head" role="row"><span role="columnheader">שדה</span><span role="columnheader">בגיבוי</span><span role="columnheader">היום</span></div>
        {keys.map((k) => (
          <div key={k} role="row" className={`c-compare__row${changed.includes(k) ? ' c-compare__row--diff' : ''}`}>
            <span role="cell"><FieldName k={k} /></span><span role="cell">{show(d.then[k])}</span><span role="cell">{d.now ? show(d.now[k]) : '—'}</span>
          </div>
        ))}
      </div>
      {can && !confirm && <Button size="lg" block onClick={() => setConfirm(true)}>שחזור למצב בגיבוי</Button>}
      {confirm && (
        <>
          <p className="c-warn">{ask}</p>
          <Button size="lg" block disabled={busy} onClick={restore}>{busy ? 'משחזר…' : 'כן, לשחזר'}</Button>
          <Button variant="quiet" block onClick={() => setConfirm(false)}>חזרה</Button>
        </>
      )}
    </div>
  );
}
