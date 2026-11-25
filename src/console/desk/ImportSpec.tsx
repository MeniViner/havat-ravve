// ייבוא מאקסל: what the phone and the computer share. Reading pasted rows, matching columns, checking every row, places by
// name (missing ones are made, after the owner saw them in the summary), the import itself and undoing it until tomorrow.
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, useLoad } from '../shared';
import { errorText, source, type ImportBatch } from '../source';
import { nowMs } from '../../app/clock';

export type Notify = (t: string, tone?: 'info' | 'alert') => void;
export type Kind = 'tasks' | 'shopping';
export type FieldDef = { key: string; he: string; required?: boolean; names: string[] };
export const FIELDS: Record<Kind, FieldDef[]> = {
  tasks: [
    { key: 'title', he: 'משימה', required: true, names: ['כותרת', 'משימה', 'המשימה', 'שם', 'מה', 'title', 'task', 'name'] },
    { key: 'note', he: 'הערה', names: ['הערה', 'הערות', 'פירוט', 'תיאור', 'note', 'notes', 'description'] },
    { key: 'dueDate', he: 'עד מתי', names: ['תאריך', 'תאריך יעד', 'עד', 'עד מתי', 'מועד', 'due', 'date', 'duedate'] },
    { key: 'place', he: 'מקום', names: ['מקום', 'איפה', 'מיקום', 'place', 'location', 'where'] },
    { key: 'urgent', he: 'דחוף', names: ['דחוף', 'דחיפות', 'urgent'] },
  ],
  shopping: [
    { key: 'title', he: 'מה לקנות', required: true, names: ['מה לקנות', 'פריט', 'מוצר', 'שם', 'כותרת', 'מה', 'item', 'title', 'name', 'product'] },
    { key: 'qty', he: 'כמות', names: ['כמות', 'qty', 'quantity', 'amount'] },
    { key: 'category', he: 'איפה קונים', names: ['קטגוריה', 'סוג', 'איפה', 'איפה קונים', 'חנות', 'category'] },
    { key: 'urgent', he: 'דחוף', names: ['דחוף', 'דחיפות', 'urgent'] },
    { key: 'note', he: 'הערה', names: ['הערה', 'הערות', 'note', 'notes'] },
    { key: 'link', he: 'קישור', names: ['קישור', 'לינק', 'link', 'url'] },
  ],
};
export const MAX_ROWS = 200;
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
export const norm = (s: string) => s.trim().toLowerCase().replace(/["'׳״]/g, '');


export type Checked = { n: number; body: Record<string, unknown>; place: string; error: string | null; detail: string; bad: string | null; warn: string | null };
/** Every row is checked before anything is saved. `error` is short enough for a tag; `detail` says it in full; `bad` is the field to fix. */
function checkRow(kind: Kind, map: Record<string, number>, cells: string[], n: number): Checked {
  const get = (k: string) => (map[k] >= 0 ? cells[map[k]] || '' : '');
  const out: Checked = { n, body: {}, place: '', error: null, detail: '', bad: null, warn: null };
  const fail = (bad: string, error: string, detail = error) => ({ ...out, bad, error, detail });
  const body = out.body;
  const title = get('title');
  const noun = kind === 'tasks' ? 'חסר שם משימה' : 'חסר שם פריט';
  if (!title) return fail('title', noun);
  if (title.length > 200) return fail('title', 'שם ארוך מדי', 'השם ארוך מ־200 תווים');
  body.title = title;
  const u = get('urgent');
  if (u && !yes(u) && !no(u)) return fail('urgent', '"דחוף" לא ברור', `"דחוף" לא ברור: ${u}`);
  if (yes(u)) body.urgent = true;
  const note = get('note');
  if (note) { if (note.length > (kind === 'tasks' ? 4000 : 1000)) return fail('note', 'הערה ארוכה מדי', 'ההערה ארוכה מדי'); body.note = note; }
  if (kind === 'tasks') {
    const d = get('dueDate');
    if (d) { const iso = toDate(d); if (!iso) return fail('dueDate', 'תאריך לא מובן', `תאריך לא מובן: ${d}`); body.dueDate = iso; }
    const p = get('place').replace(/\s+/g, ' ');
    if (p.length > 120) return fail('place', 'מקום ארוך מדי', 'שם המקום ארוך מ־120 תווים');
    out.place = p;
  } else {
    const q = get('qty'); if (q) { if (q.length > 40) return fail('qty', 'כמות ארוכה מדי', 'הכמות ארוכה מדי'); body.qty = q; }
    const c = get('category');
    if (c) { const cat = CATEGORY[norm(c)] || CATEGORY[c.trim()]; if (cat) body.category = cat; else out.warn = `"${c}" לא מוכר, יישמר בסופר`; }
    const l = get('link'); if (l) { if (!/^https:\/\/\S+$/.test(l)) return fail('link', 'קישור לא תקין', 'הקישור צריך להתחיל ב־https://'); body.link = l; }
  }
  return out;
}

/**
 * A fixed UUID for a row, from what the row says (not where it sits or what else was pasted): importing again after
 * fixing one row, adding a line or changing a column replays the rows already in instead of adding them twice.
 */
async function rowKey(seed: string, i: number): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed + '\n#' + i)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}


/* ───────── places ───────── */
type Known = { id: string; name: string; lat: number | null; lng: number | null };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** The same places through the data browser: at least what it lists first. */
const browsePlaces = async (): Promise<Known[]> => (await source.dataDocs('places')).items.map((x) => ({ id: x.id, name: x.title, lat: num(x.fields?.lat), lng: num(x.fields?.lng) }));
async function loadPlaces(): Promise<Known[]> {
  const out: Known[] = [];
  let cursor = '';
  // a farm has tens of places; five pages of a hundred is far past it
  for (let i = 0; i < 5; i++) {
    const r = await source.runOp('GET', `/v1/places?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const d = (r.json as { data?: { items?: Record<string, unknown>[]; nextCursor?: string | null } } | null)?.data;
    if (r.status >= 300 || !Array.isArray(d?.items)) {
      if (i) break;
      return browsePlaces();
    }
    out.push(...d!.items!.map((x) => ({ id: String(x.id), name: String(x.name || ''), lat: num(x.lat), lng: num(x.lng) })));
    if (!d!.nextCursor) break;
    cursor = d!.nextCursor;
  }
  // a list without where they are cannot say where a new one goes
  if (!out.some((p) => p.lat !== null)) { const more = await browsePlaces().catch(() => []); if (more.some((p) => p.lat !== null)) return more; }
  return out;
}
/** A new place is marked in the middle of the ones the farm already has, until someone moves it in the app. */
function middle(places: Known[]): { lat: number; lng: number } | null {
  const at = places.filter((p) => p.lat !== null && p.lng !== null);
  if (!at.length) return null;
  const avg = (f: (p: Known) => number) => Math.round((at.reduce((s, p) => s + f(p), 0) / at.length) * 1e6) / 1e6;
  return { lat: avg((p) => p.lat!), lng: avg((p) => p.lng!) };
}

/** What an undo did: how many went, and how many stayed because someone already changed them. */
export function undoneText(kind: Kind, removed: number, kept: number): string {
  const she = kind === 'tasks';
  const out = !removed ? 'שום דבר לא הוסר' : removed === 1 ? (she ? 'משימה אחת הוסרה' : 'פריט אחד הוסר') : `${fmt(removed)} הוסרו`;
  return out + (!kept ? '' : kept === 1 ? (she ? ', אחת נשארה כי כבר שינו אותה באפליקציה' : ', אחד נשאר כי כבר שינו אותו באפליקציה') : `, ${fmt(kept)} נשארו כי כבר שינו ${she ? 'אותן' : 'אותם'} באפליקציה`);
}
/** "נוספה משימה אחת" / "נוספו 12 פריטים" */
export const addedText = (kind: Kind, n: number) => (n === 1 ? (kind === 'tasks' ? 'נוספה משימה אחת' : 'נוסף פריט אחד') : `נוספו ${fmt(n)} ${kind === 'tasks' ? 'משימות' : 'פריטים'}`);
export type Outcome = { n: number; ok: boolean; replayed: boolean; error: string; id: string };
const dupKey = (c: Checked) => JSON.stringify([norm(String(c.body.title)), c.body.dueDate || '', norm(c.place)]);

export function useImport(notify: Notify) {
  const [kind, setKindState] = useState<Kind>('tasks');
  const [text, setTextState] = useState('');
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  // a row that repeats something is left out until the owner says otherwise
  const [skipDups, setSkipDups] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [undone, setUndone] = useState<{ removed: number; kept: number } | null>(null);
  // after an import (or undoing one) what is open in the app has changed: asked again with the next rows
  const [epoch, setEpoch] = useState(0);
  const moved = useRef(false);
  const reset = () => {
    setOutcomes(null); setBatch(null); setUndone(null); setOverrides({}); setFixes({}); setSkipDups(true);
    if (moved.current) { moved.current = false; asked.current.delete('tasks'); asked.current.delete('shopping'); setOpenTitles(null); setEpoch((x) => x + 1); }
  };
  const setText = (t: string) => { setTextState(t); reset(); };
  const setKind = (k: Kind) => { setKindState(k); reset(); };

  const table = useMemo(() => parseTable(text), [text]);
  const fields = FIELDS[kind];
  // a first row that names at least one column is the header; otherwise the first column is the title
  const header = useMemo(() => {
    const first = (table[0] || []).map(norm);
    return fields.some((f) => f.names.some((nm) => first.includes(norm(nm)))) ? first : null;
  }, [table, fields]);
  const autoMap = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, header ? header.findIndex((h) => f.names.some((nm) => norm(nm) === h)) : f.key === 'title' ? 0 : -1])), [fields, header]);
  const map: Record<string, number> = { ...autoMap, ...overrides };
  const mapKey = JSON.stringify(map);
  const columns = Math.max(0, ...table.map((r) => r.length));
  const colName = (i: number) => (header ? (table[0][i] || `עמודה ${i + 1}`) : `עמודה ${i + 1}`);
  const total = header ? table.length - 1 : table.length;
  // the pasted cells, with what was fixed in the table
  const data = useMemo(() => (header ? table.slice(1) : table).slice(0, MAX_ROWS).map((cells, r) => Array.from({ length: columns }, (_, c) => fixes[`${r}:${c}`] ?? cells[c] ?? '')), [table, header, columns, fixes]);
  const checked = useMemo(() => data.map((cells, i) => checkRow(kind, map, cells, i + 1)), [data, kind, mapKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fix = (row: number, col: number, v: string) => { setFixes((f) => ({ ...f, [`${row}:${col}`]: v.trim() })); setOutcomes(null); setBatch(null); };
  /** What a file column is, from the table's head: one field, or nothing. */
  const fieldOf = (col: number) => fields.find((f) => map[f.key] === col)?.key || '';
  const setField = (col: number, key: string) => { setOutcomes(null); setBatch(null); setOverrides((o) => { const n = { ...o }; for (const f of fields) if (map[f.key] === col) n[f.key] = -1; if (key) n[key] = col; return n; }); };
  const setColumn = (key: string, col: number) => { setOutcomes(null); setBatch(null); setOverrides((o) => ({ ...o, [key]: col })); };

  // what is open in the app already, to say which rows repeat it (asked once per kind, when there is something to check)
  const ready = !!data.length;
  const [openTitles, setOpenTitles] = useState<{ kind: Kind; titles: Set<string> } | null>(null);
  const [places, setPlaces] = useState<Known[] | null>(null);
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || asked.current.has(kind)) return;
    asked.current.add(kind);
    source.dataDocs(kind).then((r) => setOpenTitles({ kind, titles: new Set(r.items.filter((x) => x.fields && x.fields.done !== true && x.fields.bought !== true).map((x) => norm(x.title))) })).catch(() => setOpenTitles({ kind, titles: new Set() }));
  }, [ready, kind, epoch]);
  const wantPlaces = kind === 'tasks' && map.place >= 0 && ready;
  useEffect(() => {
    if (!wantPlaces || asked.current.has('places')) return;
    asked.current.add('places');
    loadPlaces().then(setPlaces).catch(() => { asked.current.delete('places'); setPlaces(null); });
  }, [wantPlaces]);

  const dups = useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Set<number>();
    for (const c of checked) {
      if (c.error) continue;
      const k = dupKey(c);
      if (seen.has(k) || (openTitles?.kind === kind && openTitles.titles.has(norm(String(c.body.title))))) out.add(c.n);
      seen.set(k, c.n);
    }
    return out;
  }, [checked, openTitles, kind]);
  // what will enter: the valid rows, without the repeats (unless the owner wants them in)
  const good = checked.filter((c) => !c.error && !(skipDups && dups.has(c.n)));
  const bad = checked.filter((c) => c.error);
  const centre = useMemo(() => (places ? middle(places) : null), [places]);
  const byName = useMemo(() => new Map((places || []).map((p) => [norm(p.name), p])), [places]);
  const named = [...new Map(good.filter((c) => c.place).map((c) => [norm(c.place), c.place])).values()];
  const newPlaces = places ? named.filter((p) => !byName.has(norm(p))) : [];
  const noun = kind === 'tasks' ? 'משימות' : 'פריטים';
  const count = (n: number) => (n === 1 ? (kind === 'tasks' ? 'משימה אחת' : 'פריט אחד') : `${fmt(n)} ${noun}`);

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { notify('קובץ אקסל צריך להישמר קודם בתור CSV, או פשוט להעתיק את השורות ולהדביק כאן', 'alert'); return; }
    if (f.size > 512 * 1024) { notify('הקובץ גדול מדי (עד חצי מגה)', 'alert'); return; }
    // a CSV saved by Excel in Hebrew Windows is often Windows-1255, not UTF-8
    const buf = await f.arrayBuffer();
    let t: string;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('windows-1255').decode(buf); }
    setText(t.replace(/^\uFEFF/, ''));
  };

  const imports = useLoad(() => source.imports().catch(() => null));
  const canUndo = !!imports.data;
  const run = async () => {
    const op = kind === 'tasks' ? 'tasks.create' : 'shopping.add';
    const out: Outcome[] = [];
    setProgress({ done: 0, total: good.length });
    const failed = (c: Checked, error: string): Outcome => ({ n: c.n, ok: false, replayed: false, error, id: '' });
    // places first: the ones that are missing are made, each once
    const placeId = new Map<string, string>([...byName].map(([k, p]) => [k, p.id]));
    const made: Known[] = [];
    if (centre) for (const p of newPlaces) {
      try {
        const r = await source.action('places.add', { name: p, ...centre });
        const id = String(r.placeId || (r.record as { id?: string } | undefined)?.id || '');
        if (id) { placeId.set(norm(p), id); made.push({ id, name: p, ...centre }); }
      } catch { /* its rows say so below */ }
    }
    if (made.length) setPlaces((x) => [...(x || []), ...made]);
    // after an import of this kind was undone its rows are new again, not a repeat the server would skip
    const cancelled = (imports.data || []).filter((b) => b.undone && b.kind === kind).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    const again = cancelled ? '\n' + cancelled.id : '';
    // identical rows stay apart by how many times the same row came before
    const seen = new Map<string, number>();
    const seedOf = new Map<number, string>();
    for (const c of good) {
      const base = kind + '\n' + JSON.stringify([...Object.keys(c.body).sort().map((k) => [k, c.body[k]]), ...(c.place ? [['place', norm(c.place)]] : [])]);
      const i = seen.get(base) || 0;
      seen.set(base, i + 1);
      seedOf.set(c.n, base + '\n' + i + again);
    }
    // three at a time: quick, and far below the server's 240 a minute
    for (let i = 0; i < good.length; i += 3) {
      const part = good.slice(i, i + 3);
      const res = await Promise.all(part.map(async (c): Promise<Outcome> => {
        const pid = c.place ? placeId.get(norm(c.place)) : undefined;
        // a place that should have been made and was not: the row waits for another try instead of going in without it
        if (c.place && !pid && centre) return failed(c, 'המקום לא נשמר, נסו שוב');
        try {
          const r = await source.runOp('POST', `/v1/actions/${op}`, { ...c.body, ...(pid ? { placeId: pid } : {}) }, await rowKey(seedOf.get(c.n)!, 0));
          const j = r.json as { data?: { replayed?: boolean; taskId?: string; itemId?: string; record?: { id?: string } }; error?: { code?: string; he?: string } } | null;
          const id = String(j?.data?.taskId || j?.data?.itemId || j?.data?.record?.id || '');
          return r.status < 300 ? { n: c.n, ok: true, replayed: !!j?.data?.replayed, error: '', id } : failed(c, j?.error?.he || 'השרת לא קיבל את השורה');
        } catch (e) { return failed(c, errorText(e)); }
      }));
      out.push(...res);
      setProgress({ done: out.length, total: good.length });
    }
    const fresh = out.filter((o) => o.ok && !o.replayed);
    let saved: ImportBatch | null = null;
    const ids = fresh.map((o) => o.id).filter(Boolean);
    if (ids.length) { try { saved = await source.saveImport(kind, ids); } catch { /* the rows are in; only the undo is missing */ } }
    setOutcomes(out); setProgress(null); setBatch(saved); setUndone(null);
    moved.current = true;
    imports.reload();
    notify(fresh.length ? addedText(kind, fresh.length) : 'לא נוסף שום דבר חדש', fresh.length ? 'info' : 'alert');
  };
  const undo = async (b: ImportBatch) => {
    try {
      let removed = 0, kept = 0;
      // the server takes a part at a time; `left` says how many are still to go
      for (let i = 0; i < 60; i++) {
        const r = await source.undoImport(b.id);
        removed += r.removed; kept += r.kept;
        if (!r.left) break;
      }
      if (batch?.id === b.id) { setBatch({ ...b, undone: true }); setUndone({ removed, kept }); }
      moved.current = true;
      notify(`הייבוא בוטל: ${undoneText(b.kind, removed, kept)}`);
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { imports.reload(); }
  };
  const undoable = (b: ImportBatch) => !b.undone && Date.parse(b.undoUntil) > nowMs();
  const noPlace = good.filter((c) => c.place && !byName.has(norm(c.place))).length;
  const placesText = !named.length ? 'בלי' : !places ? 'בודק…'
    : !newPlaces.length ? 'כולם כבר קיימים'
      : !centre ? `${newPlaces.length === 1 ? 'מקום אחד לא קיים' : `${fmt(newPlaces.length)} מקומות לא קיימים`}, ${noPlace === 1 ? 'השורה שלו תיכנס' : 'השורות האלה ייכנסו'} בלי מקום`
        : newPlaces.length === 1 ? 'מקום חדש אחד ייווצר' : `${fmt(newPlaces.length)} מקומות חדשים ייווצרו`;
  const urgent = kind === 'shopping' ? good.filter((c) => c.body.urgent).length : 0;
  const enter = good.length === 1 ? (kind === 'tasks' ? 'היא תיכנס' : 'הוא ייכנס') : kind === 'tasks' ? 'הן ייכנסו' : 'הם ייכנסו';
  const skipped = skipDups ? dups.size : 0;
  const skippedText = !skipped ? '' : skipped === 1 ? ' שורה אחת שכבר קיימת תידלג.' : ` ${fmt(skipped)} שורות שכבר קיימות יידלגו.`;
  const askText = `${enter} ל${kind === 'tasks' ? 'משימות' : 'רשימת הקניות'} באפליקציה עכשיו.${skippedText}${urgent ? ` על ${urgent === 1 ? 'הפריט הדחוף' : 'הפריטים הדחופים'} כל הצוות יקבל התראה.` : ''}${newPlaces.length && centre ? (newPlaces.length === 1 ? ` ייווצר גם המקום ${newPlaces[0]}. הוא יסומן באמצע החווה, ואת המיקום המדויק קובעים באפליקציה.` : ` ייווצרו גם המקומות: ${newPlaces.join(', ')}. הם יסומנו באמצע החווה, ואת המיקום המדויק קובעים באפליקציה.`) : ''} אם תייבאו שוב ${good.length === 1 ? 'את אותה שורה' : 'אותן שורות'}, גם אחרי תיקון, מה שכבר נכנס לא ייכנס פעמיים.`;
  /** The line about repeats, with the count said right. */
  const dupsText = !dups.size ? 'לא נמצאו' : dups.size === 1 ? (skipDups ? 'שורה אחת תידלג' : 'שורה אחת תיכנס שוב') : skipDups ? `${fmt(dups.size)} שורות יידלגו` : `${fmt(dups.size)} שורות ייכנסו שוב`;
  const dupsAct = skipDups ? (dups.size === 1 ? 'להכניס גם אותה' : 'להכניס גם אותן') : dups.size === 1 ? 'לדלג עליה' : 'לדלג עליהן';
  const undoText = (b: ImportBatch) => `${b.count === 1 ? (b.kind === 'tasks' ? 'המשימה מהייבוא הזה תוסר' : 'הפריט מהייבוא הזה יוסר') : `${fmt(b.count)} ${b.kind === 'tasks' ? 'המשימות' : 'הפריטים'} מהייבוא הזה יוסרו`}. מה שכבר שינו באפליקציה נשאר, וגם מקומות שנוצרו נשארים.`;
  return {
    kind, setKind, text, setText, fields, header, map, columns, colName, total, data, checked, good, bad, dups, skipDups, setSkipDups, fix, fieldOf, setField, setColumn,
    noun, count, loadFile, progress, outcomes, batch, run, imports, canUndo, undo, undoable, newPlaces, centre, placesText, askText, undoText, dupsText, dupsAct, undone, titled: map.title >= 0, reset: () => setText(''),
    added: (outcomes || []).filter((o) => o.ok && !o.replayed).length, replayed: (outcomes || []).filter((o) => o.replayed).length, failed: (outcomes || []).filter((o) => !o.ok).length,
  };
}
export type ImportState = ReturnType<typeof useImport>;
export const PLACEHOLDER: Record<Kind, string> = {
  tasks: 'משימה\tתאריך יעד\tדחוף\nלתקן את הגדר בצפון\t1/12/2026\tכן\nלהאכיל את העזים\t\t',
  shopping: 'מה לקנות\tכמות\tאיפה קונים\nחציר\t3 חבילות\tסופר\nברגים לעץ\t\tחומרי בניין',
};
