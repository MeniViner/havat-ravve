// דפדוף בנתונים on a computer (K7): collections, the records of one as a table, and the chosen record beside it with its
// fields, its history and the careful actions. Earlier versions (the nightly backups) open in a window.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmSheet } from '../../app/v2/kit';
import { ddmm } from '../../app/v2/format';
import { ago, fmt, useLoad } from '../shared';
import { collectionName, fieldLabel, valueText } from '../labels';
import { errorText, source, type DataCollection, type DataDoc, type DataDocRow, type DocVersion } from '../source';
import { Act, Btn, Chips, Cols, type Column, Dialog, DTag, Empty, Failed, Fact, Facts, Hist, Input, LoadingPanel, Mono, Notice, Page, Panel, EmptyPanel, saveCsv, Search, Select, Skeleton, Small, SubTitle, Switch, Table, TableCard, Toolbar } from './desk';
import { useLeaveGuard, useRest, useSettled } from './route';
import { activityText, cut, factsOf, groupOf, type Notify, type Place, placeKey, readAddress, showValue, specOf, useCollections, useRecordEdit, useRecords, when, whenFull, writeAddress } from './DataSpec';

/** A value that is shown as it is stored (an object) reads left to right. */
const rawDir = (v: unknown) => (v && typeof v === 'object' && /[{[]/.test(valueText(v)) ? 'ltr' as const : undefined);
const READ_NOTE = (group: string) => (group === 'users' ? 'אנשים עורכים במסך "אנשים והרשאות", שם שינוי תפקיד עושה את כל מה שצריך.' : 'רשומות של השרת אי אפשר לערוך.');

export function DataDesk({ notify }: { notify: Notify }) {
  const list = useCollections();
  const dirty = useRef(false);
  // a change not saved yet is not dropped without asking
  const [leave, setLeave] = useState<{ go: () => void } | null>(null);
  const guard = (go: () => void) => { if (dirty.current) setLeave({ go: () => { dirty.current = false; go(); } }); else go(); };
  useLeaveGuard(() => dirty.current, (go) => setLeave({ go }));
  const [rest, setRest] = useRest('data');
  const at = readAddress(rest);
  const [sys, setSys] = useState(false);
  const [find, setFind] = useState('');
  const first = list.farm[0];
  const place: Place | null = at.place || (first ? { group: first.group } : null);
  const info = [...list.farm, ...list.system].find((c) => c.group === place?.group);
  const page = useRecords(place);
  const spec = specOf(place?.group || '');
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('all');
  const key = place ? placeKey(place) : '';
  useEffect(() => { setQ(''); setChip('all'); }, [key]);
  // a server collection named in the address is listed even when they are hidden
  useEffect(() => { if (list.system.some((c) => c.group === place?.group)) setSys(true); }, [list.system, place?.group]);

  const sorted = useMemo(() => page.rows && [...page.rows].sort((a, b) => ((a.updateTime || '') < (b.updateTime || '') ? 1 : -1)), [page.rows]);
  const chipOf = (r: DataDocRow) => (r.fields && spec.status ? spec.status(r.fields)?.chip : undefined);
  const count = (v: string) => (sorted || []).filter((r) => chipOf(r) === v).length;
  const chips = (spec.chips || []).map((c) => ({ ...c, n: count(c.value) })).filter((c) => c.n);
  const plus = page.next ? '+' : '';
  const text = q.trim().toLowerCase();
  const shown = sorted && sorted.filter((r) => (chip === 'all' || chipOf(r) === chip) && (!text || `${r.title} ${r.id}`.toLowerCase().includes(text)));
  // the record in the address, unless the search or the chips hide it; a record just deleted leaves the panel empty
  const [gone, setGone] = useState('');
  const hidden = !!at.doc && (chip !== 'all' || !!text) && !!shown && !shown.some((r) => r.path === at.doc);
  const doc = at.doc && (!hidden || dirty.current) ? at.doc : gone === key ? null : shown?.[0]?.path || null;
  // walking the list with the arrows reads only the record it stops on
  const settled = useSettled(doc);
  const set = (p: Place, path: string | null) => { setGone(''); setRest(writeAddress(p, path)); };
  // the first record goes into the address, so a save that moves it in the list does not swap the panel
  useEffect(() => { if (place && doc && doc !== at.doc) setRest(writeAddress(place, doc)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [doc, at.doc]);
  const open = (path: string) => { if (place && path !== doc) guard(() => set(place, path)); };
  const pick = (p: Place) => guard(() => set(p, null));
  const name = place ? (place.parent ? collectionName(place.group.split('/*/').pop()!) : collectionName(place.group)) : '';

  const withFields = !!page.rows?.some((r) => r.fields);
  const columns: Column<DataDocRow>[] = [
    { key: 'title', head: spec.head, strong: true, cell: (r) => <span className="dd-clip" title={r.title || r.id}>{r.title || <Mono>{r.id}</Mono>}</span> },
    ...(withFields
      ? [
        ...(spec.cols || []).map((c): Column<DataDocRow> => ({ key: c.key, head: c.head, width: c.width, cell: (r) => <span className="dd-clip" style={{ maxWidth: c.width + 40 }}>{r.fields ? c.text(r.fields) : ''}</span> })),
        ...(spec.status ? [{ key: 'status', head: 'מצב', width: 90, cell: (r: DataDocRow) => { const s = r.fields && spec.status!(r.fields); return s ? <DTag tone={s.tone}>{s.label}</DTag> : null; } }] : []),
        ...(!spec.cols && !spec.status ? [{ key: 'id', head: 'מזהה', width: 150, soft: true, cell: (r: DataDocRow) => <Mono>{r.id}</Mono> }] : []),
      ]
      : [{ key: 'id', head: 'מזהה', width: 180, soft: true, cell: (r: DataDocRow) => <Mono>{r.id}</Mono> }]),
    { key: 'updated', head: 'עודכן', width: 110, soft: true, cell: (r) => when(r.updateTime) },
  ];
  const [busy, setBusy] = useState(false);
  const exportIt = async () => {
    if (!place) return;
    if (source.demo) {
      // the demo has no server to make the file: the same rows, saved from here
      const keys = [...new Set((sorted || []).flatMap((r) => Object.keys(r.fields || {})))];
      saveCsv(`havat-ravve-${place.group.replace(/\/\*\//g, '-')}.csv`, ['מזהה', ...keys.map((k) => fieldLabel(k) || k)], (sorted || []).map((r) => [r.id, ...keys.map((k) => (r.fields?.[k] === undefined ? '' : showValue(r.fields[k])))]));
      return;
    }
    setBusy(true);
    try { await source.exportCsv(place.group); } catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(false); }
  };

  const match = (c: DataCollection) => !find.trim() || `${collectionName(c.group)} ${c.group}`.toLowerCase().includes(find.trim().toLowerCase());
  const farm = list.farm.filter(match), system = sys ? list.system.filter(match) : [];
  const item = (c: DataCollection) => {
    const on = place?.group === c.group && !place.parent;
    return (
      <button key={c.group} type="button" className="dd-col" aria-current={on || undefined} title={c.count === null && c.backupCount !== null ? `${collectionName(c.group)}, המספר לפי הגיבוי של הלילה` : undefined} onClick={() => pick({ group: c.group })}>
        <span className="dd-col__name"><span>{collectionName(c.group)}</span>{c.readOnly && <DTag>קריאה</DTag>}</span><span className="dd-col__n">{fmt(c.count ?? c.backupCount)}</span>
      </button>
    );
  };
  return (
    <Page group="נתונים" title="דפדוף בנתונים" sub="כל מה ששמור במסד הנתונים. אפשר לעיין, לייצא, לראות היסטוריה של כל רשומה, ולתקן ערך בזהירות"
      actions={place && !place.parent ? <Btn icon="download" onClick={exportIt} disabled={busy || !page.rows?.length}>{busy ? 'מייצא…' : 'ייצוא האוסף'}</Btn> : undefined}>
      <Toolbar end={<label className="d-inline">להציג גם אוספי מערכת <Switch on={sys} onChange={setSys} label="אוספי מערכת" /></label>}>
        {place?.parent && <Act onClick={() => guard(() => set({ group: groupOf(place.parent!), ...parentOf(place.parent!) }, place.parent!))}>חזרה ל{collectionName(groupOf(place.parent))}</Act>}
        {/* in a narrow window the list of collections is this choice (data.css) */}
        {list.data && <span className="dd-colpick"><Select label="אוסף" value={place && !place.parent ? place.group : ''} onChange={(g) => g && pick({ group: g })}
          options={[...(place?.parent ? [{ value: '', label: name }] : []), ...[...list.farm, ...(sys ? list.system : [])].map((c) => ({ value: c.group, label: `${collectionName(c.group)} · ${fmt(c.count ?? c.backupCount)}${c.readOnly ? ' · קריאה' : ''}` }))]} /></span>}
        <Search value={q} onChange={setQ} placeholder={name ? `חיפוש ב${name}` : 'חיפוש'} />
        {!!chips.length && <Chips label="מצב" value={chip} onChange={setChip} options={[{ value: 'all', label: `הכל · ${fmt(sorted!.length)}${plus}` }, ...chips.map((c) => ({ value: c.value, label: `${c.label} · ${fmt(c.n)}${plus}` }))]} />}
      </Toolbar>
      <Cols>
        <aside className={`dd-cols${list.data ? ' dd-cols--ready' : ''}`} aria-label="אוספים">
          {list.error ? <Failed text={<>לא הצלחנו לקרוא את רשימת האוספים. {list.error}</>} retry={list.reload} /> : !list.data ? <div className="dd-cols__load"><Skeleton lines={12} height={16} /></div> : (
            <>
              <span className="dd-cols__head">נתוני החווה · {list.farm.length}</span>
              {list.farm.length + (sys ? list.system.length : 0) > 13 && <div className="dd-cols__find"><Search value={find} onChange={setFind} placeholder="חיפוש אוסף" width="100%" /></div>}
              {farm.map(item)}
              {sys && !!list.system.length && <span className="dd-cols__head dd-cols__head--next">מערכת · {list.system.length}</span>}
              {system.map(item)}
              {!farm.length && !system.length && <Empty>אין אוסף כזה.</Empty>}
            </>
          )}
        </aside>
        <TableCard style={{ containerType: 'inline-size' }}>
          <div className="dd-recs"><Table label={name} columns={columns} rows={shown} rowKey={(r) => r.path} selected={doc} onSelect={open} loading={page.loading} error={page.error ? `לא הצלחנו לקרוא את הרשומות. ${page.error}` : list.error && !place ? 'אין אוסף להציג' : null} retry={page.reload}
            empty={page.rows?.length ? `אין רשומות שמתאימות${page.next ? '. אפשר לטעון עוד ולחפש שוב' : ''}` : 'האוסף ריק.'} /></div>
          {page.next && !page.error && <div className="dd-more"><Act onClick={page.more} disabled={page.loading}>{page.loading ? 'טוען…' : 'עוד'}</Act></div>}
        </TableCard>
        {doc ? settled !== doc ? <LoadingPanel /> : <Record key={doc} path={doc} dirty={dirty} notify={notify} onChanged={page.reload} onGone={() => { setGone(key); setRest(writeAddress(place!)); page.reload(); list.reload(); }} onSub={(sub) => pick({ group: `${groupOf(doc)}/*/${sub}`, parent: doc })} />
          : shown ? <EmptyPanel>{page.rows?.length ? 'לא נבחרה רשומה.' : `אין רשומות ב${name}${info?.readOnly ? '' : ' עדיין'}.`}</EmptyPanel> : page.error ? <EmptyPanel>אין מה להציג.</EmptyPanel> : <LoadingPanel />}
      </Cols>
      <ConfirmSheet open={!!leave} onClose={() => setLeave(null)} title="יש שינויים שלא נשמרו" text="אם יוצאים מהרשומה עכשיו, מה ששונה כאן לא יישמר." confirmLabel="לצאת בלי לשמור" cancelLabel="חזרה לעריכה" onConfirm={() => { leave?.go(); setLeave(null); }} />
    </Page>
  );
}
/** The place a record itself sits in, when that is inside another record. */
function parentOf(path: string): { parent?: string } {
  const p = path.split('/').slice(0, -2).join('/');
  return p ? { parent: p } : {};
}

function Record({ path, dirty, notify, onChanged, onGone, onSub }: { path: string; dirty: { current: boolean }; notify: Notify; onChanged: () => void; onGone: () => void; onSub: (sub: string) => void }) {
  const doc = useLoad(() => source.dataDoc(path), [path]);
  const id = path.split('/').pop()!;
  if (doc.error && !doc.data) return <Panel title={id} sub={<Mono>{path.split('/').join(' / ')}</Mono>}><Failed text={doc.error === 'לא נמצא' ? 'הרשומה לא נמצאה. אולי נמחקה בינתיים.' : `לא הצלחנו לקרוא את הרשומה. ${doc.error}`} retry={doc.reload} /></Panel>;
  if (!doc.data) return <LoadingPanel />;
  return <RecordPanel d={doc.data} dirty={dirty} notify={notify} reload={() => { doc.reload(); onChanged(); }} onGone={onGone} onSub={onSub} />;
}

function RecordPanel({ d, dirty, notify, reload, onGone, onSub }: { d: DataDoc; dirty: { current: boolean }; notify: Notify; reload: () => void; onGone: () => void; onSub: (sub: string) => void }) {
  const e = useRecordEdit(d, notify, reload, onGone);
  dirty.current = e.edit && e.changes > 0;
  useEffect(() => () => { dirty.current = false; }, [dirty]);
  // the keyboard goes on inside the form, and back to "עריכה זהירה" when it closes
  const form = useRef<HTMLDivElement>(null), again = useRef(false);
  useEffect(() => {
    if (e.edit) form.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    else if (again.current && document.activeElement === document.body) document.querySelector<HTMLElement>('[aria-label="הרשומה"] .d-panel__foot button')?.focus();
    again.current = e.edit;
  }, [e.edit]);
  const [del, setDel] = useState(false);
  const [versions, setVersions] = useState(false);
  const [all, setAll] = useState(false);
  // activity lines only (days 0); a server that refuses it simply has no short history here
  const hist = useLoad(() => source.dataHistory(d.path, 0), [d.path, d.updateTime]);
  const head = <Mono>{d.path.split('/').join(' / ')}</Mono>;
  const label = (k: string) => fieldLabel(k) || k;
  if (e.edit) return (
    <Panel title={d.title || d.id} sub={head} label="עריכת הרשומה" footer={<>
      <Btn kind="primary" disabled={!e.changes || e.bad} onClick={() => e.setConfirm(true)}>{e.changes ? `שמירה (${e.changes})` : 'אין שינויים'}</Btn>
      <Btn onClick={() => e.setEdit(false)}>ביטול</Btn>
    </>}>
      <div className="dd-form" ref={form} onKeyDown={(x) => { if (x.key === 'Escape' && !e.changes && !e.confirm) { x.stopPropagation(); e.setEdit(false); } }}>
        {e.keys.filter(e.editable).map((k) => (d.types[k] === 'boolean'
          ? <div key={k} className="dd-form__yes"><span>{label(k)}</span><Switch on={!!e.draft[k]} onChange={(v) => e.setDraft({ ...e.draft, [k]: v })} label={label(k)} /></div>
          : <Input key={k} label={label(k)} type={e.kind(k) === 'instant' ? 'datetime-local' : e.kind(k) === 'day' ? 'date' : 'text'} value={String(e.draft[k] ?? '')} onChange={(v) => e.setDraft({ ...e.draft, [k]: v })} multiline={d.types[k] === 'string' && String(d.fields[k] ?? '').length > 60}
              ltr={d.types[k] !== 'string' || (!!e.draft[k] && /^[\x00-\x7F]*$/.test(String(e.draft[k])))} error={e.badKey(k) ? (e.kind(k) === 'text' ? 'צריך מספר' : 'צריך תאריך') : undefined} />))}
        {e.keys.some((k) => !e.editable(k)) && <Small>שדות שמחזיקים אדם, מקום או רשימה עורכים באפליקציה: {e.keys.filter((k) => !e.editable(k)).map(label).join(', ')}.</Small>}
      </div>
      <Dialog open={e.confirm} onClose={() => e.setConfirm(false)} title="לשמור את השינוי?" sub={d.title || d.id} footer={<>
        <Btn kind="primary" disabled={e.busy} onClick={e.save}>{e.busy ? 'שומר…' : 'כן, לשמור'}</Btn><Btn onClick={() => e.setConfirm(false)}>חזרה לעריכה</Btn>
      </>}>
        <Notice>השינוי נכתב ישר למסד הנתונים, בלי הבדיקות של האפליקציה.</Notice>
        <div>{Object.entries(e.parsed).map(([k, v]) => <Fact key={k} label={label(k)}><bdi>{cut(showValue(d.fields[k]))}</bdi> ← <bdi>{cut(showValue(v))}</bdi></Fact>)}</div>
        <Small>הערכים הקודמים נשמרים ביומן, ואם מישהו שינה את הרשומה בינתיים השמירה לא תדרוס.</Small>
      </Dialog>
    </Panel>
  );
  return (
    <Panel title={d.title || d.id} sub={head} label="הרשומה" footer={<>
      {!d.readOnly && <Btn kind="action" icon="edit" onClick={e.start} disabled={!e.keys.some(e.editable)}>עריכה זהירה</Btn>}
      <Btn onClick={() => setVersions(true)}>גרסה קודמת</Btn>
      {!d.readOnly && <Btn kind="danger" onClick={() => setDel(true)}>מחיקה</Btn>}
    </>}>
      <Facts>{factsOf(d).map((f) => <Fact key={f.label + f.stored} label={f.stored ? <Mono>{f.stored}</Mono> : f.label}><bdi>{cut(f.text)}</bdi></Fact>)}</Facts>
      {d.readOnly && <div className="dd-gap"><Notice>{READ_NOTE(d.group)}</Notice></div>}
      {!!d.subcollections.length && <div className="dd-subs"><span>בתוך הרשומה:</span>{d.subcollections.map((s) => <Act key={s} onClick={() => onSub(s)}>{collectionName(s)}</Act>)}</div>}
      {!!hist.data?.activity.length && <><SubTitle>היסטוריה של הרשומה</SubTitle>{hist.data.activity.map((a, i) => <Hist key={a.at + i} when={whenFull(a.at)}>{activityText(a, d.title)}</Hist>)}</>}
      <div className="dd-gap"><Act onClick={() => setAll(true)}>כל השדות כמו שהם שמורים · {e.keys.length}</Act></div>
      <Dialog open={all} onClose={() => setAll(false)} width={640} title={d.title || d.id} sub={<>נוצר {ago(d.createTime)} · עודכן {ago(d.updateTime)}</>}>
        <div className="dd-all">{e.keys.map((k) => <Fact key={k} labelWidth={190} label={<>{fieldLabel(k) && <>{fieldLabel(k)} </>}<Mono>{k}</Mono></>}><bdi dir={rawDir(d.fields[k])}>{cut(valueText(d.fields[k]), 2000)}</bdi></Fact>)}</div>
      </Dialog>
      {versions && <Versions d={d} notify={notify} onClose={() => setVersions(false)} onRestored={reload} />}
      <ConfirmSheet open={del} onClose={() => setDel(false)} title="למחוק את הרשומה?" text="היא תעבור לסל המחזור ל־30 יום, ואפשר יהיה להחזיר אותה משם. דברים שתלויים בה באפליקציה לא יימחקו איתה." confirmLabel="מחיקה" cancelLabel="חזרה" onConfirm={e.remove} />
    </Panel>
  );
}

const span = (v: DocVersion) => (v.from === v.to ? ddmm(v.from) : `${ddmm(v.from)}–${ddmm(v.to)}`);
function Versions({ d, notify, onClose, onRestored }: { d: DataDoc; notify: Notify; onClose: () => void; onRestored: () => void }) {
  const [days, setDays] = useState(7);
  const h = useLoad(() => source.dataHistory(d.path, days), [d.path, days]);
  const [pick, setPick] = useState<DocVersion | null>(null);
  const [ask, setAsk] = useState(false);
  const restore = async (v: DocVersion) => {
    try { await source.restoreBackup(v.to, [d.path]); notify('הרשומה הוחזרה לגרסה הזאת. הגרסה הקודמת בסל המחזור'); setAsk(false); onClose(); onRestored(); }
    catch (e) { notify(errorText(e), 'alert'); }
  };
  const x = h.data;
  const now = x?.now?.fields || {};
  const keys = pick ? [...new Set([...Object.keys(pick.fields || {}), ...Object.keys(now)])].sort() : [];
  const diff = (k: string) => JSON.stringify(pick?.fields?.[k]) !== JSON.stringify(now[k]);
  return (
    <Dialog open onClose={onClose} width={760} title="גרסה קודמת" sub={pick ? `${d.title || d.id} · הגרסה שהייתה ב־${span(pick)}, מול היום` : d.title || d.id}
      footer={pick ? <><Btn kind="primary" disabled={!keys.some(diff)} onClick={() => setAsk(true)}>{keys.some(diff) ? 'להחזיר לגרסה הזאת' : 'הגרסה זהה להיום'}</Btn><Btn onClick={() => setPick(null)}>כל הגרסאות</Btn></> : undefined}>
      {h.error && !x && <Failed text={`לא הצלחנו לקרוא את הגיבויים. ${h.error}`} retry={h.reload} />}
      {!x && !h.error && <><p className="dd-soft">קורא את הגיבויים…</p><Skeleton lines={4} /></>}
      {x && !pick && (
        <>
          <Table inset label="גרסאות מהגיבויים" rows={x.versions} rowKey={(v) => v.from + v.to} empty="עוד אין גיבויים שהרשומה מופיעה בהם." columns={[
            { key: 'span', head: 'מתי', width: 170, strong: true, cell: (v) => `${span(v)}${v === x.versions[0] && !v.gone && !v.unavailable && x.now?.updateTime === v.updateTime ? ' · כמו היום' : ''}` },
            { key: 'what', head: 'מה השתנה', wrap: true, soft: true, cell: (v) => (v.unavailable ? 'הגיבוי לא זמין' : v.gone ? 'לא הייתה קיימת בגיבוי' : v.changed.length ? `השתנו: ${v.changed.map((k) => fieldLabel(k) || k).join(', ')}` : v === x.versions[x.versions.length - 1] ? 'הגרסה הכי ישנה בטווח' : 'בלי שינוי בשדות') },
            { key: 'go', head: '', width: 100, align: 'end', cell: (v) => (v.gone || v.unavailable ? null : <Act onClick={() => setPick(v)}>להשוות</Act>) },
          ]} />
          <p className="dd-soft">נבדקו {x.days} גיבויים אחרונים.{x.truncated && ' הבדיקה נעצרה במגבלת הקריאה של השרת.'}{days < 30 && <> <Act onClick={() => setDays(30)} disabled={h.loading}>{h.loading ? 'בודק…' : 'לבדוק 30 יום'}</Act></>}</p>
          <div><SubTitle>מה נרשם באפליקציה</SubTitle>
            {!x.activity.length && <Empty>אין שורות ביומן הפעילות על הרשומה הזאת.</Empty>}
            {x.activity.map((a, i) => <Hist key={a.at + i} when={whenFull(a.at)}>{activityText(a, d.title)}{a.via && a.by ? <span className="dd-soft"> · בשם {a.by}</span> : null}</Hist>)}</div>
        </>
      )}
      {x && pick && (
        <>
          <Table inset label="השוואה" rows={keys} rowKey={(k) => k} rowTone={undefined} empty="אין שדות" columns={[
            { key: 'f', head: 'שדה', width: 190, soft: true, cell: (k) => <>{fieldLabel(k) && <>{fieldLabel(k)} </>}<Mono>{k}</Mono></> },
            { key: 'then', head: 'אז', wrap: true, cell: (k) => <span className={diff(k) ? 'dd-diff' : undefined}><bdi>{cut(showValue(pick.fields?.[k]))}</bdi></span> },
            { key: 'now', head: 'היום', wrap: true, cell: (k) => <bdi>{x.now ? cut(showValue(now[k])) : '—'}</bdi> },
          ]} />
          <Small>הרשומה תוחלף בגרסה מ־{ddmm(pick.to)}. הגרסה של היום נשמרת בסל המחזור ל־30 יום.</Small>
          <ConfirmSheet open={ask} onClose={() => setAsk(false)} title={`להחזיר את הרשומה לגרסה מ־${ddmm(pick.to)}?`}
            text={`הרשומה תוחלף בגרסה מ־${ddmm(pick.to)}. הגרסה של היום נשמרת בסל המחזור ל־30 יום, ואפשר להחזיר אותה משם במסך הגיבויים.`}
            confirmLabel="כן, להחזיר" cancelLabel="חזרה" onConfirm={() => restore(pick)} />
        </>
      )}
    </Dialog>
  );
}
