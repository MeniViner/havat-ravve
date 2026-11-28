import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { hasCatalogReference, isCurrentCatalogSelection } from '../../../../shared/farm-catalogs';
import { db } from '../../firebase';
import type { ListState } from '../../db';
import { demoDoc, useDemo, useDemoStates, useDemoVersion } from '../../demo/store';
import { useOnline } from '../../store';
import type { Product } from '../../types';

type Source = { archived?: boolean; generation?: number };
type Master = { value: Source | null; verified: boolean; error?: 'denied' | 'connection' };
export type SaleAvailability = 'available' | 'checking' | 'connection' | 'unavailable';
type Watch = { stop: () => void };
const catalogPath = (id: string) => 'farm_catalogs/' + id;
const productPath = (catalog: string, product: string) => catalogPath(catalog) + '/products/' + product;
const validId = (id: unknown): id is string => typeof id === 'string' && !!id && !id.includes('/');

function assess(p: Product, online: boolean, lookup: (path: string) => Master | undefined): SaleAvailability {
  if (p.active === false) return 'unavailable';
  if (!hasCatalogReference(p)) return 'available'; // Some older event products lack an active field.
  if (!validId(p.catalogId) || !validId(p.catalogProductId)) return 'unavailable';
  const catalog = lookup(catalogPath(p.catalogId));
  const product = lookup(productPath(p.catalogId,p.catalogProductId));
  if (catalog?.error === 'denied' || product?.error === 'denied' || catalog?.value?.archived || product?.value?.archived) return 'unavailable';
  if (!online || catalog?.error || product?.error) return 'connection';
  if (!catalog?.verified || !product?.verified) return 'checking';
  return isCurrentCatalogSelection(p,catalog.value,product.value) ? 'available' : 'unavailable';
}

/** A projection for the cashier. The sale itself must verify the event row and both master versions atomically. */
export function useSaleAvailability(list: ListState<Product>, enabled: boolean) {
  const local = useDemo().on;
  const version = useDemoVersion();
  const simulatedOffline = useDemoStates().offline;
  const online = useOnline() && !(local && simulatedOffline);
  const watchers = useRef(new Map<string,Watch>());
  const [masters, setMasters] = useState<ReadonlyMap<string,Master>>(() => new Map());
  const pathKey = JSON.stringify([...new Set(list.items.flatMap(p =>
    enabled && online && !local && p.active !== false && validId(p.catalogId) && validId(p.catalogProductId)
      ? [catalogPath(p.catalogId),productPath(p.catalogId,p.catalogProductId)] : []))].sort());

  useEffect(() => {
    const active = watchers.current;
    const paths = new Set<string>(JSON.parse(pathKey));
    const removed: string[] = [];
    for (const [path,watch] of active) {
      if (paths.has(path)) continue;
      watch.stop();
      active.delete(path);
      removed.push(path);
    }
    if (removed.length) setMasters(previous => {
      const next = new Map(previous);
      removed.forEach(path => next.delete(path));
      return next;
    });
    for (const path of paths) {
      if (active.has(path)) continue;
      const watch: Watch = { stop() {} };
      active.set(path,watch);
      const publish = (entry: Master) => {
        if (active.get(path) === watch) setMasters(previous => new Map(previous).set(path,entry));
      };
      watch.stop = onSnapshot(doc(db,path), {includeMetadataChanges:true}, snap => {
        publish({value: snap.exists() ? snap.data() : null, verified: !snap.metadata.fromCache && !snap.metadata.hasPendingWrites});
      }, error => publish({
        value: null,
        verified: false,
        error: error.code === 'permission-denied' || error.code === 'unauthenticated' ? 'denied' : 'connection',
      }));
    }
  }, [pathKey]);
  useEffect(() => {
    const active = watchers.current;
    return () => { for (const item of active.values()) item.stop(); active.clear(); };
  }, []);

  return useMemo(() => {
    const lookup = local
      ? (path: string): Master => ({value:demoDoc(path) as Source | null,verified:true})
      : (path: string) => masters.get(path);
    const status = new Map(list.items.map(p => [p.id,assess(p,online,lookup)]));
    return { ...list, items:list.items.filter(p => status.get(p.id) === 'available'), status, online };
  }, [list,masters,local,version,online]);
}
