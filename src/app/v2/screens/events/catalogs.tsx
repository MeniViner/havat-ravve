// Event selection only. The farm-wide editors live at /manage/farm-catalogs.
import { useState } from 'react';
import { isCurrentCatalogSelection } from '../../../../../shared/farm-catalogs';
import type { FarmEvent, Product } from '../../../types';
import { Button, CheckButton, ListCard, Row } from '../../kit';
import { go } from '../../core';
import { money } from '../../format';
import { selectCatalogProduct, sortedCatalogRows, useCatalogProducts, useFarmCatalogs, type FarmCatalog, type FarmCatalogProduct } from '../../data/farmCatalogs';
import { useRun } from './shared';

export function catalogManagementPath(eventId = '', catalogId = '') {
  const query = new URLSearchParams();
  if (eventId) query.set('event', eventId);
  if (catalogId) query.set('catalog', catalogId);
  return '/manage/farm-catalogs' + (query.size ? '?' + query.toString() : '');
}
export function EventCatalogs({ event, chosen }: { event: FarmEvent; chosen: Product[] }) {
  const source = useFarmCatalogs();
  const catalogs = sortedCatalogRows(source.items.filter((c) => !c.archived));
  return <>
    <div className="events-sheet"><h2>בחירה מקטלוגים לאירוע</h2>
      <p className="k-note">אפשר לבחור מוצרים מכמה קטלוגים. המחיר לאירוע נשמר בעת הבחירה.</p>
      <Button variant="outline" onClick={() => go(catalogManagementPath(event.id))}>ניהול כל הקטלוגים והמוצרים</Button>
    </div>
    {catalogs.length > 0 && <ListCard title="קטלוגים לבחירה">{catalogs.map((c) => <SelectionGroup key={c.id} event={event} catalog={c} chosen={chosen} />)}</ListCard>}
    {!source.loading && !catalogs.length && <p className="k-note">אין כרגע קטלוגים פעילים לבחירה.</p>}
  </>;
}
function SelectionGroup({ event, catalog, chosen }: { event: FarmEvent; catalog: FarmCatalog; chosen: Product[] }) {
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState('');
  const linked = chosen.filter((p) => p.catalogId === catalog.id && p.active);
  const source = useCatalogProducts(catalog.id, expanded || !!linked.length), run = useRun();
  const selected = linked.filter((p) => isCurrentCatalogSelection(p, catalog, source.items.find((m) => m.id === p.catalogProductId)));
  const rows = sortedCatalogRows(source.items.filter((p) => !p.archived));
  async function toggle(product: FarmCatalogProduct) {
    if (busy) return;
    setBusy(product.id);
    const old = selected.find((p) => p.catalogProductId === product.id) || chosen.find((p) => p.catalogId === catalog.id && p.catalogProductId === product.id);
    await run(() => selectCatalogProduct(event.id, catalog.id, product.id, !selected.some((p) => p.id === old?.id), Math.max(0, ...chosen.map((p) => p.sort || 0)), old?.id));
    setBusy('');
  }
  return <><Row title={catalog.name} meta={selected.length + ' נבחרו לאירוע'} onClick={() => setExpanded(!expanded)} />
    {expanded && <li className="events-catalog">
      <ul className="k-list">{rows.map((p) => {
        const snapshot = selected.find((r) => r.catalogProductId === p.id);
        return <Row key={p.id} title={p.name} value={money(p.price)}
          meta={snapshot && snapshot.price !== p.price ? 'המחיר שנבחר לאירוע הוא ' + money(snapshot.price) : undefined}
          check={<CheckButton checked={!!snapshot} label={'בחירת ' + p.name + ' לאירוע'} disabled={!!busy} onChange={() => void toggle(p)} />} />;
      })}</ul>
      {!source.loading && !rows.length && <p className="k-note">אין מוצרים פעילים בקטלוג הזה.</p>}
    </li>}
  </>;
}
