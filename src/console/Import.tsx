// ייבוא מאקסל: many tasks or shopping items at once. Copy the rows in Excel (or Google Sheets) and paste them here, or pick
// a CSV file. The columns are matched by their names, every row is checked before anything is saved, and each row goes
// through the same operation as the app (tasks.create, shopping.add). Each row has a fixed idempotency key made from
// the pasted text, so importing the same paste twice never adds anything twice.
import { useMemo, useState } from 'react';
import { Button, Card, ConfirmSheet, Segmented, Strip, Tag, TextAreaField } from '../app/v2/kit';
import { fmt, Section } from './shared';
import { errorText, source } from './source';

type Kind = 'tasks' | 'shopping';
type FieldDef = { key: string; he: string; required?: boolean; names: string[] };
const FIELDS: Record<Kind, FieldDef[]> = {
  tasks: [
    { key: 'title', he: 'המשימה', required: true, names: ['כותרת', 'משימה', 'המשימה', 'שם', 'מה', 'title', 'task', 'name'] },
    { key: 'note', he: 'הערה', names: ['הערה', 'הערות', 'פירוט', 'תיאור', 'note', 'notes', 'description'] },
    { key: 'dueDate', he: 'תאריך יעד', names: ['תאריך', 'תאריך יעד', 'עד', 'עד מתי', 'מועד', 'due', 'date', 'duedate'] },
    { key: 'urgent', he: 'דחוף', names: ['דחוף', 'דחיפות', 'urgent'] },
  ],
  shopping: [
    { key: 'title', he: 'מה לקנות', required: true, names: ['מה לקנות', 'פריט', 'מוצר', 'שם', 'כותרת', 'מה', 'item', 'title', 'name', 'product'] },
    { key: 'qty', he: 'כמות', names: ['כמות', 'qty', 'quantity', 'amount'] },
    { key: 'category', he: 'איפה קונים', names: ['קטגוריה', 'סוג', 'איפה', 'חנות', 'category'] },
    { key: 'urgent', he: 'דחוף', names: ['דחוף', 'דחיפות', 'urgent'] },
    { key: 'note', he: 'הערה', names: ['הערה', 'הערות', 'note', 'notes'] },
    { key: 'link', he: 'קישור', names: ['קישור', 'לינק', 'link', 'url'] },
  ],
};
const MAX_ROWS = 200;
const CATEGORY: Record<string, string> = { סופר: 'super', super: 'super', 'חומרי בניין': 'building', בניין: 'building', building: 'building', אינטרנט: 'online', אונליין: 'online', online: 'online', מסירה: 'giveaway', 'מוצרי מסירה': 'giveaway', giveaway: 'giveaway' };

/** Rows from pasted Excel cells (tabs) or a CSV file (commas or semicolons, "quoted" cells). */
export function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = first.includes('\t') ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

/** 2026-12-01, 1/12/2026, 1.12.26, or an Excel day number (46000) → YYYY-MM-DD; null when it is not a date. */
export function toDate(v: string): string | null {
  const s = v.trim();
  let m: RegExpExecArray | null;
  const iso = (y: number, mo: number, d: number) => {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  };
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s))) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}$/.test(s)) { const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400_000); return dt.toISOString().slice(0, 10); }
  return null;
}
const yes = (v: string) => /^(כן|v|✓|✔|x|true|1|yes|דחוף)$/i.test(v.trim());
const no = (v: string) => !v.trim() || /^(לא|false|0|no|-)$/i.test(v.trim());
const norm = (s: string) => s.trim().toLowerCase().replace(/["'׳״]/g, '');

type Checked = { n: number; body: Record<string, unknown>; error: string | null; warn: string | null };
function checkRow(kind: Kind, map: Record<string, number>, cells: string[], n: number): Checked {
  const get = (k: string) => (map[k] >= 0 ? cells[map[k]] || '' : '');
  const body: Record<string, unknown> = {};
  let warn: string | null = null;
  const title = get('title');
  if (!title) return { n, body, error: 'אין כותרת', warn };
  if (title.length > 200) return { n, body, error: 'כותרת ארוכה מ־200 תווים', warn };
  body.title = title;
  const u = get('urgent');
  if (u && !yes(u) && !no(u)) return { n, body, error: `"דחוף" לא ברור: ${u}`, warn };
  if (yes(u)) body.urgent = true;
  const note = get('note');
  if (note) { if (note.length > (kind === 'tasks' ? 4000 : 1000)) return { n, body, error: 'ההערה ארוכה מדי', warn }; body.note = note; }
  if (kind === 'tasks') {
    const d = get('dueDate');
    if (d) { const iso = toDate(d); if (!iso) return { n, body, error: `תאריך לא מובן: ${d}`, warn }; body.dueDate = iso; }
  } else {
    const q = get('qty'); if (q) { if (q.length > 40) return { n, body, error: 'הכמות ארוכה מדי', warn }; body.qty = q; }
    const c = get('category');
    if (c) { const cat = CATEGORY[norm(c)] || CATEGORY[c.trim()]; if (cat) body.category = cat; else warn = `"${c}" לא מוכר, יישמר בסופר`; }
    const l = get('link'); if (l) { if (!/^https:\/\/\S+$/.test(l)) return { n, body, error: 'הקישור צריך להתחיל ב־https://', warn }; body.link = l; }
  }
  return { n, body, error: null, warn };
}

/**
 * A fixed UUID for a row, from what the row says (not where it sits or what else was pasted): importing again after
 * fixing one row, adding a line or changing a column replays the rows already in instead of adding them twice.
 */
async function rowKey(seed: string, i: number): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed + '\n#' + i)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Outcome = { n: number; ok: boolean; replayed: boolean; error: string };

export function ImportScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [kind, setKind] = useState<Kind>('tasks');
  const [text, setText] = useState('');
  const [ask, setAsk] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const table = useMemo(() => parseTable(text), [text]);
  const fields = FIELDS[kind];
  // a first row that names at least one column is the header; otherwise the first column is the title
  const header = useMemo(() => {
    const first = (table[0] || []).map(norm);
    return fields.some((f) => f.names.some((nm) => first.includes(norm(nm)))) ? first : null;
  }, [table, fields]);
  const autoMap = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, header ? header.findIndex((h) => f.names.some((nm) => norm(nm) === h)) : f.key === 'title' ? 0 : -1])), [fields, header]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const map = { ...autoMap, ...overrides };
  const data = header ? table.slice(1) : table;
  const columns = Math.max(0, ...table.map((r) => r.length));
  const colName = (i: number) => (header ? (table[0][i] || `עמודה ${i + 1}`) : `עמודה ${i + 1}`);
  const checked = useMemo(() => data.slice(0, MAX_ROWS).map((cells, i) => checkRow(kind, map, cells, i + 1)), [data, kind, JSON.stringify(map)]);
  const good = checked.filter((c) => !c.error);
  const bad = checked.filter((c) => c.error);
  const noun = kind === 'tasks' ? 'משימות' : 'פריטים';

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { notify('קובץ אקסל צריך להישמר קודם בתור CSV, או פשוט להעתיק את השורות ולהדביק כאן', 'alert'); return; }
    if (f.size > 512 * 1024) { notify('הקובץ גדול מדי (עד חצי מגה)', 'alert'); return; }
    // a CSV saved by Excel in Hebrew Windows is often Windows-1255, not UTF-8
    const buf = await f.arrayBuffer();
    let t: string;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('windows-1255').decode(buf); }
    setText(t.replace(/^\uFEFF/, '')); setOutcomes(null); setOverrides({});
  };
  const run = async () => {
    setAsk(false);
    const op = kind === 'tasks' ? 'tasks.create' : 'shopping.add';
    // identical rows stay apart by how many times the same row came before
    const seen = new Map<string, number>();
    const seedOf = new Map<number, string>();
    for (const c of good) {
      const base = kind + '\n' + JSON.stringify(Object.keys(c.body).sort().map((k) => [k, c.body[k]]));
      const i = seen.get(base) || 0;
      seen.set(base, i + 1);
      seedOf.set(c.n, base + '\n' + i);
    }
    const out: Outcome[] = [];
    setProgress({ done: 0, total: good.length });
    // three at a time: quick, and far below the server's 240 a minute
    for (let i = 0; i < good.length; i += 3) {
      const part = good.slice(i, i + 3);
      const res = await Promise.all(part.map(async (c) => {
        try {
          const r = await source.runOp('POST', `/v1/actions/${op}`, c.body, await rowKey(seedOf.get(c.n)!, 0));
          const j = r.json as { data?: { replayed?: boolean }; error?: { he?: string; message?: string } } | null;
          return { n: c.n, ok: r.status < 300, replayed: !!j?.data?.replayed, error: r.status < 300 ? '' : j?.error?.he || j?.error?.message || `HTTP ${r.status}` };
        } catch (e) { return { n: c.n, ok: false, replayed: false, error: errorText(e) }; }
      }));
      out.push(...res);
      setProgress({ done: out.length, total: good.length });
    }
    setOutcomes(out); setProgress(null);
    const added = out.filter((o) => o.ok && !o.replayed).length;
    notify(added ? `נוספו ${fmt(added)} ${noun}` : 'לא נוסף שום דבר חדש', added ? 'info' : 'alert');
  };

  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">ייבוא מאקסל</h1>
          <p className="c-sub">הרבה משימות או פריטי קניות בבת אחת: מעתיקים את השורות באקסל או ב־Google Sheets ומדביקים כאן.</p>
        </div>
      </div>
      <Card pad="lg" className="c-stack c-stack--sm">
        <Segmented mode="radio" size="lg" label="מה מייבאים" value={kind} onChange={(v: Kind) => { setKind(v); setOverrides({}); setOutcomes(null); }}
          options={[{ value: 'tasks', label: 'משימות' }, { value: 'shopping', label: 'רשימת קניות' }]} />
        <TextAreaField label="הדביקו כאן את השורות" height={160} value={text} onChange={(e) => { setText(e.target.value); setOutcomes(null); setOverrides({}); }}
          placeholder={kind === 'tasks' ? 'משימה\tתאריך יעד\tדחוף\nלתקן את הגדר בצפון\t1/12/2026\tכן\nלהאכיל את העזים\t\t' : 'מה לקנות\tכמות\tאיפה קונים\nחציר\t3 חבילות\tסופר\nברגים לעץ\t\tחומרי בניין'} />
        <div className="c-filerow">
          <label className="c-filepick">
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,.xlsx,.xls" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
            <span>או לבחור קובץ CSV</span>
          </label>
          <span className="c-note">שורה ראשונה עם שמות העמודות (כמו "{fields.map((f) => f.he).slice(0, 3).join('", "')}") עוזרת להתאים אותן לבד.</span>
        </div>
      </Card>

      {!!data.length && (
        <Section title={`התאמת עמודות · ${fmt(data.length)} שורות`}>
          <Card pad="lg" className="c-map">
            {fields.map((f) => (
              <label key={f.key} className="c-param">
                <span className="c-param__label">{f.he}{f.required ? ' *' : ''}</span>
                <select className="c-select" value={map[f.key]} onChange={(e) => setOverrides((o) => ({ ...o, [f.key]: Number(e.target.value) }))}>
                  <option value={-1}>{f.required ? 'לבחור עמודה…' : 'בלי'}</option>
                  {Array.from({ length: columns }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
                </select>
              </label>
            ))}
          </Card>
          {data.length > MAX_ROWS && <Strip icon="bolt">יש {fmt(data.length)} שורות. מייבאים עד {MAX_ROWS} בכל פעם: השורות אחרי {MAX_ROWS} לא ייכנסו הפעם.</Strip>}
          <Card pad="lg" className="c-flat">
            <p className="c-card-title">{fmt(good.length)} {noun} מוכנים{bad.length ? `, ${fmt(bad.length)} שורות עם בעיה (לא ייכנסו)` : ''}</p>
            <div className="c-tablewrap">
              <table className="c-table">
                <thead><tr><th>#</th>{fields.filter((f) => map[f.key] >= 0).map((f) => <th key={f.key}>{f.he}</th>)}<th>מצב</th></tr></thead>
                <tbody>{checked.slice(0, 50).map((c) => {
                  const o = outcomes?.find((x) => x.n === c.n);
                  return (
                    <tr key={c.n}>
                      <td className="k-num">{c.n}</td>
                      {fields.filter((f) => map[f.key] >= 0).map((f) => <td key={f.key}>{f.key === 'urgent' ? (c.body.urgent ? 'כן' : '') : String(c.body[f.key] ?? '')}</td>)}
                      <td>{c.error ? <Tag tone="urgent">{c.error}</Tag> : o ? (o.ok ? <Tag tone="paid">{o.replayed ? 'כבר נוסף קודם' : 'נוסף'}</Tag> : <Tag tone="urgent">{o.error}</Tag>) : c.warn ? <Tag tone="warm">{c.warn}</Tag> : <Tag tone="neutral">מוכן</Tag>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {checked.length > 50 && <p className="c-note">מוצגות 50 השורות הראשונות.</p>}
          </Card>
          {progress
            ? <Card pad="md" className="c-flat">מוסיף… {fmt(progress.done)} מתוך {fmt(progress.total)}</Card>
            : <div><Button size="lg" disabled={!good.length} onClick={() => setAsk(true)}>{`להוסיף ${fmt(good.length)} ${noun}`}</Button></div>}
          {outcomes && (
            <p className="c-note">
              נוספו {fmt(outcomes.filter((o) => o.ok && !o.replayed).length)}
              {outcomes.some((o) => o.replayed) && <>, {fmt(outcomes.filter((o) => o.replayed).length)} כבר נוספו בייבוא קודם של אותן שורות</>}
              {outcomes.some((o) => !o.ok) && <>, {fmt(outcomes.filter((o) => !o.ok).length)} נכשלו (הסיבה בטבלה)</>}.
            </p>
          )}
          <p className="c-note">{kind === 'tasks' ? 'המשימות נוספות בשמכם ובלי אחראי, כמו משימה חדשה באפליקציה. אפשר לשייך אותן אחר כך.' : 'הפריטים נוספים לרשימת הקניות בשמכם. פריט דחוף שולח התראה לצוות, כמו באפליקציה.'} כל שורה נבדקת בשרת לפני שהיא נשמרת.</p>
        </Section>
      )}
      {ask && (
        <ConfirmSheet open tone="primary" title={`להוסיף ${fmt(good.length)} ${noun}?`} confirmLabel="כן, להוסיף" onClose={() => setAsk(false)} onConfirm={run}
          text={`${kind === 'tasks' ? 'הן ייכנסו' : 'הם ייכנסו'} ל${kind === 'tasks' ? 'משימות' : 'רשימת הקניות'} באפליקציה עכשיו.${kind === 'shopping' && good.some((c) => c.body.urgent) ? ' על הפריטים הדחופים כל הצוות יקבל התראה.' : ''} אם תייבאו שוב אותן שורות, גם אחרי תיקון, מה שכבר נכנס לא ייכנס פעמיים.`} />
      )}
    </>
  );
}
