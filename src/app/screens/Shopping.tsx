import { useEffect, useMemo, useState } from 'react';
import type { ShoppingItem, ShoppingCategory, Actor } from '../types';
import { CATEGORY_LABELS } from '../types';
import { addShopping, editShopping, setBought, deleteShopping, restoreShopping, useBoughtHistory, type NewShopping } from '../store';
import { useActivityFor, ACTION_LABELS } from '../activity';
import { Icon, Check, Empty, Segmented, Button, Sheet, useToast, relTime, firstName, fmtDate, fmtTime, fmtDayLong } from '../ui';
import { navigate } from '../router';
import { dateKeyOf } from '../firebase';

const CATS: ShoppingCategory[] = ['super', 'building', 'online', 'giveaway'];
const PLACEHOLDER: Record<ShoppingCategory, string> = { super: 'מה לקנות בסופר?', building: 'מה חסר לבנייה?', online: 'מה להזמין באינטרנט?', giveaway: 'מה נשמח לקבל?' };
const EMPTY: Record<ShoppingCategory, [string, string]> = {
  super: ['הסופר מסודר', 'כשחסר משהו, כותבים למעלה ומי שיוצא לקניות רואה.'],
  building: ['אין חומרי בניין לקנות', 'מלט, ברגים, צינורות. כל מה שצריך מחנות הבניין.'],
  online: ['אין הזמנות ממתינות', 'פריט עם קישור, כדי שמי שמזמין ימצא בדיוק את זה.'],
  giveaway: ['אין בקשות כרגע', 'דברים שנשמח לקבל בחינם. ראיתם ברשתות או ברחוב? סמנו "נמצא".'],
};
type Ctx = { actor: Actor; manager: boolean };

/** Suggestions: what was bought before, most frequent first. */
function useSuggestions(history: ShoppingItem[], open: ShoppingItem[], cat: ShoppingCategory) {
  return useMemo(() => {
    const counts = new Map<string, { title: string; qty: string; n: number; last: string }>();
    for (const i of history) if (i.category === cat) { const k = i.title.trim().toLowerCase(); const c = counts.get(k); if (c) { c.n++; if (i.boughtAt! > c.last) { c.last = i.boughtAt!; c.qty = i.qty; } } else counts.set(k, { title: i.title.trim(), qty: i.qty, n: 1, last: i.boughtAt || '' }); }
    const openTitles = new Set(open.filter((i) => i.category === cat).map((i) => i.title.trim().toLowerCase()));
    return [...counts.values()].filter((c) => !openTitles.has(c.title.toLowerCase())).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
  }, [history, open, cat]);
}

export function ShoppingScreen({ open, recent, ctx, loading, initial = 'super' }: { open: ShoppingItem[]; recent: ShoppingItem[]; ctx: Ctx; loading: boolean; initial?: ShoppingCategory }) {
  const [cat, setCat] = useState<ShoppingCategory>(() => (localStorage.getItem('farm-shop-cat') as ShoppingCategory) || initial);
  useEffect(() => localStorage.setItem('farm-shop-cat', cat), [cat]);
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [link, setLink] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ShoppingItem | null>(null);
  const toast = useToast();
  const ninety = useMemo(() => new Date(Date.now() - 90 * 86400_000).toISOString(), []);
  const history = useBoughtHistory(true, ninety);
  const suggestions = useSuggestions(history.items, open, cat);
  const counts = useMemo(() => Object.fromEntries(CATS.map((c) => [c, open.filter((i) => i.category === c).length])) as Record<ShoppingCategory, number>, [open]);
  const items = useMemo(() => open.filter((i) => i.category === cat).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt)), [open, cat]);
  const bought = recent.filter((i) => i.category === cat);
  const typed = title.trim().toLowerCase();
  const matches = typed.length >= 1 ? suggestions.filter((s) => s.title.toLowerCase().includes(typed) && s.title.toLowerCase() !== typed).slice(0, 4) : [];
  const quick = suggestions.slice(0, 8);

  const add = async (data?: Partial<NewShopping>) => {
    const t = (data?.title ?? title).trim();
    if (!t) return;
    if (cat === 'online' && link && !/^https:\/\//.test(link.trim())) return toast({ text: 'הקישור צריך להתחיל ב־https://', kind: 'error' });
    setBusy(true);
    try {
      await addShopping(ctx.actor, { title: t, qty: data?.qty ?? qty, note: '', link: cat === 'online' ? link : '', category: cat, urgent: data?.urgent ?? urgent });
      setTitle(''); setQty(''); setLink(''); setUrgent(false); setMore(false);
    } catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); }
  };
  const toggle = async (item: ShoppingItem, v: boolean) => {
    try {
      await setBought(ctx.actor, item, v);
      if (v) toast({ text: cat === 'giveaway' ? `נמצא: ${item.title}` : `נקנה: ${item.title}`, action: { label: 'ביטול', onClick: () => setBought(ctx.actor, { ...item, bought: true }, false) } }, 6000);
    } catch { toast({ text: 'לא נשמר', kind: 'error' }); }
  };
  const remove = async (item: ShoppingItem) => {
    try { await deleteShopping(ctx.actor, item); setSelected(null); toast({ text: 'נמחק', action: { label: 'ביטול', onClick: () => restoreShopping(item) } }, 6000); }
    catch { toast({ text: 'לא נמחק', kind: 'error' }); }
  };
  const Row = ({ item }: { item: ShoppingItem }) => (
    <div className={'row ' + (item.bought ? 'done' : '')}>
      <Check checked={item.bought} onChange={(v) => toggle(item, v)} label={item.bought ? 'בטל' : cat === 'giveaway' ? 'נמצא' : 'נקנה'} />
      <button type="button" className="row-main" style={{ textAlign: 'start', background: 'none' }} onClick={() => setSelected(item)}>
        <div className="row-title">{item.title}{item.qty && <span className="qty">{item.qty}</span>}{item.urgent && !item.bought && <span className="tag bad" style={{ marginInlineStart: 6 }}>דחוף</span>}</div>
        <div className="row-meta">
          {item.bought && item.boughtBy ? <span className="who"><Icon name="check" />{firstName(item.boughtBy.name)} · {relTime(item.boughtAt)}</span> : <span className="who">{firstName(item.createdBy.name)} · {relTime(item.createdAt)}</span>}
          {item.note && <span>{item.note}</span>}
          {item.link && <a className="who" href={item.link} target="_blank" rel="noopener" style={{ color: 'var(--olive)' }} onClick={(e) => e.stopPropagation()}><Icon name="link" />קישור</a>}
        </div>
      </button>
    </div>
  );
  const live = selected ? open.find((i) => i.id === selected.id) || recent.find((i) => i.id === selected.id) || selected : null;
  return (
    <>
      <header className="topbar"><div><h1>קניות</h1><div className="sub">{open.length ? `${open.length} פריטים פתוחים${open.some((i) => i.urgent) ? ' · יש דחופים' : ''}` : 'הכל מסודר'}</div></div>
        <div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => navigate('/history/shopping')} aria-label="היסטוריית קניות"><Icon name="history" /></button></div></header>
      <Segmented value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: CATEGORY_LABELS[c], count: counts[c] }))} />
      <div className="card add-card">
        <div className="add-row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={PLACEHOLDER[cat]} aria-label="פריט" />
          <input className="add-qty" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="כמות" aria-label="כמות" />
          <Button kind="primary" disabled={busy || !title.trim()} onClick={() => add()} aria-label="הוספה"><Icon name="plus" /></Button>
        </div>
        {matches.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{matches.map((m) => <button key={m.title} type="button" className="chip" onClick={() => add({ title: m.title, qty: qty || m.qty })}><Icon name="history" />{m.title}{m.qty && <small> · {m.qty}</small>}</button>)}</div>}
        <div className="add-tools">
          <button type="button" className={'chip ' + (urgent ? 'on bad' : '')} onClick={() => setUrgent(!urgent)}>{urgent ? 'דחוף ✓' : 'דחוף'}</button>
          {cat === 'online' && <button type="button" className={'chip ' + (more ? 'on' : '')} onClick={() => setMore(!more)}><Icon name="link" />קישור</button>}
        </div>
        {cat === 'online' && more && <input style={{ marginTop: 8 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… קישור למוצר" dir="ltr" inputMode="url" aria-label="קישור" />}
      </div>
      {quick.length > 0 && !typed && (
        <div className="section" style={{ marginTop: 14 }}>
          <div className="section-head"><h2>קונים בדרך כלל</h2></div>
          <div className="chips">{quick.map((s) => <button key={s.title} type="button" className="chip" onClick={() => add({ title: s.title, qty: s.qty })}><Icon name="plus" />{s.title}{s.qty && <small> · {s.qty}</small>}</button>)}</div>
        </div>
      )}
      <div className="section">
        <div className="section-head"><h2>לקנות · {items.length}</h2>{items.length > 0 && <span className="hint">{items.filter((i) => i.urgent).length ? `${items.filter((i) => i.urgent).length} דחופים` : ''}</span>}</div>
        {loading && !open.length ? <div className="loading">טוען…</div> : !items.length ? <Empty title={EMPTY[cat][0]} text={EMPTY[cat][1]} icon="cart" /> : <div className="list">{items.map((i) => <Row key={i.id} item={i} />)}</div>}
      </div>
      {bought.length > 0 && <div className="section"><div className="section-head"><h2>{cat === 'giveaway' ? 'נמצא לאחרונה' : 'נקנה ב־24 השעות האחרונות'}</h2><a href="/app/history/shopping" onClick={(e) => { e.preventDefault(); navigate('/history/shopping'); }}>כל ההיסטוריה</a></div><div className="list">{bought.map((i) => <Row key={i.id} item={i} />)}</div></div>}
      <ItemSheet item={live} onClose={() => setSelected(null)} ctx={ctx} onDelete={remove} />
    </>
  );
}

function ItemSheet({ item, onClose, ctx, onDelete }: { item: ShoppingItem | null; onClose: () => void; ctx: Ctx; onDelete: (i: ShoppingItem) => void }) {
  const [form, setForm] = useState({ title: '', qty: '', note: '', link: '', urgent: false });
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const activity = useActivityFor(item?.id || '', !!item);
  useEffect(() => { if (item) { setForm({ title: item.title, qty: item.qty, note: item.note, link: item.link, urgent: item.urgent }); setEditing(false); } }, [item?.id]);
  if (!item) return <Sheet open={false} onClose={onClose}><div /></Sheet>;
  return (
    <Sheet open={!!item} onClose={onClose} title={editing ? 'עריכת פריט' : item.title}>
      {editing ? (
        <>
          <label className="field"><span>פריט</span><input data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div className="two"><label className="field"><span>כמות</span><input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="למשל: 3 יח׳, 2 ק״ג" /></label><label className="field"><span>הערה</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="מותג, גודל, מאיפה" /></label></div>
          {item.category === 'online' && <label className="field"><span>קישור</span><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} dir="ltr" /></label>}
          <div className="toggle"><div>דחוף</div><button type="button" role="switch" aria-checked={form.urgent} className="switch" aria-label="דחוף" onClick={() => setForm({ ...form, urgent: !form.urgent })} /></div>
          <div className="sheet-foot"><Button kind="primary" onClick={async () => { if (!form.title.trim()) return; try { await editShopping(ctx.actor, item, { ...form, title: form.title.trim() }); setEditing(false); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button><Button kind="quiet" onClick={() => setEditing(false)}>ביטול</Button></div>
        </>
      ) : (
        <>
          <div className="detail-list">
            <div className="kv"><Icon name="cart" size={18} /><div>{CATEGORY_LABELS[item.category]}{item.qty ? ` · ${item.qty}` : ''}{item.urgent ? ' · דחוף' : ''}</div></div>
            {item.note && <div className="kv"><Icon name="info" size={18} /><div>{item.note}</div></div>}
            {item.link && <div className="kv"><Icon name="link" size={18} /><a href={item.link} target="_blank" rel="noopener" style={{ color: 'var(--olive)', wordBreak: 'break-all' }}>{item.link}</a></div>}
            <div className="kv"><Icon name="user" size={18} /><div>הוסיף/ה {item.createdBy.name}<br /><span>{fmtDate(item.createdAt)} · {fmtTime(item.createdAt)}</span></div></div>
            {item.bought && item.boughtBy && <div className="kv"><Icon name="check" size={18} /><div>{item.category === 'giveaway' ? 'נמצא על ידי' : 'נקנה על ידי'} {item.boughtBy.name}<br /><span>{fmtDate(item.boughtAt)} · {fmtTime(item.boughtAt)}</span></div></div>}
          </div>
          <Timeline items={activity.items} />
          <div className="sheet-foot">
            <Button kind={item.bought ? 'secondary' : 'primary'} onClick={async () => { await setBought(ctx.actor, item, !item.bought).catch(() => toast({ text: 'לא נשמר', kind: 'error' })); onClose(); }}><Icon name="check" />{item.bought ? 'החזרה לרשימה' : item.category === 'giveaway' ? 'נמצא' : 'נקנה'}</Button>
            <Button kind="quiet" onClick={() => setEditing(true)}><Icon name="edit" />עריכה</Button>
            <Button kind="quiet" onClick={() => onDelete(item)}><Icon name="trash" />מחיקה</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function Timeline({ items, title = 'היסטוריה' }: { items: { id: string; at: string; by: Actor; action: string; text: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="section">
      <div className="section-head"><h2>{title}</h2></div>
      <ol className="timeline">{items.map((a) => <li key={a.id}><span className="tl-dot" /><div><b>{ACTION_LABELS[a.action] || a.action}</b> · {firstName(a.by.name)}<small>{fmtDate(a.at)} · {fmtTime(a.at)}{a.text ? ' · ' + a.text : ''}</small></div></li>)}</ol>
    </div>
  );
}

/** Full purchase history, grouped by day, with "add again". */
export function ShoppingHistoryScreen({ ctx }: { ctx: Ctx }) {
  const [days, setDays] = useState<'30' | '90' | '365'>('30');
  const [cat, setCat] = useState<ShoppingCategory | 'all'>('all');
  const from = useMemo(() => new Date(Date.now() - Number(days) * 86400_000).toISOString(), [days]);
  const { items, loading } = useBoughtHistory(true, from);
  const toast = useToast();
  const list = items.filter((i) => cat === 'all' || i.category === cat);
  const groups = useMemo(() => { const m = new Map<string, ShoppingItem[]>(); for (const i of list) { const k = dateKeyOf(new Date(i.boughtAt!)); (m.get(k) || m.set(k, []).get(k)!).push(i); } return [...m.entries()]; }, [list]);
  const byPerson = useMemo(() => { const m = new Map<string, number>(); for (const i of list) if (i.boughtBy) m.set(i.boughtBy.name, (m.get(i.boughtBy.name) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [list]);
  return (
    <>
      <Segmented value={days} onChange={setDays} options={[{ value: '30', label: 'חודש' }, { value: '90', label: '3 חודשים' }, { value: '365', label: 'שנה' }]} />
      <div className="chips" style={{ marginBottom: 12 }}>{(['all', ...CATS] as const).map((c) => <button key={c} type="button" className={'chip ' + (cat === c ? 'on' : '')} onClick={() => setCat(c)}>{c === 'all' ? 'הכל' : CATEGORY_LABELS[c]}</button>)}</div>
      {byPerson.length > 0 && <div className="stats-grid">{byPerson.slice(0, 3).map(([n, c]) => <div className="stat" key={n}><b>{c}</b><span>{n}</span></div>)}</div>}
      {loading && !items.length ? <div className="loading">טוען…</div> : !groups.length ? <Empty title="אין קניות בתקופה" icon="cart" /> : groups.map(([day, rows]) => (
        <div className="day-group" key={day}><h3>{fmtDayLong(day)} · {rows.length}</h3><div className="list">{rows.map((i) => (
          <div className="row" key={i.id}><div className="row-main"><div className="row-title" style={{ fontSize: 15 }}>{i.title}{i.qty && <span className="qty">{i.qty}</span>}</div><div className="row-meta"><span>{CATEGORY_LABELS[i.category]}</span><span>{i.boughtBy ? firstName(i.boughtBy.name) : ''} · {fmtTime(i.boughtAt)}</span></div></div>
            <Button kind="quiet" className="sm" onClick={async () => { await addShopping(ctx.actor, { title: i.title, qty: i.qty, note: i.note, link: i.link, category: i.category, urgent: false }); toast({ text: `נוסף שוב: ${i.title}` }, 2500); }}><Icon name="plus" />שוב</Button></div>
        ))}</div></div>
      ))}
    </>
  );
}
