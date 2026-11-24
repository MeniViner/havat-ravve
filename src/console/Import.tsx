// ייבוא מאקסל: many tasks or shopping items at once. Copy the rows in Excel (or Google Sheets) and paste them here, or pick
// a CSV file. The columns are matched by their names, every row is checked before anything is saved, and each row goes
// through the same operation as the app (tasks.create, shopping.add). Each row has a fixed idempotency key made from
// the pasted text, so importing the same paste twice never adds anything twice.
// Phone: one column, as before. Computer: four steps with a table (desk/ImportDesk.tsx). The work itself: desk/ImportSpec.tsx.
import { useState } from 'react';
import { Button, Card, ConfirmSheet, Segmented, Strip, Tag, TextAreaField } from '../app/v2/kit';
import { dayTime } from '../app/v2/format';
import { fmt, many, Section } from './shared';
import { source, type ImportBatch } from './source';
import { useWide } from './desk/route';
import { addedText, type Kind, MAX_ROWS, type Notify, PLACEHOLDER, undoneText, useImport } from './desk/ImportSpec';
import { ImportDesk } from './desk/ImportDesk';
import { importSample } from './demo/data';
export { parseTable, toDate } from './desk/ImportSpec';

export function ImportScreen({ notify }: { notify: Notify }) {
  const imp = useImport(notify);
  const wide = useWide();
  const [ask, setAsk] = useState(false);
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);
  const sheets = (
    <>
      <ConfirmSheet open={ask} tone="primary" title={`להוסיף ${imp.count(imp.good.length)}?`} confirmLabel="כן, להוסיף" cancelLabel="חזרה" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); imp.run(); }} text={imp.askText} />
      <ConfirmSheet open={!!undoing} title="לבטל את הייבוא?" confirmLabel="כן, לבטל את הייבוא" cancelLabel="חזרה" onClose={() => setUndoing(null)} onConfirm={async () => { await imp.undo(undoing!); setUndoing(null); }}
        text={undoing ? imp.undoText(undoing) : ''} />
    </>
  );
  if (wide) return <><ImportDesk imp={imp} onImport={() => setAsk(true)} onUndo={setUndoing} sample={source.demo ? importSample : null} />{sheets}</>;
  const { kind, fields, map, data, checked, good, bad, outcomes, progress } = imp;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">ייבוא מאקסל</h1>
          <p className="c-sub">הרבה משימות או פריטי קניות בבת אחת: מעתיקים את השורות באקסל או ב־Google Sheets ומדביקים כאן.</p>
        </div>
      </div>
      <Card pad="lg" className="c-stack c-stack--sm">
        <Segmented mode="radio" size="lg" label="מה מייבאים" value={kind} onChange={(v: Kind) => imp.setKind(v)}
          options={[{ value: 'tasks', label: 'משימות' }, { value: 'shopping', label: 'רשימת קניות' }]} />
        <TextAreaField label="הדביקו כאן את השורות" height={160} value={imp.text} onChange={(e) => imp.setText(e.target.value)}
          placeholder={PLACEHOLDER[kind]} />
        <div className="c-filerow">
          <label className="c-filepick">
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,.xlsx,.xls" onChange={(e) => { imp.loadFile(e.target.files?.[0]); e.target.value = ''; }} />
            <span>או לבחור קובץ CSV</span>
          </label>
          {source.demo && !imp.text && <button type="button" className="c-link" onClick={() => { imp.setKind('tasks'); imp.setText(importSample); }}>שורות לדוגמה</button>}
          <span className="c-note">שורה ראשונה עם שמות העמודות (כמו "{fields.map((f) => f.he).slice(0, 3).join('", "')}") עוזרת להתאים אותן לבד.</span>
        </div>
      </Card>

      {!!data.length && (
        <Section title={`התאמת עמודות · ${many(imp.total, 'שורה אחת', 'שורות')}`}>
          <Card pad="lg" className="c-map">
            {fields.map((f) => (
              <label key={f.key} className="c-param">
                <span className="c-param__label">{f.he}{f.required ? ' *' : ''}</span>
                <select className="c-select" value={map[f.key]} onChange={(e) => imp.setColumn(f.key, Number(e.target.value))}>
                  <option value={-1}>{f.required ? 'לבחור עמודה…' : 'בלי'}</option>
                  {Array.from({ length: imp.columns }, (_, i) => <option key={i} value={i}>{imp.colName(i)}</option>)}
                </select>
              </label>
            ))}
          </Card>
          {imp.total > MAX_ROWS && <Strip icon="bolt">יש {fmt(imp.total)} שורות. מייבאים עד {MAX_ROWS} בכל פעם: השורות אחרי {MAX_ROWS} לא ייכנסו הפעם.</Strip>}
          <Card pad="lg" className="c-flat">
            <p className="c-card-title">{good.length === 1 ? `${imp.count(1)} ${kind === 'tasks' ? 'מוכנה' : 'מוכן'}` : `${imp.count(good.length)} ${kind === 'tasks' ? 'מוכנות' : 'מוכנים'}`}{bad.length ? `, ${many(bad.length, 'שורה אחת עם בעיה (לא תיכנס)', 'שורות עם בעיה (לא ייכנסו)')}` : ''}</p>
            <div className="c-tablewrap">
              <table className="c-table">
                <thead><tr><th>#</th>{fields.filter((f) => map[f.key] >= 0).map((f) => <th key={f.key}>{f.he}</th>)}<th>מצב</th></tr></thead>
                <tbody>{checked.slice(0, 50).map((c) => {
                  const o = outcomes?.find((x) => x.n === c.n);
                  return (
                    <tr key={c.n}>
                      <td className="k-num">{c.n}</td>
                      {fields.filter((f) => map[f.key] >= 0).map((f) => <td key={f.key}>{f.key === 'urgent' ? (c.body.urgent ? 'כן' : '') : f.key === 'place' ? c.place : String(c.body[f.key] ?? '')}</td>)}
                      <td>{c.error ? <Tag tone="urgent">{c.detail}</Tag> : o?.ok && !o.replayed && imp.batch?.undone ? <Tag tone="neutral">בוטל</Tag> : o ? (o.ok ? <Tag tone="paid">{o.replayed ? 'כבר נוסף קודם' : 'נוסף'}</Tag> : <Tag tone="urgent">{o.error}</Tag>) : imp.dups.has(c.n) ? <Tag tone={imp.skipDups ? 'neutral' : 'warm'}>כבר קיים</Tag> : c.warn ? <Tag tone="warm">{c.warn}</Tag> : <Tag tone="neutral">מוכן</Tag>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {checked.length > 50 && <p className="c-note">מוצגות 50 השורות הראשונות.</p>}
          </Card>
          {map.place >= 0 && kind === 'tasks' && <p className="c-note">מקומות: {imp.placesText}.</p>}
          {!!imp.dups.size && <p className="c-note">כפילויות: {imp.dupsText}. <button type="button" className="c-link" onClick={() => imp.setSkipDups(!imp.skipDups)}>{imp.dupsAct}</button></p>}
          {progress
            ? <Card pad="md" className="c-flat">מוסיף… {fmt(progress.done)} מתוך {fmt(progress.total)}</Card>
            : <div><Button size="lg" disabled={!good.length} onClick={() => setAsk(true)}>{`להוסיף ${imp.count(good.length)}`}</Button></div>}
          {outcomes && (
            <p className="c-note">
              {imp.undone ? `הייבוא בוטל: ${undoneText(kind, imp.undone.removed, imp.undone.kept)}` : addedText(kind, imp.added)}
              {!!imp.replayed && `, ${many(imp.replayed, 'שורה אחת כבר נוספה בייבוא קודם', 'כבר נוספו בייבוא קודם של אותן שורות')}`}
              {!!imp.failed && `, ${many(imp.failed, 'שורה אחת נכשלה', 'נכשלו')} (הסיבה בטבלה)`}.
            </p>
          )}
          <p className="c-note">{kind === 'tasks' ? 'המשימות נוספות בשמכם ובלי אחראי, כמו משימה חדשה באפליקציה. אפשר לשייך אותן אחר כך.' : 'הפריטים נוספים לרשימת הקניות בשמכם. פריט דחוף שולח התראה לצוות, כמו באפליקציה.'} כל שורה נבדקת בשרת לפני שהיא נשמרת.</p>
        </Section>
      )}
      {!!imp.imports.data?.length && (
        <Section title="ייבואים אחרונים">
          {imp.imports.data.slice(0, 10).map((b) => (
            <Card key={b.id} pad="md" className="c-flat">
              <b>{many(b.count, b.kind === 'tasks' ? 'משימה אחת' : 'פריט קניות אחד', b.kind === 'tasks' ? 'משימות' : 'פריטי קניות')}</b>
              <p className="c-note">{dayTime(b.at)} · {b.by}{b.undone ? ' · בוטל' : ''}</p>
              {imp.undoable(b) && <Button variant="neutral" onClick={() => setUndoing(b)}>לבטל את הייבוא</Button>}
            </Card>
          ))}
        </Section>
      )}
      {sheets}
    </>
  );
}
