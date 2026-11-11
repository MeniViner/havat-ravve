import { useMemo, useState } from 'react';
import type { ShoppingItem, ShoppingCategory } from '../types';
import { CATEGORY_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Sec, Row, Chk, Pill, Btn, Icon, A, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Loading, Fab, useToast, useUndoable, firstName, relTime, whenText, fmtTime, useDesktop, useOpenSections, addDays, todayISO } from '../ui';
import { navigate } from '../router';
import { setBought, addShopping, editShopping, deleteShopping, restoreShopping, useShoppingItem, useBoughtHistory, type NewShopping } from '../store';
import { useActivityFor, ACTION_LABELS } from '../activity';

const CATS: ShoppingCategory[] = ['super', 'building', 'online', 'giveaway'];
const CAT_TITLE: Record<ShoppingCategory, string> = { super: 'סופר', building: 'חומרי בניין', online: 'להזמין באינטרנט', giveaway: 'למסירה' };
const CAT_HINT: Partial<Record<ShoppingCategory, string>> = { giveaway: 'נשמח לקבל בחינם' };

/** Marks an item bought (or back on the list) with a toast that can undo it. Shared with the Today screen. */
export function useMarkBought(ctx: TeamCtx) {
  const toast = useToast();
  return (i: ShoppingItem, v: boolean) => setBought(ctx.actor, i, v).then(() => { if (v) toast({ text: `${i.title} · ${i.category === 'giveaway' ? 'נמצא' : 'נקנה'}`, action: { label: 'ביטול', onClick: () => { setBought(ctx.actor, i, false).catch(() => {}); } } }, 4000); }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
}
/** One line on the shopping note: tick box in the margin, the item, and the quantity at the end of the line like on paper. */
export function ShopLine({ i, onMark, selected }: { i: ShoppingItem; onMark: (v: boolean) => void; selected?: boolean }) {
  const done = i.bought;
  return (
    <div className={`line${done ? ' done' : ''}${i.urgent && !done ? ' urgent' : ''}${selected ? ' sel' : ''}`}>
      <Chk on={done} onChange={onMark} label={done ? `להחזיר לרשימה: ${i.title}` : `נקנה: ${i.title}`} rust={i.urgent} />
      <A to={`/shopping/${i.id}`} className="body">
        <span className="tx">
          <span className="t">{i.title}{i.urgent && !done && <> <Pill tone="rust">דחוף</Pill></>}</span>
          <span className="m">{done ? <>{firstName(i.boughtBy?.name || '')} {i.category === 'giveaway' ? 'מצא/ה' : 'קנה/תה'} · {fmtTime(i.boughtAt)}</> : <>{firstName(i.createdBy.name)} · {relTime(i.createdAt)}{i.note ? ` · ${i.note}` : ''}{i.link && <> <Icon name="link" size={13} /></>}</>}</span>
        </span>
        {i.qty && <span className="q">{i.qty}</span>}
      </A>
    </div>
  );
}


export function ShoppingScreen({ ctx, open, recent, loading, selectedId }: { ctx: TeamCtx; open: ShoppingItem[]; recent: ShoppingItem[]; loading: boolean; selectedId?: string }) {
  const desktop = useDesktop();
  const [cat, setCat] = useState<ShoppingCategory | 'all'>('all');
  const history = useBoughtHistory(true, addDays(todayISO(), -90) + 'T00:00:00.000Z');
  const toast = useToast();
  const mark = useMarkBought(ctx);
  const urgent = open.filter((i) => i.urgent).length;
  const sorted = useMemo(() => [...open].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt)), [open]);
  const usual = useMemo(() => {
    const count = new Map<string, { n: number; item: ShoppingItem }>();
    for (const i of history.items) { const k = i.title.trim(); const c = count.get(k); count.set(k, { n: (c?.n || 0) + 1, item: i }); }
    return [...count.values()].filter((c) => !open.some((o) => o.title.trim() === c.item.title.trim())).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [history.items, open]);
  const { isOpen, toggle } = useOpenSections([...CATS, 'bought'], 'shopping');
  const quick = (i: ShoppingItem) => addShopping(ctx.actor, { title: i.title, qty: i.qty, note: '', link: i.link, category: i.category, urgent: false }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const shown = desktop ? CATS : CATS.filter((c) => (cat === 'all' ? sorted.some((i) => i.category === c) : cat === c));
  const pad = (c: ShoppingCategory) => {
    const items = sorted.filter((i) => i.category === c);
    const openPad = desktop || isOpen(c);
    return (
      <section key={c} className="notepad" aria-label={CATEGORY_LABELS[c]}>
        <button type="button" className={'note-head' + (openPad ? '' : ' closed')} onClick={() => !desktop && toggle(c)} aria-expanded={openPad} disabled={desktop}>
          <span>{CAT_TITLE[c]}{CAT_HINT[c] && <small> · {CAT_HINT[c]}</small>}</span><span className="n">{items.length || 'ריק'}{!desktop && <Icon name="down" size={16} />}</span>
        </button>
        {openPad && (items.length ? items.map((i) => <ShopLine key={i.id} i={i} selected={i.id === selectedId} onMark={(v) => mark(i, v)} />) : <p className="note-empty">אין מה לקנות כאן.</p>)}
      </section>
    );
  };
  return (
    <>
      <Top title="קניות" sub={`${open.length} פריטים${urgent ? ` · ${urgent} דחוף` : ''}${desktop ? '. מסמנים מה שנקנה, והוא נשאר מחוק ברשימה 24 שעות.' : ''}`}
        end={desktop ? <><Btn kind="ghost" size="sm" icon="history" to="/history/shopping">היסטוריית קניות</Btn><Btn kind="ghost" size="sm" icon="print" onClick={() => window.print()}>רשימה להדפסה</Btn><Btn size="sm" icon="plus" to="/shopping/new">פריט חדש</Btn></> : <Btn kind="quiet" size="sm" icon="history" to="/history/shopping">היסטוריה</Btn>} />
      {!desktop && <div style={{ paddingTop: 8 }}><Chips scroll value={cat} onChange={setCat} options={[{ value: 'all', label: 'הכל', n: open.length }, ...CATS.map((c) => ({ value: c, label: CATEGORY_LABELS[c], n: open.filter((i) => i.category === c).length || undefined }))]} /></div>}
      {loading && !open.length ? <Loading /> : !open.length && !recent.length ? <Empty title="הרשימה ריקה" text="מה שחסר, מוסיפים בכפתור הפלוס. כולם רואים מיד." /> : (
        <div className="notes">
          {shown.map(pad)}
          {recent.length > 0 && (cat === 'all' || desktop) && (
            <section className="notepad bought" aria-label="נקנה ביממה האחרונה">
              <button type="button" className={'note-head' + (desktop || isOpen('bought') ? '' : ' closed')} onClick={() => !desktop && toggle('bought')} aria-expanded={desktop || isOpen('bought')} disabled={desktop}><span>נקנה<small> · ביממה האחרונה</small></span><span className="n">{recent.length}{!desktop && <Icon name="down" size={16} />}</span></button>
              {(desktop || isOpen('bought')) && recent.map((i) => <ShopLine key={i.id} i={i} onMark={(v) => mark(i, v)} />)}
            </section>
          )}
        </div>
      )}
      {usual.length > 0 && <><Sec title="קונים בדרך כלל" /><div className="chips" style={{ padding: '4px 20px 0' }}>{usual.map((u) => <Chip key={u.item.id} onClick={() => quick(u.item)}><Icon name="plus" size={14} />{u.item.title}</Chip>)}</div></>}
      {!desktop && <Fab items={[{ icon: 'plus', label: 'פריט חדש', to: '/shopping/new' }]} />}
    </>
  );
}

// ---------- item (detail + edit) ----------
export function ShopItemPage({ id, ctx, panel }: { id: string; ctx: TeamCtx; panel?: boolean }) {
  const { item, loading } = useShoppingItem(id);
  if (loading) return <Loading />;
  if (!item) return <><Top backTo="/shopping" title="הפריט לא נמצא" /><Empty title="אולי נמחק או נקנה מזמן" action={<Btn kind="ghost" to="/shopping">לרשימה</Btn>} /></>;
  return <ShopForm ctx={ctx} existing={item} panel={panel} />;
}
export function ShopForm({ ctx, existing, panel }: { ctx: TeamCtx; existing?: ShoppingItem; panel?: boolean }) {
  const toast = useToast(); const undoable = useUndoable();
  const [f, setF] = useState<NewShopping>(() => existing ? { title: existing.title, qty: existing.qty, note: existing.note, link: existing.link, category: existing.category, urgent: existing.urgent } : { title: '', qty: '', note: '', link: '', category: 'super', urgent: false });
  const [busy, setBusy] = useState(false);
  const log = useActivityFor(existing?.id || '', !!existing);
  const set = (p: Partial<NewShopping>) => setF((s) => ({ ...s, ...p }));
  const dirty = !existing || JSON.stringify(f) !== JSON.stringify({ title: existing.title, qty: existing.qty, note: existing.note, link: existing.link, category: existing.category, urgent: existing.urgent });
  const save = async () => {
    if (!f.title.trim()) return; setBusy(true);
    try { if (existing) await editShopping(ctx.actor, existing, f); else await addShopping(ctx.actor, f); navigate('/shopping', true); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); }
  };
  const bought = () => existing && setBought(ctx.actor, existing, !existing.bought).then(() => navigate('/shopping', true)).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  return (
    <>
      <Top backTo={panel ? undefined : '/shopping'} back={panel} backLabel={panel ? 'סגירה' : 'קניות'} title={existing ? existing.title : 'פריט חדש'} sub={existing ? `${CATEGORY_LABELS[existing.category]} · ${firstName(existing.createdBy.name)} הוסיף/ה · ${relTime(existing.createdAt)}` : undefined} />
      <Field><div className="chips">{CATS.map((c) => <Chip key={c} on={f.category === c} onClick={() => set({ category: c })}>{CATEGORY_LABELS[c]}</Chip>)}</div></Field>
      <Field><Input big autoFocus={!existing} placeholder="מה לקנות?" value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="כמות (לא חובה)"><Input placeholder="6 קרטונים, 2 חבילות, 50 מ׳" value={f.qty} onChange={(e) => set({ qty: e.target.value })} /></Field>
      {(f.category === 'online' || f.link) && <Field label="קישור"><Input dir="ltr" inputMode="url" placeholder="https://" value={f.link} onChange={(e) => set({ link: e.target.value })} /></Field>}
      <Field label="הערה (לא חובה)"><Textarea rows={2} placeholder="מהסוג הגס, מהחנות ליד הצומת" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      <div style={{ marginTop: 14 }}><SwitchRow on={f.urgent} onChange={(urgent) => set({ urgent })} title="דחוף" meta="עולה לראש הרשימה אצל כולם" /></div>
      {existing && <>
        <Sec title="היסטוריה של הפריט" n={log.items.length || undefined} />
        <div className="list">{log.items.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}</span>} meta={<span>{whenText(a.at)}</span>} />)}{!log.items.length && <p className="lead">נוסף {whenText(existing.createdAt)} · {existing.createdBy.name}</p>}</div>
      </>}
      <div className="actions sticky">
        {existing && !existing.bought && <Btn size="big" icon="check" onClick={bought}>{existing.category === 'giveaway' ? 'נמצא' : 'נקנה'}</Btn>}
        {existing && existing.bought && <Btn kind="ghost" onClick={bought}>להחזיר לרשימה</Btn>}
        {dirty && <Btn kind={existing ? 'ghost' : 'primary'} size={existing ? undefined : 'big'} disabled={!f.title.trim() || busy} onClick={save}>{existing ? 'שמירת השינויים' : 'הוספה'}</Btn>}
        {existing && <Btn kind="danger" size="sm" onClick={() => undoable('הפריט נמחק', async () => { await deleteShopping(ctx.actor, existing); navigate('/shopping', true); }, () => restoreShopping(existing))}>מחיקה מהרשימה</Btn>}
      </div>
    </>
  );
}

