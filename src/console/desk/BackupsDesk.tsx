// גיבויים on a computer (K10): the backups as a table, and beside it the last one, the recycle bin and the storage.
// "שחזור מכאן" opens the backup in a window: what is in it, one record beside today, and putting it back.
import { useState } from 'react';
import { ConfirmSheet } from '../../app/v2/kit';
import { ddmm, hhmm } from '../../app/v2/format';
import { ago, fmt, useLoad } from '../shared';
import { collectionName, fieldLabel, size } from '../labels';
import { source, type Backup, type TrashItem } from '../source';
import { Act, Btn, Col, Cols, type Column, DCard, Dialog, DTag, Fact, Failed, Ltr, Meter, Mono, Notice, Page, Search, Skeleton, Small, SubTitle, Summary, Table, TableCard } from './desk';
import { useSelected } from './route';
import { cut, showValue } from './DataSpec';
import { binnedBy, binnedWhen, dayTitle, isLate, isManual, kindName, type Notify, useBackupDoc, useBackups, useDownload, useTrashRestore } from './BackupsSpec';

export function BackupsDesk({ b, notify }: { b: ReturnType<typeof useBackups>; notify: Notify }) {
  const { list, bin, storage, last, stale, running, runNow } = b;
  const { downloading, download } = useDownload(notify);
  const [open, setOpen] = useState<Backup | null>(null);
  const [binItem, setBinItem] = useState<TrashItem | null>(null);
  const items = list.data?.items || null;
  const [date, select] = useSelected('backups', (items || []).map((x) => x.date));
  const tag = (x: Backup) => (isManual(x) ? <DTag>ידני</DTag> : isLate(x) ? <span title={`הסתיים ב־${hhmm(x.finishedAt)}`}><DTag tone="amber">הושלם באיחור</DTag></span> : <DTag tone="green">תקין</DTag>);
  const columns: Column<Backup>[] = [
    // in a narrow window the three columns after it go under the name (data.css)
    { key: 'date', head: 'גיבוי', strong: true, cell: (x) => <>{dayTitle(x.date)}{dayTitle(x.date) === 'היום' && ` ${hhmm(x.finishedAt)}`}{isManual(x) && <span className="dd-by"> · {x.by}</span>}<span className="dd-under"><span>{fmt(x.docs)} רשומות · <Ltr>{size(x.bytes)}</Ltr></span>{tag(x)}</span></> },
    { key: 'docs', head: 'רשומות', width: 114, align: 'end', cell: (x) => fmt(x.docs) },
    { key: 'bytes', head: 'גודל', width: 114, align: 'end', cell: (x) => <Ltr>{size(x.bytes)}</Ltr> },
    { key: 'state', head: 'מצב', width: 134, cell: tag },
    { key: 'go', head: '', width: 214, align: 'end', cell: (x) => <span className="dd-acts"><Act onClick={() => download(x.date)} disabled={!!downloading}>{downloading === x.date ? 'מוריד…' : 'הורדה'}</Act><Act onClick={() => { select(x.date); setOpen(x); }}>שחזור מכאן</Act></span> },
  ];
  const run = list.data?.running;
  return (
    <Page group="נתונים" title="גיבויים" sub="כל לילה אחרי 03:00 השרת שומר עותק של כל הנתונים" actions={<Btn kind="action" icon="box" onClick={runNow} disabled={!!running}>{running || 'גיבוי עכשיו'}</Btn>}>
      <Cols>
        <TableCard style={{ containerType: 'inline-size' }}>
          <Table label="גיבויים שמורים" columns={columns} rows={items} rowKey={(x) => x.date} selected={date} onSelect={select} onEnter={setOpen} loading={list.loading}
            error={list.error ? `לא הצלחנו לקרוא את הגיבויים. ${list.error}` : null} retry={list.reload} empty={'עוד אין גיבויים שמורים. הראשון יישמר הלילה אחרי 03:00, או עכשיו בכפתור "גיבוי עכשיו".'} />
        </TableCard>
        <Col width={380}>
          {!items ? (!list.error && <DCard><Skeleton lines={2} height={18} /></DCard>)
            : !last ? <Summary icon="box" tone="amber" title="עוד אין גיבוי" text="הגיבוי הראשון יירשם הלילה, או עכשיו בכפתור." />
              : <Summary icon={stale ? 'alert' : 'check'} tone={stale ? 'red' : 'green'} title={stale ? 'לא היה גיבוי ביממה וחצי האחרונות' : isManual(last) ? 'הגיבוי האחרון נשמר' : 'הגיבוי של הלילה נשמר'}
                text={<>{stale && 'האחרון: '}{dayTitle(last.date)} {hhmm(last.finishedAt)} · {fmt(last.docs)} רשומות · <Ltr>{size(last.bytes)}</Ltr>{run && <><br />גיבוי בתהליך, {fmt(run.docs)} רשומות עד עכשיו</>}</>} />}
          <DCard title={`סל המחזור${bin.data ? ` · ${bin.data.length}` : ''}`} aside="נשמר 30 יום" style={{ flex: '0 1 auto', minHeight: 170, display: 'flex', flexDirection: 'column' }}>
            {bin.error && !bin.data && <Failed text={`לא הצלחנו לקרוא את סל המחזור. ${bin.error}`} retry={bin.reload} />}
            {bin.loading && !bin.data && <Skeleton lines={4} />}
            {bin.data && !bin.data.length && <p className="dd-soft">סל המחזור ריק. מה שנמחק דרך אינסטינקט או הקונסולה נשמר כאן 30 יום.</p>}
            {!!bin.data?.length && (
              <div className="dd-bin">
                {bin.data.slice(0, 100).map((t) => (
                  <div key={t.key} className="dd-item">
                    <span className="dd-item__text"><b>{t.title || <Mono>{t.path}</Mono>}</b><span>{kindName(t.collection)} · {binnedBy(t)} · {binnedWhen(t)}</span></span>
                    <Act onClick={() => setBinItem(t)}>להחזיר</Act>
                  </div>
                ))}
              </div>
            )}
            <p className="dd-tail">מחיקות מתוך האפליקציה לא נכנסות לסל. אותן משחזרים מגיבוי של הלילה.</p>
          </DCard>
          <DCard title="אחסון">
            {storage && <Meter label="גיבויים וקבצים" value={<Ltr>{size(storage.used)}</Ltr>} of={<Ltr>{size(storage.limit)}</Ltr>} pct={(storage.used / storage.limit) * 100} />}
            <p className={`dd-tail${storage ? '' : ' dd-tail--first'}`}>נשמרים 30 הימים האחרונים והראשון של כל חודש.</p>
          </DCard>
        </Col>
      </Cols>
      {open && <RestoreDialog b={open} notify={notify} onClose={() => { setOpen(null); bin.reload(); }} downloading={downloading === open.date} onDownload={() => download(open.date)} />}
      {binItem && <BinDialog t={binItem} notify={notify} onClose={() => setBinItem(null)} onDone={() => { setBinItem(null); bin.reload(); }} />}
    </Page>
  );
}

function BinDialog({ t, onClose, onDone, notify }: { t: TrashItem; onClose: () => void; onDone: () => void; notify: Notify }) {
  const { busy, restore } = useTrashRestore(t, notify, onDone);
  return (
    <Dialog open onClose={onClose} width={480} title={t.title || 'רשומה שנמחקה'} sub="להחזיר מסל המחזור" footer={<><Btn kind="primary" disabled={busy} onClick={restore}>{busy ? 'משחזר…' : 'להחזיר'}</Btn><Btn onClick={onClose}>חזרה</Btn></>}>
      <div>
        <Fact label="מה זה">{collectionName(t.collection)}</Fact>
        <Fact label="מי מחק">{t.by}{t.who && t.who !== t.by ? ` (${t.who})` : ''}</Fact>
        <Fact label="מתי">{ago(t.deletedAt)}</Fact>
        <Fact label="נתיב"><Mono>{t.path}</Mono></Fact>
      </div>
      <Small>השחזור מחזיר את הרשומה בדיוק כמו שהייתה לפני המחיקה. אם בינתיים נוצרה רשומה חדשה באותו מקום, היא לא נדרסת.</Small>
    </Dialog>
  );
}

type View = { col: string | null; path: string | null };
function RestoreDialog({ b, onClose, notify, downloading, onDownload }: { b: Backup; onClose: () => void; notify: Notify; downloading: boolean; onDownload: () => void }) {
  const [view, setView] = useState<View>({ col: null, path: null });
  const { col, path } = view;
  if (col && path) return <DocDialog key={path} date={b.date} path={path} notify={notify} onClose={onClose} onBack={() => setView({ col, path: null })} />;
  if (col) return <ListDialog date={b.date} col={col} onClose={onClose} onBack={() => setView({ col: null, path: null })} onPick={(p) => setView({ col, path: p })} />;
  const cols = Object.entries(b.collections).sort((x, y) => y[1] - x[1]);
  return (
    <Dialog open onClose={onClose} width={640} title={`גיבוי ${dayTitle(b.date)}`} sub="בוחרים מה להחזיר. כלום לא משתנה עד שמאשרים" footer={<Btn icon="download" disabled={downloading} onClick={onDownload}>{downloading ? 'מוריד…' : 'הורדת הקובץ'}</Btn>}>
      <div>
        <Fact label="נשמר">{ddmm(b.date)} · {hhmm(b.finishedAt)}{isManual(b) ? ` · ידני, ${b.by}` : ''}</Fact>
        <Fact label="רשומות">{fmt(b.docs)}</Fact>
        <Fact label="גודל"><Ltr>{size(b.bytes)}</Ltr></Fact>
      </div>
      <SubTitle>מה יש בגיבוי</SubTitle>
      <Table inset label="מה יש בגיבוי" rows={cols} rowKey={(x) => x[0]} empty="הגיבוי ריק." columns={[
        { key: 'name', head: 'אוסף', strong: true, cell: (x) => collectionName(x[0]) },
        { key: 'n', head: 'רשומות', width: 90, align: 'end', cell: (x) => fmt(x[1]) },
        { key: 'go', head: '', width: 100, align: 'end', cell: (x) => <Act onClick={() => setView({ col: x[0], path: null })}>לפתוח</Act> },
      ]} />
      <Small>העותקים נשמרים בשירות האחסון, בחינם: 30 הימים האחרונים, והראשון של כל חודש לשנה.</Small>
    </Dialog>
  );
}

function ListDialog({ date, col, onClose, onBack, onPick }: { date: string; col: string; onClose: () => void; onBack: () => void; onPick: (path: string) => void }) {
  const docs = useLoad(() => source.backupDocs(date, col), [date, col]);
  const [q, setQ] = useState('');
  const rows = docs.data ? docs.data.items.filter((d) => !q.trim() || `${d.title} ${d.path}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const total = docs.data ? Math.max(docs.data.total, docs.data.items.length) : 0;
  return (
    <Dialog open onClose={onClose} width={640} title={collectionName(col)} sub={`גיבוי ${dayTitle(date)}`} footer={<Btn onClick={onBack}>כל מה שבגיבוי</Btn>}>
      <div className="dd-find"><Search value={q} onChange={setQ} placeholder="שם או מזהה" width="100%" /></div>
      <Table inset label="רשומות בגיבוי" rows={rows ? rows.slice(0, 200) : null} rowKey={(d) => d.path} loading={docs.loading} error={docs.error ? `לא הצלחנו לקרוא את הגיבוי. ${docs.error}` : null} retry={docs.reload} empty="אין רשומות שמתאימות." columns={[
        { key: 'title', head: 'רשומה', strong: true, wrap: true, cell: (d) => d.title || 'בלי שם' },
        { key: 'path', head: 'נתיב', soft: true, cell: (d) => <span className="dd-clip dd-path"><Mono>{d.path}</Mono></span> },
        { key: 'go', head: '', width: 90, align: 'end', cell: (d) => <Act onClick={() => onPick(d.path)}>להשוות</Act> },
      ]} />
      {rows && (rows.length > 200 || (!q.trim() && total > rows.length)) && <p className="dd-soft">מוצגות {fmt(Math.min(200, rows.length))} מתוך {fmt(q.trim() ? rows.length : total)}. חפשו כדי למצוא רשומה מסוימת.</p>}
    </Dialog>
  );
}

function DocDialog({ date, path, onClose, onBack, notify }: { date: string; path: string; onClose: () => void; onBack: () => void; notify: Notify }) {
  const r = useBackupDoc(date, path, notify);
  const { doc, d, keys, changed, state } = r;
  return (
    <Dialog open onClose={onClose} width={760} title="רשומה מהגיבוי" sub={<>גיבוי {dayTitle(date)} · <Mono>{path}</Mono></>}
      footer={<>{r.can && <Btn kind="primary" onClick={() => r.setConfirm(true)}>שחזור למצב בגיבוי</Btn>}<Btn onClick={onBack}>חזרה לרשימה</Btn></>}>
      {doc.error && !d && <Failed text={`לא הצלחנו לקרוא את הרשומה. ${doc.error}`} retry={doc.reload} />}
      {!d && !doc.error && <Skeleton lines={6} />}
      {d && state && (
        <>
          <div className="dd-state"><DTag tone={state.tone}>{state.text}</DTag></div>
          {!d.now && <Notice>הרשומה לא קיימת היום. השחזור יחזיר אותה כמו שהייתה בגיבוי.</Notice>}
          <Table inset label="השוואה בין הגיבוי להיום" rows={keys} rowKey={(k) => k} empty="אין שדות." columns={[
            { key: 'k', head: 'שדה', width: 170, soft: true, cell: (k) => fieldLabel(k) || <Mono>{k}</Mono> },
            { key: 'then', head: 'בגיבוי', wrap: true, cell: (k) => <span className={changed.includes(k) ? 'dd-diff' : undefined}><bdi>{cut(showValue(d.then[k]))}</bdi></span> },
            { key: 'now', head: 'היום', wrap: true, cell: (k) => <span className={changed.includes(k) && d.now ? 'dd-diff' : undefined}><bdi>{d.now ? cut(showValue(d.now[k])) : '—'}</bdi></span> },
          ]} />
        </>
      )}
      <ConfirmSheet open={r.confirm} tone="primary" onClose={() => r.setConfirm(false)} title="שחזור למצב בגיבוי" text={r.ask} confirmLabel={r.busy ? 'משחזר…' : 'כן, לשחזר'} cancelLabel="חזרה" onConfirm={r.restore} />
    </Dialog>
  );
}
