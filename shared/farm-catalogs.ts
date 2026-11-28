// Stable event document IDs keep repeated selections and copies on the same item.
export const catalogSelectionId = (catalogId: string, productId: string) =>
  'catalog_' + catalogId.length + '_' + catalogId + '_' + productId;
export const copiedEventItemId = (eventId: string, productId: string) =>
  'copy_' + eventId.length + '_' + eventId + '_' + productId;

type Source = { archived?: unknown; generation?: unknown };
type Selection = { active?: unknown; catalogId?: unknown; catalogProductId?: unknown; catalogGeneration?: unknown; catalogProductGeneration?: unknown };

/** The first generation predates this field. Restoring a catalog never makes an old selection valid again. */
export const catalogGeneration = (value: unknown): number => value === undefined ? 0 :
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : -1;
export const archivedGeneration = (entry: Source, archived: boolean) =>
  Math.max(0, catalogGeneration(entry.generation)) + (archived || entry.generation === undefined ? 1 : 0);

export const hasCatalogReference = (line: Selection) =>
  line.catalogId !== undefined || line.catalogProductId !== undefined;
const validId = (value: unknown) => typeof value === 'string' && value.length > 0 && !value.includes('/');
export const hasCatalogPair = (line: Selection) => validId(line.catalogId) && validId(line.catalogProductId);

export function isCurrentCatalogSelection(line: Selection, catalog?: Source | null, product?: Source | null) {
  if (!hasCatalogReference(line)) return line.active !== false;
  if (!hasCatalogPair(line) || line.active !== true) return false;
  if (!catalog || !product || catalog.archived || product.archived) return false;
  const cg = catalogGeneration(catalog.generation), pg = catalogGeneration(product.generation);
  return cg >= 0 && pg >= 0 && cg === catalogGeneration(line.catalogGeneration) && pg === catalogGeneration(line.catalogProductGeneration);
}
