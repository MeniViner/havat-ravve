// Shopping: built for standing in the shop with one hand. A whole row is the tick, the amount sits at the end of the line,
// and adding is one line at the top of the list.
import { useMemo, useRef, useState } from 'react';
import type { ShoppingItem, ShoppingCategory } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, useToast, firstName, relTime, fmtTime, whenText } from '../ui';
import { Head, Sect, Tabs, Check, Btn, Form, Field, Seg, Tick, Empty, useLeaving, useSticky, deferDelete } from '../kit';
import { back, navigate } from '../router';
import { setBought, addShopping, editShopping, deleteShopping, useShoppingItem, useBoughtHistory } from '../store';
import { useActivityFor, ACTION_LABELS } from '../activity';
import { CATS, catOf, fixLink } from './New';

export function useShopActions(ctx: TeamCtx) {
  const toast = useToast();
  const fail = (e: unknown) => toast({ text: (e as Error)?.message || 'לא נשמר', kind: 'error' });
  return {
    fail,
    bought: (i: ShoppingItem) => {
      setBought(ctx.actor, i, true).catch(fail);
      toast({ text: `${catOf(i.category).done}: ${i.title}`, actions: [{ label: 'ביטול', onClick: () => { setBought(ctx.actor, i, false).catch(fail); } }] }, 5000);
    },
    back: (i: ShoppingItem) => { setBought(ctx.actor, i, false).catch(fail); toast({ text: `חזר לרשימה: ${i.title}` }, 2500); },
  };
}

/** The usual items of one list: what was bought most in the last 90 days and is not on the list now. */
function useUsual(open: ShoppingItem[]) {
  const from = useMemo(() => new Date(Date.now() - 90 * 86400_000).toISOString(), []);
  const past = useBoughtHistory(true, from);
  return useMemo(() => (cat: ShoppingCategory) => {
    const onList = new Set(open.filter((i) => i.category === cat).map((i) => i.title));
    const m = new Map<string, { n: number; qty: string }>();
    for (const i of past.items) if (i.category === cat && !onList.has(i.title)) m.set(i.title, { n: (m.get(i.title)?.n || 0) + 1, qty: m.get(i.title)?.qty || i.qty });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([title, v]) => ({ title, qty: v.qty }));
  }, [past.items, open]);
}

function AddLine({ ctx, cat, usual }: { ctx: TeamCtx; cat: ShoppingCategory; usual: { title: string; qty: string }[] }) {
  const [title, setTitle] = useState(''); const [qty, setQty] = useState('');
  const ref = useRef<HTMLInputElement>(null); const toast = useToast();
  const add = async (t = title.trim(), q = qty.trim()) => {
    if (!t) return;
    setTitle(''); setQty(''); ref.current?.focus();
    try { await addShopping(ctx.actor, { title: t, qty: q, note: '', link: '', category: cat, urgent: false }); }
    catch (e) { toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' }); }
  };
  return (
    <>
      <Form onSubmit={() => add()} className="r-addline">
        <input ref={ref} className="r-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cat === 'giveaway' ? 'מה מחפשים?' : `להוסיף ל${catOf(cat).label}…`} aria-label={`פריט חדש ב${catOf(cat).label}`} maxLength={200} enterKeyHint="done" autoComplete="off" />
        {title.trim() && <input className="r-input r-qty" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="כמה?" aria-label="כמות" maxLength={40} enterKeyHint="done" autoComplete="off" />}
        {title.trim() && <Btn type="submit">הוספה</Btn>}
      </Form>
      {!title && usual.length > 0 && <div className="r-sugg"><span>קונים בדרך כלל:</span>{usual.map((u) => <button key={u.title} type="button" onClick={() => add(u.title, u.qty)}>{u.title}</button>)}</div>}
    </>
  );
}

function ShopRow({ i, leaving, fresh, onToggle, sel, keep }: { i: ShoppingItem; leaving?: boolean; fresh?: boolean; onToggle: (i: ShoppingItem) => void; sel?: boolean; keep?: boolean }) {
  const meta: React.ReactNode[] = [];
  if (i.urgent && !i.bought) meta.push(<b key="u">דחוף</b>);
  if (i.note) meta.push(i.note);
  meta.push(i.bought ? `${firstName(i.boughtBy?.name || '')} · ${fmtTime(i.boughtAt)}` : `${firstName(i.createdBy.name)} · ${relTime(i.createdAt)}`);
  return (
    <div className={['r-shop', i.urgent && !i.bought ? 'urgent' : '', i.bought ? 'done' : '', leaving ? 'leaving' : '', fresh ? 'fresh' : '', sel ? 'sel' : ''].filter(Boolean).join(' ')}>
      <Check box on={i.bought || !!leaving} onChange={() => onToggle(i)} label={`${i.bought ? 'להחזיר לרשימה' : catOf(i.category).done}: ${i.title}`} />
      <button type="button" className="r-body" tabIndex={-1} aria-hidden="true" onClick={() => onToggle(i)}>
        <span className="r-t">{i.title}</span>
        <span className="r-m">{meta.map((m, k) => <span key={k}>{k > 0 && ' · '}{m}</span>)}</span>
      </button>
      <span className="r-q">{i.qty}</span>
      <A className="r-dots" to={`/shopping/${i.id}`} keep={keep} aria-label={`פרטים ועריכה: ${i.title}`}><Icon name="more" /></A>
    </div>
  );
}

export function ShoppingScreen({ ctx, open, recent, loading, selectedId }: { ctx: TeamCtx; open: ShoppingItem[]; recent: ShoppingItem[]; loading: boolean; selectedId?: string }) {
  const desktop = useDesktop(); const act = useShopActions(ctx); const { leaving, leave } = useLeaving(420);
  const usual = useUsual(open);
  const byCat = (c: ShoppingCategory) => open.filter((i) => i.category === c).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt));
  const firstFull = CATS.find((c) => byCat(c.id).length)?.id || 'super';
  const [saved, setTab] = useSticky<ShoppingCategory | ''>('shop-tab', '');
  const tab = saved || firstFull;
  const toggle = (i: ShoppingItem) => (i.bought ? act.back(i) : leave(i.id, () => act.bought(i)));
  const fresh = (i: ShoppingItem) => Date.now() - new Date(i.createdAt).getTime() < 4000;
  const list = (c: ShoppingCategory) => {
    const rows = byCat(c); const done = recent.filter((i) => i.category === c);
    return (
      <>
        <AddLine ctx={ctx} cat={c} usual={usual(c)} />
        {rows.length === 0 && done.length === 0 && !loading && <Empty title={c === 'giveaway' ? 'אין כרגע משהו שמחפשים' : 'הרשימה ריקה'}>{catOf(c).hint}</Empty>}
        {rows.map((i) => <ShopRow key={i.id} i={i} leaving={leaving.has(i.id)} fresh={fresh(i)} onToggle={toggle} sel={i.id === selectedId} keep={desktop} />)}
        {done.length > 0 && <><Sect title={`${catOf(c).done} ביממה האחרונה`} n={done.length} />{done.map((i) => <ShopRow key={i.id} i={i} onToggle={toggle} sel={i.id === selectedId} keep={desktop} />)}</>}
      </>
    );
  };
  return (
    <>
      <Head title="קניות" end={<A className="r-textlink" to="/history/shopping">היסטוריה</A>} />
      {desktop
        ? <div className="r-shopcols">{CATS.map((c) => <section key={c.id}><Sect title={c.label} n={byCat(c.id).length} />{list(c.id)}</section>)}</div>
        : <>
          <Tabs label="רשימה" value={tab} onChange={setTab} items={CATS.map((c) => ({ id: c.id, label: c.label, n: byCat(c.id).length }))} />
          {list(tab)}
        </>}
    </>
  );
}

// ---------- one item: read, fix, mark ----------
export function ShopItemScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const { item, loading } = useShoppingItem(id);
  if (loading) return <><Head backTo="/shopping" backLabel="קניות" title="" /><div className="r-empty">טוען…</div></>;
  if (!item) return <><Head backTo="/shopping" backLabel="קניות" title="הפריט לא נמצא" /><Empty title="ייתכן שנמחק">אפשר למצוא אותו בהיסטוריה.</Empty></>;
  return <ItemForm key={item.id} item={item} ctx={ctx} />;
}
function ItemForm({ item, ctx }: { item: ShoppingItem; ctx: TeamCtx }) {
  const toast = useToast(); const act = useShopActions(ctx);
  const log = useActivityFor('shopping', item.id);
  const [f, setF] = useState({ title: item.title, qty: item.qty, note: item.note, link: item.link, category: item.category, urgent: item.urgent });
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify({ title: item.title, qty: item.qty, note: item.note, link: item.link, category: item.category, urgent: item.urgent });
  const save = async () => {
    if (!f.title.trim()) { setErr('צריך שם לפריט'); return false; }
    if (!dirty) return true;
    try { await editShopping(ctx.actor, item, { ...f, title: f.title.trim(), qty: f.qty.trim(), note: f.note.trim(), link: fixLink(f.link) }); return true; }
    catch (e) { setErr((e as Error).message || 'לא נשמר'); return false; }
  };
  const submit = async () => { if (await save()) { toast({ text: 'נשמר' }, 2000); back('/shopping'); } };
  const mark = async () => { if (!(await save())) return; if (item.bought) act.back(item); else act.bought(item); back('/shopping'); };
  const remove = () => {
    const undo = deferDelete(item.id, () => { deleteShopping(ctx.actor, item).catch(() => {}); });
    toast({ text: `נמחק: ${item.title}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    navigate('/shopping', true);
  };
  return (
    <>
      <Head backTo="/shopping" backLabel="קניות" title={item.title} over={`${catOf(item.category).label} · ${firstName(item.createdBy.name)} הוסיף/ה ${relTime(item.createdAt)}`} />
      {item.link && <div className="r-actions" style={{ paddingTop: 0 }}><a className="r-btn ghost sm" href={item.link} target="_blank" rel="noopener">לפתוח את הקישור</a></div>}
      <Form onSubmit={submit}>
        <Field label="שם">{(id) => <input id={id} className="r-input" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setErr(''); }} maxLength={200} />}</Field>
        <Field label="כמה?">{(id) => <input id={id} className="r-input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} maxLength={40} placeholder="6 קרטונים, 2 חבילות, 50 מטר" />}</Field>
        <Field label="הערה">{(id) => <input id={id} className="r-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />}</Field>
        <Field label="קישור">{(id) => <input id={id} className="r-input" dir="ltr" inputMode="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} maxLength={2000} placeholder="https://" />}</Field>
        <Seg label="רשימה" value={f.category} onChange={(category) => setF({ ...f, category })} options={CATS.map((c) => ({ value: c.id, label: c.label }))} />
        <Tick on={f.urgent} onChange={(urgent) => setF({ ...f, urgent })} help="עולה לראש הרשימה">דחוף</Tick>
        {err && <p className="r-err" role="alert">{err}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {dirty && <Btn type="submit" kind="ghost">שמירת השינויים</Btn>}
          <Btn kind="danger" onClick={remove}>מחיקה מהרשימה</Btn>
        </div>
      </Form>
      {log.items.length > 0 && <><Sect title="מה קרה כאן" /><ul className="r-log">{log.items.map((a) => <li key={a.id}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}<span>{whenText(a.at)}</span></li>)}</ul></>}
      <div className="r-dock"><Btn onClick={mark}>{item.bought ? 'להחזיר לרשימה' : dirty ? `שמירה וסימון: ${catOf(item.category).done}` : catOf(item.category).done}</Btn></div>
    </>
  );
}
