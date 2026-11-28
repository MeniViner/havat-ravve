import { ConflictError, newId, transact, useList, type Tx } from '../../db';
import { archivedGeneration, catalogGeneration, catalogSelectionId, copiedEventItemId, hasCatalogPair, hasCatalogReference, isCurrentCatalogSelection } from '../../../../shared/farm-catalogs';
import { nowIso } from '../../clock';
import type { Product } from '../../types';

export type FarmCatalog = { id: string; name: string; createdAt: string; updatedAt: string; archived?: boolean; generation?: number };
export type FarmCatalogProduct = FarmCatalog & { price: number };
export const farmCatalogPath = 'farm_catalogs';
const productsPath = (cid: string) => farmCatalogPath + '/' + cid + '/products';
export const useFarmCatalogs = (enabled = true) => useList<FarmCatalog>(farmCatalogPath, {}, enabled);
export const useCatalogProducts = (cid: string, enabled = true) => useList<FarmCatalogProduct>(productsPath(cid || '_'), {}, enabled && !!cid);
export const sortedCatalogRows = <T extends FarmCatalog>(rows: T[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id));
export { catalogSelectionId as selectionId } from '../../../../shared/farm-catalogs';

export type CatalogEdition = { catalog?: FarmCatalog; product?: FarmCatalogProduct; kind: 'catalog' | 'product' };
function unchanged(now: FarmCatalog | FarmCatalogProduct | null, old: FarmCatalog | FarmCatalogProduct) {
  if (!now || now.name !== old.name || now.updatedAt !== old.updatedAt || !!now.archived !== !!old.archived || catalogGeneration(now.generation) !== catalogGeneration(old.generation) ||
    ('price' in old && (!('price' in now) || now.price !== old.price))) {
    throw new ConflictError('הפרטים השתנו. פתחו את העריכה מחדש.');
  }
}
export async function saveCatalogEntry(edit: CatalogEdition, name: string, price?: number): Promise<string> {
  const clean = name.trim();
  if (!clean || clean.length > 100) throw new Error('יש למלא שם באורך של עד 100 תווים.');
  const product = edit.kind === 'product';
  if (product && (!edit.catalog || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1000000)) throw new Error('יש למלא מחיר תקין.');
  const path = product ? productsPath(edit.catalog!.id) : farmCatalogPath;
  const old = product ? edit.product : edit.catalog;
  const id = old?.id || newId(path);
  await transact(async (tx) => {
    if (product) {
      const parent = await tx.get<FarmCatalog>(farmCatalogPath, edit.catalog!.id);
      if (!parent || parent.archived) throw new ConflictError('הקטלוג הועבר לארכיון.');
    }
    const fields = { name: clean, ...(product ? { price: Math.round(price! * 100) / 100 } : {}), updatedAt: nowIso() };
    if (old) {
      unchanged(await tx.get<FarmCatalogProduct>(path, id), old);
      if (old.archived) throw new ConflictError('כדי לערוך יש להחזיר את הפריט מהארכיון.');
      tx.update(path, id, fields);
    } else tx.set(path, id, { ...fields, createdAt: fields.updatedAt });
  }, { serverOnly: true });
  return id;
}
/** Archiving a catalog hides all children together. Their own archive flags survive restoring the parent. */
export async function archiveCatalogEntry(catalog: FarmCatalog, product: FarmCatalogProduct | undefined, archived: boolean) {
  const path = product ? productsPath(catalog.id) : farmCatalogPath;
  const item = product || catalog;
  await transact(async (tx) => {
    if (product) {
      const parent = await tx.get<FarmCatalog>(farmCatalogPath, catalog.id);
      if (!parent || parent.archived) throw new ConflictError('יש להחזיר את הקטלוג מהארכיון תחילה.');
    }
    const current = await tx.get<FarmCatalogProduct>(path, item.id);
    if (!current) throw new ConflictError('הפריט לא נמצא.');
    if (!!current.archived === archived) return;
    unchanged(current, item);
    tx.update(path, item.id, { archived, generation: archivedGeneration(current, archived), updatedAt: nowIso() });
  }, { serverOnly: true });
}
async function ensureStallMarker(tx: Tx, eventId: string) {
  const path = 'events/' + eventId + '/stall_config';
  if (!(await tx.get(path, 'catalog'))) tx.set(path, 'catalog', {enabled: true});
}
export async function selectCatalogProduct(eventId: string, cid: string, pid: string, active: boolean, after = 0, existingId?: string) {
  const col = 'events/' + eventId + '/products', id = existingId || catalogSelectionId(cid, pid);
  await transact(async (tx) => {
    const old = await tx.get<Product>(col, id);
    if (old && (old.catalogId !== cid || old.catalogProductId !== pid)) throw new ConflictError('שיוך המוצר השתנה.');
    if (!active && !old?.active) return;
    if (!active) { tx.update(col, id, { active: false }); return; }
    const catalog = await tx.get<FarmCatalog>(farmCatalogPath, cid);
    const product = await tx.get<FarmCatalogProduct>(productsPath(cid), pid);
    if (!catalog || catalog.archived || !product || product.archived) throw new ConflictError('המוצר או הקטלוג שלו הועברו לארכיון.');
    await ensureStallMarker(tx, eventId);
    if (old && isCurrentCatalogSelection(old, catalog, product)) return;
    const snapshot = { catalogGeneration: catalogGeneration(catalog.generation), catalogProductGeneration: catalogGeneration(product.generation), catalogId: cid, catalogProductId: pid, name: product.name, price: product.price, active: true, sort: old?.sort ?? after + 1 };
    if (old) tx.update(col, id, snapshot); else tx.set(col, id, snapshot);
  }, { serverOnly: true });
}

/** A linked selection follows the active farm catalog. A one-off keeps its prior event values. */
export async function copyFarmProducts(from: string, to: string, products: Product[], after = 0) {
  if (from === to) throw new Error('יש לבחור אירוע אחר להעתקה.');
  const col = 'events/' + to + '/products';
  let count = 0;
  for (const source of [...products].sort((a, b) => a.sort - b.sort)) {
    const ci = source.catalogId, pi = source.catalogProductId;
    if (hasCatalogReference(source) && (!hasCatalogPair(source) || !source.active)) continue;
    const id = ci && pi ? catalogSelectionId(ci, pi) : copiedEventItemId(from, source.id);
    const added = await transact(async (tx) => {
      const existing = await tx.get<Product>(col, id);
      if (existing && (!ci || !pi || existing.catalogId !== ci || existing.catalogProductId !== pi)) return false;
      let name = source.name, price = source.price;
      let catalogFields = {};
      if (ci && pi) {
        const catalog = await tx.get<FarmCatalog>(farmCatalogPath, ci);
        const product = await tx.get<FarmCatalogProduct>(productsPath(ci), pi);
        if (!catalog || !product || !isCurrentCatalogSelection(source, catalog, product)) return false;
        await ensureStallMarker(tx, to);
        if (existing && isCurrentCatalogSelection(existing, catalog, product)) return false;
        name = product.name; price = product.price;
        catalogFields = { catalogId: ci, catalogProductId: pi, catalogGeneration: catalogGeneration(catalog.generation), catalogProductGeneration: catalogGeneration(product.generation) };
      }
      const fields = { name, price, active: source.active !== false, sort: existing?.sort ?? after + count + 1, ...catalogFields };
      if (existing) tx.update(col, id, fields); else tx.set(col, id, fields);
      return true;
    }, { serverOnly: true });
    if (added) count++;
  }
  return count;
}
