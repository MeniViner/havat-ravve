// הרצת פעולה on a computer (K15): the operations by area, the chosen one as a form built from the catalog, and the answer
// under it as label and value rows. Names are typed (a person, a place, an event) and sent as the record they mean.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ConfirmSheet } from '../../app/v2/kit';
import { ago, outHref } from '../shared';
import { source, type CatalogOp } from '../source';
import { useOpRun, type CatalogLoad, type OpFailure } from '../Run';
import { Act, Btn, Chips, Col, Cols, DCard, DTag, Dialog, Failed, Fact, Input, Mono, Notice, Page, Search, Select, Skeleton, Table } from './desk';
import { useSelected } from './route';
import { appPath, COMMON, enumHe, fieldsOf, groupOps, isExtra, isFull, isLong, opAbout, opFieldName, type OpField, opTitle, type Opt, optsOf, orderFields, pick, pickFrom, placeholderOf, shape, typed } from './runOps';

type Notify = (t: string, tone?: 'info' | 'alert') => void;
type Kind = 'all' | 'read' | 'write';
const seconds = (ms: number) => (ms < 100 ? 'פחות מ־0.1 שניות' : `${(ms / 1000).toFixed(1)} שניות`);
const moment = (at: number) => { const t = ago(new Date(at).toISOString()); return t === 'עכשיו' ? 'לפני רגע' : t; };

export function RunDesk({ cat, notify }: { cat: CatalogLoad; notify: Notify }) {
  const ops = cat.data;
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [every, setEvery] = useState(false);
  const [sel, select] = useSelected('run', useMemo(() => {
    const names = (ops || []).map((o) => o.name);
    // on arrival: the first of the list as it is shown
    const first = COMMON.filter((n) => names.includes(n));
    return [...first, ...names.filter((n) => !first.includes(n))];
  }, [ops]));
  const op = ops?.find((o) => o.name === sel) || null;
  const t = q.trim().toLowerCase();
  // the everyday operations in front; all of them once asked for, or when the chosen one is not among these
  const short = kind === 'all' && !t && !every && (!op || COMMON.includes(op.name));
  const shown = useMemo(() => (ops || []).filter((o) => (kind === 'all' || o.kind === kind)
    && (!t || o.name.toLowerCase().includes(t) || o.he.toLowerCase().includes(t) || opTitle(o).toLowerCase().includes(t)) && (!short || COMMON.includes(o.name))), [ops, kind, t, short]);
  const groups = useMemo(() => groupOps(shown), [shown]);
  const total = ops?.length;
  return (
    <Page group="גישה ואבטחה" title="הרצת פעולה" sub="כל פעולה של ה־API, בטופס, בלי מפתח ובלי קוד. מה שמשנה נתונים שואל קודם"
      actions={<Chips label="סוג הפעולה" value={kind} onChange={setKind} options={[{ value: 'all', label: total ? `הכל · ${total}` : 'הכל' }, { value: 'read', label: 'קריאה' }, { value: 'write', label: 'משנה' }]} />}>
      <Cols>
        <aside className="da-ops" aria-label="הפעולות">
          <div className="da-ops__search"><Search value={q} onChange={setQ} placeholder={total ? `חיפוש בין ${total} פעולות` : 'חיפוש פעולה'} width="100%" /></div>
          <OpList groups={groups} selected={sel} onSelect={select} />
          {!ops && (cat.error ? <Failed text={`לא הצלחנו לקרוא את רשימת הפעולות. ${cat.error}`} retry={cat.reload} /> : <div className="da-ops__wait"><Skeleton lines={10} height={20} /></div>)}
          {ops && !shown.length && <p className="d-empty">לא נמצאה פעולה. נסו מילה אחרת, בעברית או באנגלית.</p>}
          {ops && short && total! > shown.length && <div className="da-ops__more"><Act onClick={() => setEvery(true)}>כל הפעולות</Act></div>}
          {ops && every && kind === 'all' && !t && <div className="da-ops__more"><Act onClick={() => setEvery(false)}>רק הנפוצות</Act></div>}
        </aside>
        <Col style={{ overflowY: 'auto' }}>
          {op ? <OpForm key={op.name} op={op} ops={ops!} notify={notify} />
            : <DCard fill>{!ops && !cat.error ? <Skeleton lines={6} /> : <p className="d-empty d-empty--inline">בחרו פעולה מהרשימה.</p>}</DCard>}
        </Col>
      </Cols>
    </Page>
  );
}

function OpList({ groups, selected, onSelect }: { groups: { title: string; ops: CatalogOp[] }[]; selected: string | null; onSelect: (name: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const names = groups.flatMap((g) => g.ops.map((o) => o.name));
  const focusOn = (name: string) => box.current?.querySelector<HTMLElement>(`[data-op="${name}"]`)?.focus();
  const onKey = (e: KeyboardEvent, name: string) => {
    const i = names.indexOf(name);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? names.length - 1 : -1;
    if (to >= 0 && to < names.length) { e.preventDefault(); onSelect(names[to]); requestAnimationFrame(() => focusOn(names[to])); }
  };
  // a direct link to an operation far down the list: shown once the catalogue is here
  const ready = names.length > 0;
  useEffect(() => { if (ready) box.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' }); }, [ready, selected]);
  const tabStop = selected && names.includes(selected) ? selected : names[0];
  return (
    <div ref={box} className="da-ops__list">
      {groups.map((g) => (
        <div key={g.title} role="group" aria-label={g.title} className="da-ops__group">
          <span className="da-ops__head">{g.title}</span>
          {g.ops.map((o) => (
            <button key={o.name} type="button" data-op={o.name} className="da-op" aria-current={o.name === selected || undefined} tabIndex={o.name === tabStop ? 0 : -1} onClick={() => onSelect(o.name)} onKeyDown={(e) => onKey(e, o.name)} title={o.he}>
              <span className="da-op__text"><span className="da-op__title">{opTitle(o)}</span><span className="da-op__key" dir="ltr">{o.name}</span></span>
              {o.kind === 'write' ? <DTag tone="warm">משנה</DTag> : <DTag>קריאה</DTag>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function OpForm({ op, ops, notify }: { op: CatalogOp; ops: CatalogOp[]; notify: Notify }) {
  const fields = useMemo(() => orderFields(fieldsOf(op)), [op]);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(({ key, p }) => [key, p.default !== undefined ? String(p.default) : ''])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [tech, setTech] = useState(false);
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState<{ path: string; body: Record<string, unknown> } | null>(null);
  const [askUndo, setAskUndo] = useState(false);
  const { busy, res, lost, run, undo } = useOpRun(op, ops, notify);
  const [checking, setChecking] = useState(false);

  // the records a field is picked from: read once, when the field is first used
  const reading = useRef<Record<string, Promise<Opt[]>>>({});
  const [opts, setOpts] = useState<Record<string, Opt[]>>({});
  const need = (from: string) => (reading.current[from] ||= (from === 'people'
    ? source.people().then((l) => optsOf(l.filter((p) => p.status !== 'blocked').map((p) => ({ id: p.uid, name: p.displayName }))))
    : source.runOp('GET', ops.find((o) => o.name === from)!.path).then((r) => optsOf(((r.json as { data?: { items?: Record<string, unknown>[] } })?.data?.items) || [])))
    .then((l) => { setOpts((x) => ({ ...x, [from]: l })); return l; })
    .catch(() => { delete reading.current[from]; return []; }));
  const names = useMemo(() => new Map((opts.people || []).map((o) => [o.id, o.label])), [opts.people]);

  const set = (k: string, v: string) => { setVals((x) => ({ ...x, [k]: v })); setErrs((x) => ({ ...x, [k]: '' })); };
  /** The request, or what is wrong with the form. */
  const build = async () => {
    const bad: Record<string, string> = {};
    let path = op.path;
    const query = new URLSearchParams();
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = vals[f.key] || '';
      if (!raw.trim()) { if (f.p.required) bad[f.key] = 'חובה'; continue; }
      let { value, error } = typed(f.p, raw);
      const from = pickFrom(op, f, ops);
      if (!error && from) {
        const list = await need(from);
        const ids = (Array.isArray(value) ? value as string[] : [String(value)]).map((x) => pick(x, list));
        if (ids.includes(null)) error = 'לא נמצא. בחרו מהרשימה';
        value = Array.isArray(value) ? ids : ids[0];
      }
      if (!error && f.key === 'dates' && Array.isArray(value)) {
        const l = value.map((x) => typed({ type: 'date' }, String(x)));
        if (l.some((x) => x.error)) error = l.find((x) => x.error)!.error;
        else value = l.map((x) => x.value);
      }
      if (error) { bad[f.key] = error; continue; }
      if (f.p.default !== undefined && value === f.p.default && !f.p.required) continue;
      if (f.where === 'path') path = path.replace(`{${f.key}}`, encodeURIComponent(String(value)));
      else if (f.where === 'query') query.set(f.key, Array.isArray(value) ? value.join(',') : String(value));
      else body[f.key] = value;
    }
    return { bad, path: path + (query.toString() ? '?' + query : ''), body };
  };
  const start = async () => {
    if (busy || checking) return;
    setChecking(true);
    const { bad, path, body } = await build().finally(() => setChecking(false));
    setErrs(bad);
    if (Object.keys(bad).length) { if (fields.some((f) => bad[f.key] && isExtra(f))) setMore(true); return; }
    if (op.kind === 'write') setAsk({ path, body }); else go(path, body);
  };
  const go = async (path: string, body: Record<string, unknown>) => {
    const ok = await run(path, body);
    // what was just changed may be a choice in another field
    if (ok && op.kind === 'write') for (const k of Object.keys(reading.current)) if (k !== 'people') delete reading.current[k];
  };

  const j = res?.json as OpFailure;
  const ok = !!res && res.status < 300;
  // the server's own complaint about a field goes under that field
  useEffect(() => { const k = res && res.status >= 300 ? (res.json as OpFailure)?.error?.details?.field : undefined; if (k && fields.some((f) => f.key === k)) setErrs((x) => ({ ...x, [k]: (res!.json as OpFailure)?.error?.he || 'לא תקין' })); }, [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const errField = j?.error?.details?.field;
  const told = res && ok ? shape(op, res.json, names) : null;
  const link = res && ok && !res.undone ? appPath(op, res.json) : null;
  const main = fields.filter((f) => !isExtra(f)), extra = fields.filter(isExtra);
  const draw = (f: OpField) => <OpInput key={f.key} op={op} f={f} from={pickFrom(op, f, ops)} value={vals[f.key] || ''} error={errs[f.key]} onChange={(v) => set(f.key, v)} need={need} opts={opts} />;
  const raw = res ? JSON.stringify(res.json, null, 2) : '';
  return (
    <>
      <section className="d-card">
        <div className="da-form__head">
          <div><h2>{opTitle(op)}</h2><span>{opAbout(op)} <Mono>{op.method} {op.path}</Mono></span></div>
          {op.kind === 'write' ? <DTag tone="warm">משנה נתונים</DTag> : <DTag>רק קוראת</DTag>}
        </div>
        <form noValidate onSubmit={(e) => { e.preventDefault(); start(); }}>
          {fields.length ? (
            <div className="da-form">
              {main.map(draw)}
              {more && extra.map(draw)}
            </div>
          ) : <p className="da-form__none">לפעולה הזאת אין שדות.</p>}
          <div className="da-form__foot">
            <Btn kind="primary" icon="play" type="submit" disabled={busy}>{busy ? 'מריץ…' : 'הרצה'}</Btn>
            <span>רצה בהרשאות של בעלים, ונרשמת ביומן על שמך.</span>
            <span className="da-form__more">
              {!!extra.length && <Act onClick={() => setMore(!more)}>{more ? 'פחות שדות' : `עוד ${extra.length === 1 ? 'שדה' : `${extra.length} שדות`}`}</Act>}
              <Act onClick={() => setTech(true)}>פרטים טכניים</Act>
            </span>
          </div>
        </form>
      </section>

      <DCard fill style={{ minHeight: 220, overflowY: 'auto' }} title="התוצאה"
        aside={res && !busy ? <span className="da-res">{res.undone ? <DTag>בוטלה</DTag> : ok ? <DTag tone="green">הצליח</DTag> : <DTag tone="red">נכשל</DTag>} {seconds(res.ms)} · {moment(res.at)}</span> : undefined}>
        {busy ? <Skeleton lines={4} /> : lost ? <Failed text={`${lost}. ${op.kind === 'write' ? 'לא ידוע אם הפעולה בוצעה; הרצה חוזרת לא תבצע אותה פעמיים.' : ''}`} retry={start} />
          : !res ? <p className="d-empty d-empty--inline">התשובה של השרת תופיע כאן.</p>
            : ok && told ? (
              <>
                {res.undone && <Notice>הפעולה בוטלה.</Notice>}
                {told.note && <Notice>{told.note}</Notice>}
                {!!told.rows.length && <div className="da-facts">{told.rows.map((r) => <Fact key={r.key} label={r.label}>{r.mono ? <Mono>{r.value}</Mono> : r.value}</Fact>)}</div>}
                {told.list && (
                  <Table<{ id: string; cells: Record<string, string> }> label="מה שהתקבל" inset rows={told.list.items} rowKey={(r) => r.id} empty="לא התקבלה אף רשומה."
                    columns={told.list.columns.map((c, i) => ({ key: c.key, head: c.head, strong: i === 0, soft: i > 0, cell: (r) => <span className="da-clip" title={r.cells[c.key]}>{r.cells[c.key] || ''}</span> }))} />
                )}
                {told.list && !!told.list.items.length && <p className="da-count">{told.list.items.length === 1 ? 'רשומה אחת' : `${told.list.items.length} רשומות`}{told.list.more ? ', ויש עוד. אפשר לסנן או להגדיל את "כמה להביא"' : ''}.</p>}
                {!told.rows.length && !told.list && <p className="d-empty d-empty--inline">{op.kind === 'write' ? 'הפעולה בוצעה.' : 'התשובה הגיעה.'}</p>}
              </>
            ) : <Failed text={j?.error ? `${j.error.he || 'השרת לא קיבל את הבקשה'}${errField ? `: ${opFieldName(op, errField)}` : ''}` : 'השרת לא קיבל את הבקשה'} retry={res.status >= 500 || res.status === 429 ? start : undefined} />}
        {res && !busy && (
          <div className="da-links">
            {link && <a className="d-act" href={outHref(link)} target="_blank" rel="noreferrer">לפתוח באפליקציה</a>}
            <Act onClick={() => setFull(true)}>להציג את התשובה המלאה</Act>
            {res.undo && !res.undone && <Act onClick={() => setAskUndo(true)}>לבטל את הפעולה</Act>}
          </div>
        )}
      </DCard>

      <ConfirmSheet open={!!ask} title="להריץ את הפעולה?" text={`"${opTitle(op)}" תשנה נתונים אמיתיים של החווה, ותירשם ביומן בשם הקונסולה.`} confirmLabel="כן, להריץ" cancelLabel="חזרה"
        onClose={() => setAsk(null)} onConfirm={() => { const a = ask!; setAsk(null); go(a.path, a.body); }} />
      <ConfirmSheet open={askUndo && !!res?.undo} title="לבטל את הפעולה?" text={`${res?.undo?.text || ''} גם הביטול נרשם ביומן.`} confirmLabel="כן, לבטל" cancelLabel="חזרה"
        onClose={() => setAskUndo(false)} onConfirm={async () => { await undo(); setAskUndo(false); }} />
      <Dialog open={full} onClose={() => setFull(false)} title="התשובה המלאה" width={720}
        sub={res ? <Mono>HTTP {res.status}{j?.error?.code ? ` · ${j.error.code}` : ''}{j?.error?.message ? ` · ${j.error.message}` : ''}</Mono> : undefined}
        footer={<><Btn kind="primary" onClick={() => navigator.clipboard?.writeText(raw).then(() => notify('הועתק'), () => notify('ההעתקה לא הצליחה', 'alert'))}>העתקה</Btn><Btn onClick={() => setFull(false)}>סגירה</Btn></>}>
        <pre className="da-json" dir="ltr">{raw}</pre>
      </Dialog>
      <Dialog open={tech} onClose={() => setTech(false)} title="פרטים טכניים" sub={op.he} width={640}>
        <div>
          <Fact label="הפעולה"><Mono>{op.name}</Mono></Fact>
          <Fact label="הבקשה"><Mono>{op.method} {op.path}</Mono></Fact>
          <Fact label="הרשאה"><Mono>{op.requiredScope}</Mono></Fact>
          {fields.map((f) => <Fact key={f.key} label={opFieldName(op, f.key)}><Mono>{f.key}</Mono>{f.p.he ? ` · ${f.p.he}` : ''}{f.p.type === 'enum' && f.p.values ? <> · <Mono>{f.p.values.join(', ')}</Mono></> : null}</Fact>)}
        </div>
        {!!op.notes?.length && <ul className="da-notes" dir="ltr">{op.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </Dialog>
    </>
  );
}

/** One field: a list of values, yes/no, a name picked from the farm's records, or text. */
function OpInput({ op, f, from, value, error, onChange, need, opts }: { op: CatalogOp; f: OpField; from: string | null; value: string; error?: string; onChange: (v: string) => void; need: (from: string) => Promise<Opt[]>; opts: Record<string, Opt[]> }) {
  const { key, p } = f;
  const label = opFieldName(op, key);
  const cls = `da-field${isFull(f) ? ' is-full' : ''}`;
  if (p.type === 'bool' || (p.type === 'enum' && p.values)) {
    const none = { value: '', label: p.required ? 'לבחור' : op.kind === 'read' ? 'הכל' : 'בלי שינוי' };
    const choices = p.type === 'bool' ? [{ value: 'false', label: 'לא' }, { value: 'true', label: 'כן' }] : p.values!.map((v) => ({ value: v, label: enumHe(key, v) }));
    return (
      <div className={cls}>
        <div className="d-field">
          <span className="d-field__label">{label}{p.required ? ' · חובה' : ''}</span>
          <span className="da-pick"><Select label={label} value={value} onChange={onChange} width="100%" options={p.default !== undefined ? choices : [none, ...choices]} /></span>
          {error && <span className="d-field__err" role="alert">{error}</span>}
        </div>
      </div>
    );
  }
  const listId = from ? `da-${op.name}-${key}` : undefined;
  const ltr = p.type === 'email' || /link|url|photo|image|cursor|ifUpdatedAt/i.test(key);
  return (
    <div className={cls} onFocusCapture={from ? () => need(from) : undefined}>
      <Input label={label} required={p.required} value={value} onChange={onChange} error={error || undefined} placeholder={placeholderOf(f, from) || undefined} ltr={ltr && !!value} multiline={isLong(f)} list={listId} />
      {from && <datalist id={listId}>{(opts[from] || []).map((o) => <option key={o.id} value={o.label} />)}</datalist>}
    </div>
  );
}
