import { catalogGeneration } from '../../shared/farm-catalogs';
import type { Firestore } from './firestore';

export async function activeCatalogProduct(fs: Firestore, catalogId: string, productId: string, tx: string) {
  const parent = await fs.get('farm_catalogs', catalogId, tx);
  if (!parent || parent.data.archived === true) return null;
  const product = await fs.get('farm_catalogs/' + catalogId + '/products', productId, tx);
  if (!product || product.data.archived === true) return null;
  return {data: product.data, parent: parent.data, generations: {
    catalogGeneration: catalogGeneration(parent.data.generation),
    catalogProductGeneration: catalogGeneration(product.data.generation),
  }};
}

export async function stallMarkerWrites(fs: Firestore, eventId: string, tx: string) {
  const col = 'events/' + eventId + '/stall_config';
  return (await fs.get(col, 'catalog', tx)) ? [] : [fs.create(col, 'catalog', {enabled: true})];
}
