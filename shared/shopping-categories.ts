export const standardShoppingCategories = { super: 'סופר', building: 'בניין', online: 'אינטרנט', giveaway: 'מחפשים' } as const;
export type CustomShoppingCategory = `custom_${string}`;
export const categoryName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
export function customCategoryId(value: string): CustomShoppingCategory {
  const name = categoryName(value);
  if (!name || [...name].length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('שם קטגוריה חייב להכיל 1–60 תווים');
  return `custom_${btoa(String.fromCharCode(...new TextEncoder().encode(name))).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}
export function customCategoryName(id: string): string {
  if (!/^custom_[\w-]{2,320}$/.test(id)) return '';
  try {
    const raw = atob(id.slice(7).replace(/-/g, '+').replace(/_/g, '/'));
    const name = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
    return customCategoryId(name) === id ? name : '';
  } catch { return ''; }
}
