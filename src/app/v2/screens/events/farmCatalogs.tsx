import { useCallback, useState } from 'react';
import { useParam, navigate } from '../../../router';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go } from '../../core';
import { Button, EmptyState, Field, ListCard, PageTitle, Row, Sheet, Tag, TopBar } from '../../kit';
import { money } from '../../format';
import { archiveCatalogEntry, saveCatalogEntry, sortedCatalogRows, useCatalogProducts, useFarmCatalogs, type CatalogEdition, type FarmCatalog, type FarmCatalogProduct } from '../../data/farmCatalogs';
import { catalogManagementPath } from './catalogs';

export function FarmCatalogsScreen({ ctx }: ScreenProps) {
  const eid = useParam('event'), cid = useParam('catalog');
  const catalogs = useFarmCatalogs(ctx.manager), products = useCatalogProducts(cid, ctx.manager);
  const [archive, showArchive] = useState(false), [editor, setEditor] = useState<CatalogEdition | null>(null);
  const [change, setChange] = useState<{ catalog: FarmCatalog; product?: FarmCatalogProduct } | null>(null);
  const closeEdit = useCallback(() => setEditor(null), []), closeChange = useCallback(() => setChange(null), []);
  const current = catalogs.items.find((c) => c.id === cid);
  const open = (id: string) => { showArchive(false); navigate(catalogManagementPath(eid, id)); };
  const exit = () => go(eid ? '/manage/events/' + encodeURIComponent(eid) + '/products' : '/manage/events');
  if (!ctx.manager) return <AppScreen variant="detail"><PageTitle>אין גישה לניהול הקטלוגים</PageTitle></AppScreen>;
  const header = <TopBar back={{ label: current ? 'כל הקטלוגים' : eid ? 'בחירת מוצרים לאירוע' : 'אירועים', onClick: current ? () => open('') : exit }} />;
  const visibleCatalogs = sortedCatalogRows(catalogs.items.filter((c) => archive || !c.archived));
  const visibleProducts = sortedCatalogRows(products.items.filter((p) => archive || !p.archived));
  return <AppScreen variant="detail" gap={12}>
    {header}
    <PageTitle>{current ? current.name : 'ניהול הקטלוגים והמוצרים'}</PageTitle>
    {eid && <Button variant="quiet" onClick={exit}>חזרה לבחירת המוצרים באירוע</Button>}
    {cid && !current ? <p role="status">{catalogs.loading ? 'טוען את הקטלוג…' : 'הקטלוג לא נמצא.'}</p> : current ? <>
      {current.archived && <Tag tone="warm">קטלוג בארכיון</Tag>}
      <div className="events-btnrow">
        {!current.archived && <Button icon="plus" onClick={() => setEditor({ kind: 'product', catalog: current })}>הוספת מוצר לקטלוג</Button>}
        {!current.archived && <Button variant="outline" onClick={() => setEditor({ kind: 'catalog', catalog: current })}>עריכת שם הקטלוג</Button>}
        <Button variant="quiet" onClick={() => setChange({ catalog: current })}>{current.archived ? 'החזרת הקטלוג מהארכיון' : 'העברת הקטלוג לארכיון'}</Button>
      </div>
      <ListCard title="מוצרים ומחירים">{visibleProducts.map((p) => <Row key={p.id} title={p.name} value={money(p.price)}
        tags={p.archived && <Tag tone="warm">בארכיון</Tag>}
        onClick={current.archived ? undefined : () => p.archived ? setChange({ catalog: current, product: p }) : setEditor({ kind: 'product', catalog: current, product: p })} />)}</ListCard>
      {!products.loading && !visibleProducts.length && <p className="k-note">אין מוצרים בתצוגה הזאת.</p>}
    </> : <>
      <p className="k-note">כאן מנהלים את הקטלוגים של דוכן החווה. בכל אירוע אפשר לבחור מהם מוצרים למכירה.</p>
      <Button icon="plus" onClick={() => setEditor({ kind: 'catalog' })}>הוספת קטלוג</Button>
      {!!visibleCatalogs.length && <ListCard title="קטלוגי החווה">{visibleCatalogs.map((c) => <Row key={c.id} title={c.name} tags={c.archived && <Tag tone="warm">בארכיון</Tag>} onClick={() => open(c.id)} />)}</ListCard>}
      {!catalogs.loading && !visibleCatalogs.length && <EmptyState variant="card" title="אין קטלוגים בתצוגה הזאת" />}
    </>}
    {(!cid || current) && <label className="events-checkline"><input type="checkbox" checked={archive} onChange={(e) => showArchive(e.target.checked)} />{current ? 'הצגת מוצרים בארכיון' : 'הצגת קטלוגים בארכיון'}</label>}
    {editor && <CatalogEditor key={[editor.kind, editor.catalog?.id, editor.product?.id].join('/')} edit={editor} close={closeEdit}
      saved={(id) => { closeEdit(); if (editor.kind === 'catalog' && !editor.catalog) open(id); }}
      archive={() => { if (editor.catalog && editor.product) setChange({ catalog: editor.catalog, product: editor.product }); closeEdit(); }} />}
    {change && <ArchiveSheet {...change} close={closeChange} />}
  </AppScreen>;
}
function CatalogEditor({ edit, close, saved, archive }: { edit: CatalogEdition; close: () => void; saved: (id: string) => void; archive: () => void }) {
  const isProduct = edit.kind === 'product', record = isProduct ? edit.product : edit.catalog;
  const [name, setName] = useState(record?.name || ''), [price, setPrice] = useState(edit.product ? String(edit.product.price) : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const valid = !!name.trim() && (!isProduct || !!price.trim() && Number.isFinite(Number(price)) && +price >= 0 && +price <= 1000000);
  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try { saved(await saveCatalogEntry(edit, name, isProduct ? Number(price) : undefined)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Sheet open onClose={close} title={isProduct ? record ? 'עריכת מוצר ומחיר' : 'הוספת מוצר לקטלוג' : record ? 'עריכת שם הקטלוג' : 'הוספת קטלוג'}>
    <form className="events-sheet" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Field label={isProduct ? 'שם המוצר' : 'שם הקטלוג'} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      {isProduct && <Field label="מחיר בשקלים" type="number" min="0" max="1000000" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" size="bar" disabled={busy || !valid}>שמירה</Button>
      {edit.product && <Button type="button" variant="quiet" disabled={busy} onClick={archive}>העברת המוצר לארכיון</Button>}
    </form>
  </Sheet>;
}
function ArchiveSheet({ catalog, product, close }: { catalog: FarmCatalog; product?: FarmCatalogProduct; close: () => void }) {
  const item = product || catalog, restore = !!item.archived;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    if (busy) return; setBusy(true);
    try { await archiveCatalogEntry(catalog, product, !restore); close(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const detail = restore ? product ? 'המוצר יחזור לרשימת הבחירה. כדי למכור אותו שוב, יש לבחור אותו מחדש בכל אירוע.' : 'הקטלוג ומוצריו הפעילים יחזרו לרשימת הבחירה. יש לבחור מחדש את המוצרים שיימכרו בכל אירוע.'
    : product ? 'המכירה של המוצר תיפסק מיד בכל האירועים הפתוחים. מכירות שכבר נרשמו ומחיריהן נשמרים.' : 'מכירת כל מוצרי הקטלוג תיפסק מיד בכל האירועים הפתוחים. המוצרים נשארים בקטלוג וכל המכירות שכבר נרשמו ומחיריהן נשמרים.';
  return <Sheet open onClose={close} title={(restore ? 'להחזיר את ' : 'להעביר לארכיון את ') + item.name + '?'}><div className="events-sheet">
    <p>{detail}</p>{error && <p role="alert">{error}</p>}
    <Button size="bar" variant={restore ? 'primary' : 'danger'} disabled={busy} onClick={confirm}>{restore ? 'החזרה מהארכיון' : 'העברה לארכיון'}</Button>
    <Button variant="outline" disabled={busy} onClick={close}>ביטול</Button>
  </div></Sheet>;
}
