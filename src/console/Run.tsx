// הרצת פעולה: any of the API's operations, as the signed-in owner, without a key. The form is built from the operation's
// own description in the catalog (the same one the server validates with), so it is always the current list. A change
// asks first, and every run is written to the assistant log under the console's name.
import { useMemo, useState } from 'react';
import { Button, Card, ConfirmSheet, EmptyState, Field, ListCard, Row, Segmented, Tag } from '../app/v2/kit';
import { Section, useLoad } from './shared';
import { sec } from './Speed';
import { errorText, source, type CatalogOp, type CatalogParam, type OpResult } from './source';

type Values = Record<string, string>;
const TYPE_HINT: Record<string, string> = { date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:mm, שעון ישראל', time: 'HH:mm', uid: 'מזהה של אדם', id: 'מזהה', email: 'כתובת מייל', stringList: 'כמה ערכים, מופרדים בפסיק', intList: 'מספרים, מופרדים בפסיק' };

/** The fields of an operation: its path ids first, then the query (a read) or the body (a change). */
const fieldsOf = (op: CatalogOp): [string, CatalogParam, 'path' | 'query' | 'body'][] => [
  ...Object.entries(op.pathParams || {}).map(([k, p]) => [k, p, 'path'] as [string, CatalogParam, 'path']),
  ...Object.entries((op.method === 'GET' ? op.params : op.body) || {}).map(([k, p]) => [k, p, op.method === 'GET' ? 'query' : 'body'] as [string, CatalogParam, 'query' | 'body']),
];

/** A value from the form in the type the server expects (empty: left out). */
function typed(p: CatalogParam, raw: string): unknown {
  const v = raw.trim();
  if (!v) return undefined;
  if (p.type === 'bool') return v === 'true';
  if (p.type === 'int' || p.type === 'number') return Number(v);
  if (p.type === 'stringList') return v.split(',').map((x) => x.trim()).filter(Boolean);
  if (p.type === 'intList') return v.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  return v;
}

export function RunScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const cat = useLoad(() => source.catalog());
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<CatalogOp | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const ops = cat.data || [];
    return t ? ops.filter((o) => o.name.toLowerCase().includes(t) || o.he.includes(q.trim())) : ops;
  }, [cat.data, q]);
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">הרצת פעולה</h1>
          <p className="c-sub">כל פעולה של ה־API, בשמכם, בלי מפתח. מה שמשנה נתונים שואל קודם, וכל הרצה נרשמת ביומן.</p>
        </div>
      </div>
      {cat.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את רשימת הפעולות. {cat.error}</Card>}
      {cat.loading && !cat.data && <p className="c-soft">טוען…</p>}
      {cat.data && (
        <div className="c-run">
          <div className="c-stack c-stack--sm">
            <Field label="חיפוש פעולה" labelHidden placeholder={`חיפוש בין ${cat.data.length} פעולות: משימה, קניות, tasks…`} value={q} onChange={(e) => setQ(e.target.value)} />
            {shown.length ? (
              <ListCard className="c-run__list">
                {shown.slice(0, 60).map((o) => (
                  <Row key={o.name} title={o.he} meta={<span className="k-ltr" dir="ltr">{o.name}</span>} className={pick?.name === o.name ? 'c-row-on' : undefined}
                    tags={o.kind === 'write' ? <Tag tone="warm">משנה</Tag> : <Tag tone="neutral">קריאה</Tag>} onClick={() => setPick(o)} />
                ))}
              </ListCard>
            ) : <EmptyState variant="card" icon="search" title="לא נמצאה פעולה" text="נסו מילה אחרת, בעברית או באנגלית." />}
          </div>
          <div>{pick ? <OpForm key={pick.name} op={pick} notify={notify} /> : <Card pad="lg" className="c-flat c-soft">בחרו פעולה מהרשימה.</Card>}</div>
        </div>
      )}
    </>
  );
}

function OpForm({ op, notify }: { op: CatalogOp; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const fields = fieldsOf(op);
  const [vals, setVals] = useState<Values>(() => Object.fromEntries(fields.map(([k, p]) => [k, p.default !== undefined && p.type !== 'bool' ? String(p.default) : ''])));
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<OpResult | null>(null);
  const missing = fields.filter(([k, p]) => p.required && !vals[k]?.trim()).map(([k]) => k);
  const build = () => {
    let path = op.path;
    const query = new URLSearchParams();
    const body: Record<string, unknown> = {};
    for (const [k, p, where] of fields) {
      const v = typed(p, vals[k] || '');
      if (v === undefined) continue;
      if (where === 'path') path = path.replace(`{${k}}`, encodeURIComponent(String(v)));
      else if (where === 'query') query.set(k, Array.isArray(v) ? v.join(',') : String(v));
      else body[k] = v;
    }
    return { path: path + (query.toString() ? '?' + query : ''), body };
  };
  const go = async () => {
    setBusy(true); setAsk(false);
    try {
      const { path, body } = build();
      const r = await source.runOp(op.method, path, op.method === 'POST' ? body : undefined);
      setRes(r);
      if (op.kind === 'write' && r.status < 300) notify('הפעולה בוצעה');
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const set = (k: string, v: string) => setVals((x) => ({ ...x, [k]: v }));
  const j = res?.json as { ok?: boolean; error?: { code?: string; he?: string; message?: string } } | null;
  return (
    <div className="c-stack c-stack--sm">
      <Card pad="lg" className="c-stack c-stack--sm">
        <div>
          <p className="c-card-title">{op.he}</p>
          <p className="c-note"><span className="k-ltr" dir="ltr">{op.method} {op.path}</span> · הרשאה: <span className="k-ltr" dir="ltr">{op.requiredScope}</span></p>
        </div>
        {fields.length ? fields.map(([k, p]) => <ParamField key={k} name={k} p={p} value={vals[k] || ''} onChange={(v) => set(k, v)} />) : <p className="c-note">לפעולה הזאת אין שדות.</p>}
        {!!op.notes?.length && <details className="c-notes"><summary>הערות לפעולה</summary><ul dir="ltr">{op.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
        <Button size="lg" block disabled={busy || missing.length > 0} onClick={() => (op.kind === 'write' ? setAsk(true) : go())}>
          {busy ? 'מריץ…' : missing.length ? `חסר: ${missing.join(', ')}` : op.kind === 'write' ? 'הרצה (משנה נתונים)' : 'הרצה'}
        </Button>
      </Card>
      {res && (
        <Section title="התשובה">
          <Card pad="lg" className="c-stack c-stack--sm">
            <p className="c-note">
              {res.status < 300 ? <Tag tone="paid">הצליחה</Tag> : <Tag tone="urgent">נכשלה</Tag>}
              {' '}<span className="k-ltr" dir="ltr">HTTP {res.status}</span> · {sec(res.ms)}
              {j?.error && <> · {j.error.he || j.error.code}</>}
            </p>
            <pre className="c-json" dir="ltr">{JSON.stringify(res.json, null, 2)}</pre>
            <div><Button variant="neutral" icon="file" onClick={() => navigator.clipboard?.writeText(JSON.stringify(res.json, null, 2)).then(() => notify('הועתק'), () => {})}>העתקה</Button></div>
          </Card>
        </Section>
      )}
      {ask && (
        <ConfirmSheet open title="להריץ את הפעולה?" text={`"${op.he}" תשנה נתונים אמיתיים של החווה, ותירשם ביומן בשם הקונסולה.`} confirmLabel="כן, להריץ"
          onClose={() => setAsk(false)} onConfirm={go} />
      )}
    </div>
  );
}

function ParamField({ name, p, value, onChange }: { name: string; p: CatalogParam; value: string; onChange: (v: string) => void }) {
  const label = <><span className="k-ltr" dir="ltr">{name}</span>{p.required ? ' *' : ''}{p.he ? <span className="c-soft"> · {p.he}</span> : null}</>;
  if (p.type === 'bool') {
    return (
      <div className="c-param">
        <span className="c-param__label">{label}</span>
        <Segmented mode="radio" label={name} value={value || 'unset'} onChange={(v) => onChange(v === 'unset' ? '' : v)}
          options={[{ value: 'unset', label: p.default !== undefined ? `ברירת מחדל (${p.default ? 'כן' : 'לא'})` : 'לא לשלוח' }, { value: 'true', label: 'כן' }, { value: 'false', label: 'לא' }]} />
      </div>
    );
  }
  if (p.type === 'enum' && p.values) {
    return (
      <label className="c-param">
        <span className="c-param__label">{label}</span>
        <select className="c-select" value={value} onChange={(e) => onChange(e.target.value)} dir="ltr">
          <option value="">{p.required ? 'לבחור…' : 'לא לשלוח'}</option>
          {p.values.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
    );
  }
  const type = p.type === 'date' ? 'date' : p.type === 'time' ? 'time' : p.type === 'int' || p.type === 'number' ? 'number' : 'text';
  const hint = [TYPE_HINT[p.type], p.type === 'int' || p.type === 'number' ? `${p.min} עד ${p.max}` : p.max && p.type === 'string' ? `עד ${p.max} תווים` : ''].filter(Boolean).join(' · ');
  return (
    <div className="c-param">
      <Field label={label} hint={hint || undefined} type={type} value={value} onChange={(e) => onChange(e.target.value)} ltr={p.type !== 'string'} />
    </div>
  );
}
