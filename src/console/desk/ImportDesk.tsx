// ייבוא מאקסל on a computer (K9): paste, match the columns, check every row (and fix it in the table), import. The panel
// says what will go in before anything does.
import { useEffect, useRef, useState } from 'react';
import { dayTime, ddmm, hhmm, daysFromToday } from '../../app/v2/format';
import { fmt, many } from '../shared';
import type { ImportBatch } from '../source';
import { Act, Btn, Chips, Cols, type Column, DCard, DTag, Fact, Facts, Failed, Notice, Nums, Page, Panel, Select, Skeleton, Small, Steps, SubTitle, Table, TableCard } from './desk';
import { type Checked, FIELDS, type ImportState, MAX_ROWS, PLACEHOLDER } from './ImportSpec';

const STEPS = ['הדבקה', 'התאמת עמודות', 'בדיקה', 'ייבוא'];
const KINDS = [{ value: 'tasks' as const, label: 'משימות' }, { value: 'shopping' as const, label: 'רשימת קניות' }];

export function ImportDesk({ imp, onImport, onUndo, sample }: { imp: ImportState; onImport: () => void; onUndo: (b: ImportBatch) => void; sample: string | null }) {
  const [at, setAt] = useState<0 | 1 | 2>(0);
  const { kind, data, fields, outcomes, progress } = imp;
  // the fourth step is the import itself: while it runs and once it has run
  const step = progress || outcomes ? 3 : !data.length ? 0 : at;
  const matched = imp.header ? imp.header.every((h, i) => !h || imp.fieldOf(i)) && imp.titled : false;
  // all the columns found by their names: straight to the check (the head of the table still changes a match)
  const go = () => setAt(matched ? 2 : 1);
  const back = () => { if (outcomes) { imp.reset(); setAt(0); } else setAt(step === 2 ? 1 : 0); };
  return (
    <Page group="נתונים" title="ייבוא מאקסל" sub="הרבה משימות או פריטי קניות בבת אחת: מעתיקים את השורות מאקסל או מ־Google Sheets ומדביקים"
      actions={<Chips label="מה מייבאים" options={KINDS} value={kind} onChange={(v) => { if (!progress) { imp.setKind(v); } }} />}>
      <Steps steps={STEPS} at={step} />
      <Cols>
        {step === 0 ? <Paste imp={imp} sample={sample} onGo={go} /> : <TableCard style={{ containerType: 'inline-size' }}><Rows imp={imp} step={step} /></TableCard>}
        {step === 0 && <StartPanel imp={imp} onGo={go} onUndo={onUndo} />}
        {step === 1 && (
          <Panel title="התאמת עמודות" sub="מה כל עמודה בקובץ" footer={<><Btn kind="primary" disabled={!imp.titled} onClick={() => setAt(2)}>לבדיקה</Btn><Btn onClick={back}>חזרה</Btn></>}>
            <div className="dd-match">
              {fields.map((f) => (
                <label key={f.key} className="dd-match__row"><span>{f.he}{f.required ? ' · חובה' : ''}</span>
                  <Select label={f.he} width="100%" value={String(imp.map[f.key])} onChange={(v) => imp.setColumn(f.key, Number(v))}
                    options={[{ value: '-1', label: f.required ? 'לבחור עמודה…' : 'בלי' }, ...Array.from({ length: imp.columns }, (_, i) => ({ value: String(i), label: imp.colName(i) }))]} />
                </label>
              ))}
            </div>
            <p className="dd-para">{imp.header ? 'עמודות ששמן מוכר הותאמו לבד.' : 'בשורה הראשונה אין שמות עמודות, אז צריך לבחור מה כל עמודה.'}</p>
          </Panel>
        )}
        {step === 2 && <CheckPanel imp={imp} onImport={onImport} onBack={back} />}
        {step === 3 && <DonePanel imp={imp} onAgain={back} onUndo={onUndo} onFix={() => { setAt(2); }} />}
      </Cols>
    </Page>
  );
}

function Paste({ imp, sample, onGo }: { imp: ImportState; sample: string | null; onGo: () => void }) {
  return (
    <DCard fill title="הדביקו כאן את השורות" aside={sample ? <Act onClick={() => { imp.setKind('tasks'); imp.setText(sample); }}>שורות לדוגמה</Act> : undefined}>
      <textarea className="d-input dd-paste" aria-label="השורות מאקסל" value={imp.text} placeholder={PLACEHOLDER[imp.kind]} onChange={(e) => imp.setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && imp.data.length) onGo(); }} />
      <div className="dd-file">
        <label className="d-act dd-file__pick"><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,.xlsx,.xls" onChange={(e) => { imp.loadFile(e.target.files?.[0]); e.target.value = ''; }} />או לבחור קובץ CSV</label>
        <span className="dd-soft">שורה ראשונה עם שמות העמודות (כמו "{FIELDS[imp.kind].map((f) => f.he).slice(0, 3).join('", "')}") עוזרת להתאים אותן לבד.</span>
      </div>
    </DCard>
  );
}

function StartPanel({ imp, onGo, onUndo }: { imp: ImportState; onGo: () => void; onUndo: (b: ImportBatch) => void }) {
  const list = imp.imports.data;
  return (
    <Panel title="מה ייכנס" sub={imp.data.length ? 'השורות נקראו' : 'עוד לא הודבקו שורות'} footer={<Btn kind="primary" disabled={!imp.data.length} onClick={onGo}>המשך</Btn>}>
      {!!imp.data.length && <div className="dd-nums"><Nums items={[{ value: fmt(imp.total), label: 'שורות' }, { value: fmt(imp.columns), label: 'עמודות' }]} /></div>}
      <p className="dd-para dd-para--first">{imp.kind === 'tasks' ? 'המשימות נוספות בשמכם ובלי אחראי, כמו משימה חדשה באפליקציה. אפשר לשייך אותן אחר כך.' : 'הפריטים נוספים לרשימת הקניות בשמכם. פריט דחוף שולח התראה לצוות, כמו באפליקציה.'} כל שורה נבדקת בשרת לפני שהיא נשמרת.</p>
      {imp.imports.loading && !list && <div className="dd-load"><Skeleton lines={3} /></div>}
      {list && <SubTitle>ייבואים אחרונים</SubTitle>}
      {list && !list.length && <p className="dd-none">עוד לא היו ייבואים.</p>}
      {list?.slice(0, 12).map((b) => (
        <div key={b.id} className="dd-item">
          <span className="dd-item__text"><b>{many(b.count, b.kind === 'tasks' ? 'משימה אחת' : 'פריט קניות אחד', b.kind === 'tasks' ? 'משימות' : 'פריטי קניות')}</b><span>{dayTime(b.at)} · {b.by}{b.undone ? ' · בוטל' : ''}</span></span>
          {imp.undoable(b) && <Act danger onClick={() => onUndo(b)}>לבטל את הייבוא</Act>}
        </div>
      ))}
    </Panel>
  );
}

/** The pasted rows. The head says what each column is in the file and what it goes into; a cell is fixed by clicking it. */
function Rows({ imp, step }: { imp: ImportState; step: number }) {
  const [cell, setCell] = useState<string | null>(null);
  const { checked, data, fields, outcomes } = imp;
  const locked = step === 3;
  type R = { c: Checked; cells: string[]; i: number };
  const rows: R[] = data.map((cells, i) => ({ c: checked[i], cells, i }));
  const shownText = (r: R, col: number) => {
    const raw = r.cells[col] || '';
    if (imp.fieldOf(col) === 'dueDate' && typeof r.c.body.dueDate === 'string') { const [y, m, d] = r.c.body.dueDate.split('-'); return `${+d}.${+m}.${y}`; }
    return raw;
  };
  const verdict = (r: R) => {
    const o = outcomes?.find((x) => x.n === r.c.n);
    if (r.c.error) return <span title={r.c.detail}><DTag tone="red">{r.c.error}</DTag></span>;
    if (o) return o.ok ? <DTag tone="green">{o.replayed ? 'כבר נוסף קודם' : 'נוסף'}</DTag> : <span title={o.error}><DTag tone="red">לא נכנס</DTag></span>;
    if (imp.dups.has(r.c.n)) return <DTag tone={imp.skipDups ? 'neutral' : 'amber'}>{imp.skipDups ? 'כפילות, לא ייכנס' : 'כבר קיים'}</DTag>;
    if (r.c.warn) return <span title={r.c.warn}><DTag tone="amber">יישמר בסופר</DTag></span>;
    return <DTag tone="green">תקין</DTag>;
  };
  const columns: Column<R>[] = [
    { key: '#', head: '#', width: 36, soft: true, cell: (r) => r.c.n },
    ...Array.from({ length: imp.columns }, (_, col): Column<R> => {
      const key = imp.fieldOf(col);
      return {
        key: 'c' + col, strong: key === 'title', soft: !key,
        head: (
          <span className={`dd-map${key ? '' : ' dd-map--off'}`}><span className="dd-map__file">בקובץ: {imp.colName(col)}</span>
            {locked ? <b>{fields.find((f) => f.key === key)?.he || 'לא מיובא'}</b>
              : <Select bare label={`מה יש בעמודה ${imp.colName(col)}`} value={key} onChange={(v) => imp.setField(col, v)} options={[...fields.map((f) => ({ value: f.key, label: f.he })), { value: '', label: 'לא לייבא' }]} />}
          </span>
        ),
        cell: (r) => {
          const id = `${r.i}:${col}`;
          if (locked) return <span className="dd-cell__text">{shownText(r, col)}</span>;
          if (cell === id) return <CellInput value={r.cells[col] || ''} onDone={(v) => { setCell(null); if (v !== null && v !== r.cells[col]) imp.fix(r.i, col, v); }} />;
          return <button type="button" className={`dd-cell${r.c.bad && r.c.bad === key ? ' dd-cell--bad' : ''}`} aria-label={`${imp.colName(col)}, שורה ${r.c.n}: ${shownText(r, col) || 'ריק'}. לתיקון`} title={r.c.bad === key ? `${r.c.detail}. לוחצים לתיקון` : 'לוחצים לתיקון'} onClick={() => setCell(id)}>{shownText(r, col) || ' '}</button>;
        },
      };
    }),
    ...(step > 1 ? [{ key: 'v', head: '', width: 150, align: 'end' as const, cell: verdict }] : []),
  ];
  return (
    <>
      {imp.total > MAX_ROWS && <div className="dd-over"><Notice icon="bolt">יש {fmt(imp.total)} שורות. מייבאים עד {MAX_ROWS} בכל פעם: השורות אחרי {MAX_ROWS} לא ייכנסו הפעם.</Notice></div>}
      <div className={step > 1 ? 'dd-rows' : undefined}><Table label="השורות שהודבקו" columns={columns} rows={rows} rowKey={(r) => String(r.i)} rowTone={step > 1 ? (r) => (r.c.error ? 'red' : undefined) : undefined} empty="אין שורות." /></div>
    </>
  );
}
function CellInput({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(value);
  const done = useRef(false);
  const end = (x: string | null) => { if (!done.current) { done.current = true; onDone(x); } };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return <input ref={ref} className="dd-cell__input" aria-label="תיקון" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => end(v)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); end(v); } else if (e.key === 'Escape') { e.stopPropagation(); end(null); } }} />;
}

function CheckPanel({ imp, onImport, onBack }: { imp: ImportState; onImport: () => void; onBack: () => void }) {
  const { kind, good, bad, valid, dups } = imp;
  return (
    <Panel title="מה ייכנס" sub="בדיקה לפני ייבוא" footer={<><Btn kind="primary" icon="upload" disabled={!good.length} onClick={onImport}>ייבוא {imp.count(good.length)}</Btn><Btn onClick={onBack}>חזרה</Btn></>}>
      <div className="dd-nums"><Nums items={[{ value: fmt(imp.checked.length), label: 'שורות' }, { value: fmt(valid.length), label: 'תקינות' }, { value: fmt(bad.length), label: 'עם בעיה' }]} /></div>
      <div>
        <Fact label="לאן">{kind === 'tasks' ? 'משימות' : 'רשימת קניות'}</Fact>
        {kind === 'tasks' && <Fact label="על מי">פנויות, עד שמישהו לוקח</Fact>}
        {kind === 'tasks' && <Fact label="מקומות">{imp.placesText}</Fact>}
        {kind === 'tasks' && !!imp.newPlaces.length && imp.newPlaces.length > 6 && <Small>{imp.newPlaces.join(', ')}</Small>}
        <Fact label="כפילויות">{!dups.size ? 'לא נמצאו' : <>{many(dups.size, 'שורה אחת', 'שורות')}{imp.skipDups ? ', לא ייכנסו' : ''} · <Act onClick={() => imp.setSkipDups(!imp.skipDups)}>{imp.skipDups ? 'להכניס גם אותן' : 'לדלג עליהן'}</Act></>}</Fact>
        {kind === 'shopping' && good.some((c) => c.body.urgent) && <Fact label="דחופים">{many(good.filter((c) => c.body.urgent).length, 'פריט אחד', 'פריטים')}, כל הצוות יקבל התראה</Fact>}
      </div>
      <p className="dd-para">שורות עם בעיה לא ייכנסו. אפשר לתקן אותן כאן בטבלה, או לייבא בלעדיהן. הייבוא נרשם ביומן{imp.canUndo ? ' ואפשר לבטל אותו עד מחר' : ''}.</p>
    </Panel>
  );
}

function DonePanel({ imp, onAgain, onUndo, onFix }: { imp: ImportState; onAgain: () => void; onUndo: (b: ImportBatch) => void; onFix: () => void }) {
  const { progress, batch } = imp;
  if (progress) return (
    <Panel title="מייבא" sub={`${fmt(progress.done)} מתוך ${fmt(progress.total)}`}>
      <span className="d-meter__track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></span>
      <p className="dd-para">לא לסגור את החלון עד שזה נגמר. אם נקטע באמצע, אפשר להדביק שוב: מה שכבר נכנס לא ייכנס פעמיים.</p>
    </Panel>
  );
  const until = batch && !batch.undone ? (daysFromToday(batch.undoUntil) === 1 ? `מחר ב־${hhmm(batch.undoUntil)}` : daysFromToday(batch.undoUntil) === 0 ? `היום ב־${hhmm(batch.undoUntil)}` : `${ddmm(batch.undoUntil)} ב־${hhmm(batch.undoUntil)}`) : '';
  return (
    <Panel title={batch?.undone ? 'הייבוא בוטל' : imp.added ? 'הייבוא נגמר' : 'לא נוסף שום דבר חדש'} sub={imp.kind === 'tasks' ? 'משימות' : 'רשימת קניות'}
      footer={<><Btn kind="primary" onClick={onAgain}>ייבוא נוסף</Btn>{batch && imp.undoable(batch) && <Btn kind="danger" onClick={() => onUndo(batch)}>לבטל את הייבוא</Btn>}</>}>
      <div className="dd-nums"><Nums items={[{ value: fmt(imp.added), label: 'נוספו' }, { value: fmt(imp.replayed), label: 'כבר נוספו קודם' }, { value: fmt(imp.failed), label: 'נכשלו' }]} /></div>
      <Facts>
        {!!imp.bad.length && <Fact label="לא נכנסו">{many(imp.bad.length, 'שורה אחת עם בעיה', 'שורות עם בעיה')}</Fact>}
        {until && <Fact label="אפשר לבטל">עד {until}</Fact>}
      </Facts>
      {(imp.outcomes || []).filter((o) => !o.ok).slice(0, 5).map((o) => <Failed key={o.n} text={`שורה ${o.n}: ${o.error}`} />)}
      {!!imp.failed && <p className="dd-para">אפשר לנסות שוב: מה שכבר נכנס לא ייכנס פעמיים. <Act onClick={() => { onFix(); imp.run(); }}>לנסות שוב</Act></p>}
    </Panel>
  );
}
