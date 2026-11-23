// נתונים: every collection in the database and its size, the records of one (search, more, export to Excel), and one
// record: all its fields, careful edits of simple fields, delete to the recycle bin, its history from the nightly
// backups (put an older version back) and what the app recorded about it.
import { useMemo, useState } from 'react';
import { BackLink, Button, Card, ConfirmSheet, Field, ListCard, Row, SearchField, Segmented, Sheet, Tag, Toggle } from '../app/v2/kit';
import { ddmm } from '../app/v2/format';
import { ago, fmt, Section, useLoad } from './shared';
import { collectionName, valueText } from './labels';
import { errorText, source, type DataCollection, type DataDoc, type DocVersion } from './source';

type Notify = (t: string, tone?: 'info' | 'alert') => void;
const SYSTEM = new Set(['api_log', 'api_failures', 'api_idempotency', 'push_jobs', 'email_outbox', 'account_deletions', 'counters']);
const SIMPLE = new Set(['string', 'integer', 'double', 'boolean', 'null']);
type Place = { group: string; parent?: string; label?: string };

export function DataScreen({ notify }: { notify: Notify }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [trail, setTrail] = useState<Place[]>([]);
  const go = (p: Place) => { if (place) setTrail([...trail, place]); setPlace(p); };
  const back = () => { const t = [...trail]; setPlace(t.pop() || null); setTrail(t); };
  return (
    <>
      {!place && <Collections onPick={(group) => { setTrail([]); setPlace({ group }); }} />}
      {place && <Records key={place.group + (place.parent || '')} place={place} backLabel={trail.length ? `חזרה ל${collectionName(trail[trail.length - 1].group)}` : 'כל האוספים'} onBack={back} onOpen={setOpen} notify={notify} />}
      {open && <RecordSheet path={open} onClose={() => setOpen(null)} notify={notify} onGone={() => setOpen(null)}
        onSub={(sub) => { const parent = open; setOpen(null); go({ group: `${parent.split('/').filter((_, i) => i % 2 === 0).join('/*/')}/*/${sub}`, parent, label: parent }); }} />}
    </>
  );
}

function Collections({ onPick }: { onPick: (group: string) => void }) {
  const list = useLoad(() => source.dataCollections());
  const [q, setQ] = useState('');
  const [sys, setSys] = useState(false);
  const match = (c: DataCollection) => !q.trim() || `${collectionName(c.group)} ${c.group}`.toLowerCase().includes(q.trim().toLowerCase());
  const items = (list.data?.items || []).filter(match);
  const farm = items.filter((c) => !SYSTEM.has(c.group));
  const system = items.filter((c) => SYSTEM.has(c.group));
  const row = (c: DataCollection) => {
    const n = c.count ?? c.backupCount;
    return <Row key={c.group} title={collectionName(c.group)} meta={<><span className="k-ltr" dir="ltr">{c.group}</span>{c.count === null && c.backupCount !== null ? ' · לפי הגיבוי של הלילה' : ''}</>}
      value={<span className="k-num">{fmt(n)}</span>} tags={c.readOnly ? <Tag tone="outline">קריאה בלבד</Tag> : undefined} chevron onClick={() => onPick(c.group)} />;
  };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">נתונים</h1>
          <p className="c-sub">כל מה ששמור במסד הנתונים של החווה. אפשר לעיין, לחפש, לייצא לאקסל, לראות היסטוריה של כל רשומה, ולתקן ערכים פשוטים בזהירות.</p>
        </div>
      </div>
      {list.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את רשימת האוספים. {list.error}</Card>}
      <SearchField label="חיפוש אוסף" placeholder="משימות, אירועים, tasks…" value={q} onChange={(e) => setQ(e.target.value)} active={!!q} />
      {list.loading && !list.data && <p className="c-soft">טוען…</p>}
      {!!farm.length && <Section title={`נתוני החווה · ${farm.length}`}><ListCard>{farm.map(row)}</ListCard></Section>}
      {!!system.length && (
        <Section title={`מערכת · ${system.length}`} aside={<Toggle checked={sys} onChange={setSys} label="להציג את אוספי המערכת" />}>
          {sys ? <ListCard>{system.map(row)}</ListCard> : <p className="c-note">יומנים ותורים שהשרת מנהל בעצמו. מוסתרים כדי לא להעמיס.</p>}
        </Section>
      )}
    </>
  );
}

function Records({ place, backLabel, onBack, onOpen, notify }: { place: Place; backLabel: string; onBack: () => void; onOpen: (path: string) => void; notify: Notify }) {
  const [after, setAfter] = useState<string | null>(null);
  const [rows, setRows] = useState<{ path: string; id: string; title: string; updateTime: string | null }[]>([]);
  const page = useLoad(async () => {
    const r = await source.dataDocs(place.group, after, place.parent);
    setRows((prev) => (after ? [...prev, ...r.items] : r.items));
    return r;
  }, [place.group, place.parent, after]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = rows.filter((d) => !q.trim() || `${d.title} ${d.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const exportIt = async () => {
    if (source.demo) return notify('הייצוא עובד בחשבון האמיתי');
    setBusy(true);
    try { await source.exportCsv(place.group); } catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(false); }
  };
  return (
    <>
      <BackLink label={backLabel} onClick={onBack} />
      <div className="c-title">
        <div>
          <h1 className="c-h1">{collectionName(place.group)}</h1>
          <p className="c-sub"><span className="k-ltr" dir="ltr">{place.parent ? `${place.parent}/${place.group.split('/*/').pop()}` : place.group}</span>{page.data && <> · <span className="k-num">{rows.length}</span>{page.data.next ? '+' : ''} רשומות</>}</p>
        </div>
        {!place.parent && <Button variant="neutral" icon="download" onClick={exportIt} disabled={busy}>{busy ? 'מייצא…' : 'ייצוא לאקסל'}</Button>}
      </div>
      <SearchField label="חיפוש ברשומות" placeholder="שם או מזהה" value={q} onChange={(e) => setQ(e.target.value)} active={!!q} />
      {page.error && <Card pad="md" className="c-error">{page.error}</Card>}
      {page.loading && !rows.length && <p className="c-soft">טוען…</p>}
      {!!shown.length && (
        <ListCard>
          {shown.map((d) => <Row key={d.path} title={d.title || <span className="k-ltr" dir="ltr">{d.id}</span>} meta={<><span className="k-ltr" dir="ltr">{d.id}</span>{d.updateTime && <> · עודכן {ago(d.updateTime)}</>}</>} chevron onClick={() => onOpen(d.path)} />)}
        </ListCard>
      )}
      {page.data && !rows.length && <Card pad="md" className="c-soft">האוסף ריק.</Card>}
      {page.data && !!rows.length && !shown.length && <Card pad="md" className="c-soft">אין רשומות שמתאימות לחיפוש{page.data.next ? '. אפשר לטעון עוד ולחפש שוב' : ''}.</Card>}
      {page.data?.next && <Button variant="neutral" block onClick={() => setAfter(page.data!.next)} disabled={page.loading}>{page.loading ? 'טוען…' : 'לטעון עוד'}</Button>}
    </>
  );
}

function RecordSheet({ path, onClose, notify, onGone, onSub }: { path: string; onClose: () => void; notify: Notify; onGone: () => void; onSub: (sub: string) => void }) {
  const doc = useLoad(() => source.dataDoc(path), [path]);
  const [tab, setTab] = useState<'fields' | 'history'>('fields');
  const d = doc.data;
  return (
    <Sheet open onClose={onClose} title={d?.title || path.split('/').pop()} aside={d ? <span className="c-soft">{collectionName(d.group)}</span> : undefined}>
      <div className="c-form">
        <Segmented label="תצוגה" value={tab} onChange={setTab} options={[{ value: 'fields', label: 'שדות' }, { value: 'history', label: 'היסטוריה' }]} />
        {doc.error && <p className="c-err">{doc.error}</p>}
        {doc.loading && !d && <p className="c-soft">טוען…</p>}
        {d && tab === 'fields' && <Fields d={d} notify={notify} reload={doc.reload} onGone={onGone} onSub={onSub} />}
        {d && tab === 'history' && <History path={path} notify={notify} onRestored={doc.reload} />}
      </div>
    </Sheet>
  );
}

function Fields({ d, notify, reload, onGone, onSub }: { d: DataDoc; notify: Notify; reload: () => void; onGone: () => void; onSub: (sub: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const keys = Object.keys(d.fields).sort();
  const editable = (k: string) => !d.readOnly && SIMPLE.has(d.types[k]);
  const start = () => { setDraft(Object.fromEntries(keys.filter(editable).map((k) => [k, d.types[k] === 'boolean' ? !!d.fields[k] : d.fields[k] === null ? '' : String(d.fields[k])]))); setEdit(true); };
  const parsed = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const t = d.types[k];
      const val = t === 'boolean' ? v : t === 'integer' || t === 'double' ? (String(v).trim() === '' ? null : Number(v)) : t === 'null' ? (String(v) === '' ? null : v) : v;
      if (JSON.stringify(val) !== JSON.stringify(d.fields[k])) out[k] = val;
    }
    return out;
  }, [draft, d]);
  const bad = Object.entries(parsed).some(([k, v]) => (d.types[k] === 'integer' || d.types[k] === 'double') && v !== null && !Number.isFinite(v as number));
  const save = async () => {
    setBusy(true);
    try { await source.editDoc(d.path, parsed, d.updateTime!); notify('נשמר'); setEdit(false); setConfirm(false); reload(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { await source.deleteDoc(d.path, d.updateTime!); notify('נמחק. אפשר לשחזר מסל המחזור במסך הגיבויים'); onGone(); }
    catch (e) { notify(errorText(e), 'alert'); }
  };
  return (
    <>
      <p className="c-sub"><span className="k-ltr" dir="ltr">{d.path}</span> · נוצר {ago(d.createTime)} · עודכן {ago(d.updateTime)}</p>
      {d.readOnly && <p className="c-note">{d.group === 'users' ? 'אנשים עורכים במסך "אנשים", שם שינוי תפקיד עושה את כל מה שצריך.' : 'יומנים של השרת אי אפשר לערוך.'}</p>}
      <div className="c-fields" role="table" aria-label="השדות של הרשומה">
        {keys.map((k) => (
          <div key={k} role="row" className="c-fields__row">
            <span role="rowheader" className="c-fields__key k-ltr" dir="ltr">{k}</span>
            <span role="cell" className="c-fields__val">
              {edit && editable(k)
                ? d.types[k] === 'boolean'
                  ? <Toggle checked={!!draft[k]} onChange={(v) => setDraft({ ...draft, [k]: v })} label={k} />
                  : <Field label={k} labelHidden value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} numeric={d.types[k] === 'integer' || d.types[k] === 'double'} ltr={d.types[k] !== 'string' || /^[\x00-\x7F]*$/.test(String(draft[k] ?? ''))} />
                : <bdi>{valueText(d.fields[k])}</bdi>}
            </span>
          </div>
        ))}
      </div>
      {!!d.subcollections.length && (
        <div className="c-subs">
          <span className="c-soft">בתוך הרשומה:</span>
          {d.subcollections.map((s) => <Button key={s} variant="neutral" onClick={() => onSub(s)}>{collectionName(s)}</Button>)}
        </div>
      )}
      {!d.readOnly && !edit && (
        <div className="c-actions">
          <Button variant="neutral" icon="edit" onClick={start} disabled={!keys.some(editable)}>עריכה</Button>
          <Button variant="quiet" onClick={() => setDel(true)}>מחיקה</Button>
        </div>
      )}
      {edit && !confirm && (
        <div className="c-actions">
          <Button disabled={!Object.keys(parsed).length || bad} onClick={() => setConfirm(true)}>{Object.keys(parsed).length ? `שמירה (${Object.keys(parsed).length})` : 'אין שינויים'}</Button>
          <Button variant="quiet" onClick={() => setEdit(false)}>ביטול</Button>
        </div>
      )}
      {edit && confirm && (
        <>
          <div className="c-warn">
            <b>השינוי נכתב ישר למסד הנתונים, בלי הבדיקות של האפליקציה.</b>
            <ul>{Object.entries(parsed).map(([k, v]) => <li key={k}><bdi className="k-ltr">{k}</bdi>: <bdi>{valueText(d.fields[k])}</bdi> ← <bdi>{valueText(v)}</bdi></li>)}</ul>
            הערכים הקודמים נשמרים ביומן, ואם מישהו שינה את הרשומה בינתיים השמירה לא תדרוס.
          </div>
          <Button size="lg" block disabled={busy} onClick={save}>{busy ? 'שומר…' : 'כן, לשמור'}</Button>
          <Button variant="quiet" block onClick={() => setConfirm(false)}>חזרה לעריכה</Button>
        </>
      )}
      <ConfirmSheet open={del} onClose={() => setDel(false)} title="למחוק את הרשומה?" text="היא תעבור לסל המחזור ל־30 יום, ואפשר יהיה להחזיר אותה משם. דברים שתלויים בה באפליקציה לא יימחקו איתה." confirmLabel="מחיקה" onConfirm={remove} />
    </>
  );
}

function History({ path, notify, onRestored }: { path: string; notify: Notify; onRestored: () => void }) {
  const [days, setDays] = useState(7);
  const h = useLoad(() => source.dataHistory(path, days), [path, days]);
  const [pick, setPick] = useState<DocVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const span = (v: DocVersion) => (v.from === v.to ? ddmm(v.from) : `${ddmm(v.from)}–${ddmm(v.to)}`);
  const restore = async (v: DocVersion) => {
    setBusy(true);
    try { await source.restoreBackup(v.to, [path]); notify('הרשומה הוחזרה לגרסה הזאת'); setPick(null); h.reload(); onRestored(); }
    catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  if (h.loading && !h.data) return <p className="c-soft">קורא את הגיבויים…</p>;
  if (h.error) return <p className="c-err">{h.error}</p>;
  const x = h.data!;
  if (pick) {
    const now = x.now?.fields || {};
    const keys = [...new Set([...Object.keys(pick.fields || {}), ...Object.keys(now)])].sort();
    return (
      <>
        <BackLink label="כל הגרסאות" onClick={() => setPick(null)} />
        <p className="c-sub">הגרסה שהייתה ב־{span(pick)}, מול היום</p>
        <div className="c-compare" role="table">
          <div className="c-compare__row c-compare__head" role="row"><span role="columnheader">שדה</span><span role="columnheader">אז</span><span role="columnheader">היום</span></div>
          {keys.map((k) => {
            const diff = JSON.stringify(pick.fields?.[k]) !== JSON.stringify(now[k]);
            return <div key={k} role="row" className={`c-compare__row${diff ? ' c-compare__row--diff' : ''}`}><span role="cell" className="k-ltr" dir="ltr">{k}</span><span role="cell">{valueText(pick.fields?.[k])}</span><span role="cell">{x.now ? valueText(now[k]) : '—'}</span></div>;
          })}
        </div>
        <Button size="lg" block disabled={busy} onClick={() => restore(pick)}>{busy ? 'משחזר…' : 'להחזיר לגרסה הזאת'}</Button>
        <p className="c-note">הרשומה תוחלף במה שהיה בגיבוי של {ddmm(pick.to)}. שינויים שנעשו בה מאז יימחקו, והגרסה של היום תישמר בגיבוי של הלילה.</p>
      </>
    );
  }
  return (
    <>
      <Section title="גרסאות מהגיבויים">
        {!x.versions.length && <Card pad="md" className="c-soft">עוד אין גיבויים שהרשומה מופיעה בהם.</Card>}
        {!!x.versions.length && (
          <ListCard>
            {x.versions.map((v, i) => (
              <Row key={v.from + i} title={i === 0 && !v.gone && x.now?.updateTime === v.updateTime ? `${span(v)} · כמו היום` : span(v)}
                meta={v.gone ? 'לא הייתה קיימת בגיבוי' : v.changed.length ? `השתנו: ${v.changed.join(', ')}` : i === x.versions.length - 1 ? 'הגרסה הכי ישנה בטווח' : 'בלי שינוי בשדות'}
                chevron={!v.gone} onClick={v.gone ? undefined : () => setPick(v)} />
            ))}
          </ListCard>
        )}
        <p className="c-note">נבדקו {x.days} גיבויים אחרונים.{days < 30 && <> <button type="button" className="c-link" onClick={() => setDays(30)}>לבדוק 30 יום</button></>}</p>
      </Section>
      <Section title="מה נרשם באפליקציה">
        {!x.activity.length && <Card pad="md" className="c-soft">אין שורות ביומן הפעילות על הרשומה הזאת.</Card>}
        {!!x.activity.length && <ListCard>{x.activity.map((a, i) => <Row key={a.at + i} title={a.text} meta={<>{a.by}{a.via ? ` · דרך ${a.via}` : ''} · {ago(a.at)}</>} />)}</ListCard>}
      </Section>
    </>
  );
}
