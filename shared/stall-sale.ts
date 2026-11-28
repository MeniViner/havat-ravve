import { catalogGeneration, hasCatalogReference, hasCatalogPair, isCurrentCatalogSelection } from './farm-catalogs';

export type SaleLine = {
  productId: string;
  qty: number;
  price: number;
  catalogId?: string;
  catalogProductId?: string;
  catalogGeneration?: number;
  catalogProductGeneration?: number;
};
export type SaleBuyer = { uid: string; name: string; phone: string; ticketId: string };
export type SaleReceipt = { tabId: string; total: number; replayed: boolean };
export type SaleCart = { eventId: string; items: SaleLine[]; tabId?: string; guest?: SaleBuyer };
type Snapshot = {
  name?: unknown;
  price?: unknown;
  active?: unknown;
  catalogId?: unknown;
  catalogProductId?: unknown;
  catalogGeneration?: unknown;
  catalogProductGeneration?: unknown;
};
type Source = { archived?: unknown; generation?: unknown };
export const stallOfflineMessage = 'בדוכן עם קטלוג החווה צריך חיבור כדי לוודא שהמוצרים עדיין זמינים. הסל נשאר פתוח.';
export const standaloneOfflineMessage =
  'בסל יש כמה מוצרים חד־פעמיים. אפשר לרשום מוצר אחד עכשיו, או לשמור את הסל עד שיחזור החיבור.';
export const stallChangedMessage = 'מוצר בסל הוסר מהמכירה או שמחירו השתנה. עדכנו את הסל ונסו שוב.';
export const saleRound = (n: number) => Math.round(n * 100) / 100;

/** Prices and names come from the event's selection. The master controls availability even for a cart opened earlier. */
export function availableStallSnapshot(snapshot?: Snapshot | null, catalog?: Source | null, product?: Source | null) {
  if (
    !snapshot ||
    snapshot.active === false ||
    typeof snapshot.name !== 'string' ||
    !snapshot.name.trim() ||
    typeof snapshot.price !== 'number' ||
    !Number.isFinite(snapshot.price) ||
    snapshot.price < 0
  )
    return false;
  if (!hasCatalogReference(snapshot)) return true;
  return hasCatalogPair(snapshot) && isCurrentCatalogSelection(snapshot, catalog, product);
}
export function sameSaleSnapshot(line: SaleLine, snapshot: Snapshot) {
  return (
    snapshot.price === line.price &&
    (snapshot.catalogId || '') === (line.catalogId || '') &&
    (snapshot.catalogProductId || '') === (line.catalogProductId || '') &&
    catalogGeneration(snapshot.catalogGeneration) === catalogGeneration(line.catalogGeneration) &&
    catalogGeneration(snapshot.catalogProductGeneration) === catalogGeneration(line.catalogProductGeneration)
  );
}
export function saleSnapshotMatches(
  line: SaleLine,
  snapshot?: Snapshot | null,
  catalog?: Source | null,
  product?: Source | null,
) {
  return !!snapshot && availableStallSnapshot(snapshot, catalog, product) && sameSaleSnapshot(line, snapshot);
}

export const phoneDigits = (value: string) => value.replace(/\D/g, '');
const normalName = (value: string) => value.trim().toLowerCase();
export const saleBuyerKey = (buyer: SaleBuyer) =>
  buyer.uid
    ? ['uid', buyer.uid, normalName(buyer.name)]
    : buyer.ticketId
      ? ['ticket', buyer.ticketId]
      : ['phone', phoneDigits(buyer.phone)];
export function matchingSaleBuyer(tab: Record<string, unknown>, buyer: SaleBuyer) {
  if (tab.status !== 'open') return false;
  const sameName = normalName(String(tab.guestName || '')) === normalName(buyer.name);
  const samePhone = !!phoneDigits(buyer.phone) && phoneDigits(String(tab.guestPhone || '')) === phoneDigits(buyer.phone);
  if (buyer.uid) return tab.guestUid === buyer.uid && sameName;
  if (buyer.ticketId) return tab.ticketId === buyer.ticketId || (samePhone && sameName);
  return !tab.guestUid && samePhone;
}
