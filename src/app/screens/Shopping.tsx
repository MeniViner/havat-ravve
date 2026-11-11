import { useMemo, useState } from 'react';
import type { ShoppingItem, ShoppingCategory } from '../types';
import { CATEGORY_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Sec, Row, Chk, Pill, Btn, Icon, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Loading, Fab, useToast, useUndoable, firstName, relTime, whenText, fmtTime, useDesktop, useOpenSections, addDays, todayISO } from '../ui';
import { navigate } from '../router';
import { setBought, addShopping, editShopping, deleteShopping, restoreShopping, useShoppingItem, useBoughtHistory, type NewShopping } from '../store';
import { useActivityFor, ACTION_LABELS } from '../activity';

const CATS: ShoppingCategory[] = ['super', 'building', 'online', 'giveaway'];
const CAT_TITLE: Record<ShoppingCategory, string> = { super: 'לקנות בסופר', building: 'חומרי בניין', online: 'להזמין באינטרנט', giveaway: 'למסירה · נשמח לקבל בחינם' };

export function ShoppingScreen({ ctx, open, recent, loading, selectedId }: { ctx: TeamCtx; open: ShoppingItem[]; recent: ShoppingItem[]; loading: boolean; selectedId?: string }) {
  const desktop = useDesktop();
  const [cat, setCat] = useState<ShoppingCategory | 'all'>('all');
  const history = useBoughtHistory(true, addDays(todayISO(), -90) + 'T00:00:00.000Z');
  const toast = useToast();
  const urgent = open.filter((i) => i.urgent).length;
  const sorted = useMemo(() => [...open].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt)), [open]);
  const usual = useMemo(() => {
    const count = new Map<string, { n: number; item: ShoppingItem }>();
    for (const i of history.items) { const k = i.title.trim(); const c = count.get(k); count.set(k, { n: (c?.n || 0) + 1, item: i }); }
    return [...count.values()].filter((c) => !open.some((o) => o.title.trim() === c.item.title.trim())).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [history.items, open]);
  const { isOpen, toggle } = useOpenSections([...CATS, 'bought'], 'shopping');
  const mark = (i: ShoppingItem, v: boolean) => setBought(ctx.actor, i, v).then(() => { if (v) toast({ text: `${i.title} · נקנה`, action: { label: 'ביטול', onClick: () => setBought(ctx.actor, i, false) } }, 4000); }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const quick = (i: ShoppingItem) => addShopping(ctx.actor, { title: i.title, qty: i.qty, note: '', link: i.link, category: i.category, urgent: false }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const groups = CATS.map((c) => ({ c, items: sorted.filter((i) => i.category === c) })).filter((g) => g.items.length && (cat === 'all' || cat === g.c));
  const itemRow = (i: ShoppingItem) => <Row key={i.id} to={`/shopping/${i.id}`} className={i.id === selectedId ? 'sel' : ''} start={<Chk on={false} onChange={(v) => mark(i, v)} label={`נקנה: ${i.title}`} rust={i.urgent} />}
    title={<>{i.title}{i.qty && <span className="muted" style={{ fontWeight: 400 }}> {i.qty}</span>}</>} meta={<>{i.urgent && <Pill tone="rust">דחוף</Pill>}<span>{firstName(i.createdBy.name)} · {relTime(i.createdAt)}</span>{i.note && <span>{i.note}</span>}{i.link && <Icon name="link" />}</>} />;
  return (
    <>
      <Top title="קניות" sub={`${open.length} פריטים${urgent ? ` · ${urgent} דחוף` : ''}${desktop ? '. ריבוע = נקנה. נשאר בקו חוצה 24 שעות ואז עובר להיסטוריה.' : ''}`}
        end={desktop ? <><Btn kind="ghost" size="sm" icon="history" to="/history/shopping">היסטוריית קניות</Btn><Btn kind="ghost" size="sm" icon="print" onClick={() => window.print()}>רשימה להדפסה</Btn><Btn size="sm" icon="plus" to="/shopping/new">פריט חדש</Btn></> : <Btn kind="quiet" size="sm" icon="history" to="/history/shopping">היסטוריה</Btn>} />
      {!desktop && <div style={{ paddingTop: 8 }}><Chips scroll value={cat} onChange={setCat} options={[{ value: 'all', label: 'הכל', n: open.length }, ...CATS.map((c) => ({ value: c, label: CATEGORY_LABELS[c], n: open.filter((i) => i.category === c).length || undefined }))]} /></div>}
      {loading && !open.length ? <Loading /> : !open.length ? <Empty title="הרשימה ריקה" text="מה שחסר, מוסיפים בכפתור למטה. כולם רואים מיד." /> : desktop ? (
        <div className="cols" style={{ padding: '0 0 0', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 0 }}>{CATS.map((c) => { const items = sorted.filter((i) => i.category === c); return <div key={c}><Sec title={CATEGORY_LABELS[c]} n={items.length} />{items.length ? <div className="list">{items.map(itemRow)}</div> : <p className="lead">ריק</p>}{c === 'giveaway' && <p className="note">דברים שנשמח לקבל בחינם. האם להציג גם לאורחים באתר? עדיין פתוח באפיון.</p>}</div>; })}</div>
      ) : groups.map((g) => <div key={g.c}><Sec title={CAT_TITLE[g.c]} n={g.items.length} open={isOpen(g.c)} onToggle={() => toggle(g.c)} />{isOpen(g.c) && <div className="list">{g.items.map(itemRow)}</div>}</div>)}
      {recent.length > 0 && (cat === 'all' || desktop) && <>
        <Sec title="נקנה ביממה האחרונה" n={recent.length} open={isOpen('bought')} onToggle={() => toggle('bought')} />
        {isOpen('bought') && <div className="list">{recent.map((i) => <Row key={i.id} done to={`/shopping/${i.id}`} start={<Chk on onChange={(v) => mark(i, v)} label={`להחזיר לרשימה: ${i.title}`} />} title={<>{i.title}{i.qty && <span> · {i.qty}</span>}</>} meta={<span>{firstName(i.boughtBy?.name || '')} {i.category === 'giveaway' ? 'מצא/ה' : 'קנה/תה'} · {fmtTime(i.boughtAt)}</span>} />)}</div>}
      </>}
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

