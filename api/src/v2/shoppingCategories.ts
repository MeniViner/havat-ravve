import { customCategoryName, standardShoppingCategories } from '../../../shared/shopping-categories';
import type { Firestore } from '../firestore';
import { invalid } from '../http';

export async function readShoppingCategory(fs: Firestore, raw: unknown, tx?: string): Promise<string> {
  const id = String(raw ?? 'super');
  if (Object.hasOwn(standardShoppingCategories, id)) return id;
  const label = customCategoryName(id);
  if (label && (await fs.get('shopping_categories', id, tx))?.data.name === label) return id;
  throw invalid('category', 'unknown shopping category');
}
export function urgentDueAt(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  ) {
    const iso = new Date(value).toISOString();
    if (iso.replace('.000Z', 'Z') === value.replace('.000Z', 'Z')) return iso;
  }
  throw invalid('urgentDueAt', 'expected a UTC ISO date and time');
}
