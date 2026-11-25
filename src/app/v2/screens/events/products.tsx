// N9 / Q21 stall products (price, shown at the stall; reorder by the handle at the row start, copy from a previous event in ⋯)
// and N10 one product (delete in ⋯ beside "ביטול"; per-product sales live in the Q15 "מה נמכר בדוכן" drill-in).
import { useMemo, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useToast } from '../../core';
import { TopBar, PageTitle, Toggle, Button, Sheet, ListCard, Row, FormHeader, Field, FieldRow, BottomBar, EmptyState, RadioList, RadioRow, MoreMenu, DragHandle, useReorder } from '../../kit';
import { useEvent, useProducts, useAllEvents, useEventTabs, copyProducts, deleteProduct } from '../../../data';
import { nowMs } from '../../../clock';
import { money, ddmm } from '../../format';
import { back } from '../../../router';
import { logActivity } from '../../../activity';
import { useTabsIn, saveProductV2, setProductActive, reorderProducts, type ProductV2 } from '../../data/events';
import { unitsSold, phaseOf } from './logic';
import { FormEnd, Loading, Missing, backTo, link, useRun } from './shared';
import type { FarmEvent } from '../../../types';

// ---------- N9 ----------
export function ProductsScreen({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Products ctx={ctx} e={e} />;
}

function Products({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const run = useRun();
  const products = useProducts(e.id, ctx.manager);
  const [copying, setCopying] = useState(false);
  const list = products.items as ProductV2[];
  const order = useReorder(list, (next) => { run(() => reorderProducts(ctx.actor, e.id, next)); });
  return (
    <AppScreen variant="detail">
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} end={<MoreMenu title="מוצרי הדוכן" items={[{ label: 'העתקה מאירוע קודם', icon: 'calendar', onSelect: () => setCopying(true) }]} />} />
      <PageTitle>מוצרי הדוכן</PageTitle>
      {list.length > 0 ? (
        <section className="k-card k-card--list" aria-label="מוצרי הדוכן">
          <div className="events-prodhead" aria-hidden="true"><span>מוצר ומחיר</span><span>מוצג בדוכן</span></div>
          <ul className="k-list">
            {list.map((p, i) => (
              <li key={p.id} className={p.active ? 'events-prodrow' : 'events-prodrow events-prodrow--off'} style={order.rowStyle(i)}>
                <DragHandle {...order.handle(i, p.name)} />
                <a className="events-prodrow__link" {...link(`/manage/events/${e.id}/products/${p.id}`)}>
                  <span className="events-prodrow__name">{p.name}</span>
                  <b className="events-value">{money(p.price)}</b>
                </a>
                <Toggle checked={p.active} onChange={(v) => run(() => setProductActive(ctx.actor, e.id, p, v))} label={`מוצג בדוכן: ${p.name}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : !products.loading && <EmptyState variant="card" icon="cart" title="עוד אין מוצרים" text="מוסיפים מוצר, או מעתיקים את המוצרים מאירוע קודם." />}
      <Button variant="dashed" size="tall" icon="plus" onClick={() => go(`/manage/events/${e.id}/products/new`)}>מוצר חדש</Button>
      <CopySheet ctx={ctx} e={e} open={copying} onClose={() => setCopying(false)} after={list.reduce((m, p) => Math.max(m, p.sort || 0), 0)} />
    </AppScreen>
  );
}

function CopySheet({ ctx, e, open, onClose, after }: { ctx: V2Ctx; e: FarmEvent; open: boolean; onClose: () => void; after: number }) {
  const toast = useToast(); const run = useRun();
  const all = useAllEvents(ctx.manager && open);
  const others = useMemo(() => all.items.filter((x) => x.id !== e.id && x.start < e.start).slice(0, 12), [all.items, e.id, e.start]);
  const [pick, setPick] = useState('');
  const chosen = pick || others[0]?.id || '';
  const source = useProducts(chosen, open && !!chosen);
  const go2 = async () => {
    const src = others.find((x) => x.id === chosen); if (!src || !source.items.length) return;
    const done = await run(async () => { await copyProducts(chosen, e.id, source.items, after); return true; });
    if (!done) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `הועתקו ${source.items.length} מוצרים מ${src.title}`, { eventId: e.id });
    toast.show({ text: `הועתקו ${source.items.length} מוצרים מ${src.title}`, check: true });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="העתקה מאירוע קודם">
      <div className="events-sheet">
        {others.length ? (
          <RadioList label="מאיזה אירוע">
            {others.map((x) => <RadioRow key={x.id} checked={x.id === chosen} onSelect={() => setPick(x.id)} title={x.title} meta={ddmm(x.start)} />)}
          </RadioList>
        ) : <p className="events-sheet__meta">אין אירועים קודמים</p>}
        <Button size="bar" block disabled={!source.items.length} onClick={go2}>
          {source.items.length ? `העתקת ${source.items.length} מוצרים` : 'אין מוצרים באירוע הזה'}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- N10 ----------
export function ProductForm({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  const products = useProducts(params.id, ctx.manager);
  const pid = params.pid || '';
  const p = pid ? (products.items.find((x) => x.id === pid) as ProductV2 | undefined) : undefined;
  if ((loading && !e) || (pid && products.loading && !p)) return <Loading backLabel="מוצרי הדוכן" parent={`/manage/events/${params.id}/products`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  if (pid && !p) return <Missing backLabel="מוצרי הדוכן" parent={`/manage/events/${e.id}/products`} title="המוצר לא נמצא" />;
  return <Product key={p?.id || 'new'} ctx={ctx} e={e} existing={p} nextSort={products.items.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1} />;
}

function Product({ ctx, e, existing, nextSort }: { ctx: V2Ctx; e: FarmEvent; existing?: ProductV2; nextSort: number }) {
  const toast = useToast(); const run = useRun();
  const [name, setName] = useState(existing?.name || '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [unit, setUnit] = useState(existing?.unit || '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [tried, setTried] = useState(false);
  const parent = `/manage/events/${e.id}/products`;
  const priceN = Number(price.replace(/[^\d.]/g, ''));
  const ok = name.trim().length > 0 && price.trim() !== '' && priceN >= 0;
  const sales = useSalesLine(ctx, e, existing);
  const save = async () => {
    setTried(true); if (!ok) return;
    const id = await run(() => saveProductV2(e.id, { name, price: Math.round(priceN * 100) / 100, active, sort: existing?.sort ?? nextSort, unit }, existing));
    if (!id) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `${existing ? 'מוצר עודכן' : 'מוצר חדש'}: ${name.trim()} · ${money(priceN)}`, { eventId: e.id });
    back(parent);
  };
  const remove = async () => {
    if (!existing) return;
    const done = await run(async () => { await deleteProduct(e.id, existing.id); return true; });
    if (!done) return;
    logActivity(ctx.actor, 'event', e.id, 'edited', `מוצר נמחק: ${existing.name}`, { eventId: e.id });
    const { id, ...rest } = existing;
    toast.show({ text: `${existing.name} נמחק`, check: true, actions: [{ label: 'ביטול', onClick: () => { saveProductV2(e.id, rest, { ...existing, id }); } }] });
    go(parent, true);
  };
  return (
    <AppScreen variant="form" gap={16} bar={
      <BottomBar>
        <Button size="bar" grow onClick={save}>שמירה</Button>
      </BottomBar>
    }>
      {/* rule 6: delete in ⋯ beside "ביטול", then Q8; the undo toast stays */}
      <FormHeader title="מוצר בדוכן" end={<FormEnd onCancel={() => back(parent)} title={existing?.name || ''} items={existing ? [
        { label: 'מחיקה', icon: 'trash', tone: 'danger', confirm: { title: 'למחוק את המוצר?', text: `"${existing.name}" לא יופיע יותר בדוכן. מה שכבר נמכר נשאר בחשבונות.`, onConfirm: () => void remove() } },
      ] : undefined} />} />
      <Field label="שם המוצר" value={name} onChange={(ev) => setName(ev.target.value)} error={tried && !name.trim() ? 'צריך שם למוצר' : undefined} />
      <FieldRow className="events-fieldrow-12">
        <Field grow label="מחיר בשקלים" ltr inputMode="decimal" value={price} onChange={(ev) => setPrice(ev.target.value)} error={tried && price.trim() === '' ? 'צריך מחיר' : undefined} />
        <Field grow label="יחידה" value={unit} onChange={(ev) => setUnit(ev.target.value)} />
      </FieldRow>
      <ListCard>
        <Row minHeight={58} title="מוצג בדוכן" meta="כשכבוי, לא מופיע במסך המכירה" actions={<Toggle checked={active} onChange={setActive} label="מוצג בדוכן" />} />
      </ListCard>
      {sales && <span className="events-softline">{sales}</span>}
    </AppScreen>
  );
}

/** "נמכרו 38 ביריד אוקטובר": this event once it sold, otherwise the latest earlier event that sold it. */
function useSalesLine(ctx: V2Ctx, e: FarmEvent, p?: ProductV2): string {
  const own = useEventTabs(e.id, ctx.manager && !!p);
  const all = useAllEvents(ctx.manager && !!p);
  const past = useMemo(() => all.items.filter((x) => x.id !== e.id && phaseOf(x, nowMs()) === 'after' && x.start < e.start).slice(0, 10), [all.items, e.id, e.start]);
  const tabs = useTabsIn(useMemo(() => past.map((x) => x.id), [past]), ctx.manager && !!p);
  if (!p) return '';
  const here = unitsSold(own.items, p);
  if (here) return `נמכרו ${here} ב${e.title}`;
  for (const x of past) {
    const n = unitsSold(tabs.items.filter((t) => t.eventId === x.id), { name: p.name });
    if (n) return `נמכרו ${n} ב${x.title}`;
  }
  return '';
}
