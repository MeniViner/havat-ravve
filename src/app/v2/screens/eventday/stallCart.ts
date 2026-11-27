import { useRef, useState } from 'react';
import type { Product } from '../../../types';
import { catalogGeneration } from '../../../../../shared/farm-catalogs';
import type { SaleBuyer } from '../../../../../shared/stall-sale';

export type CartLine = { product: Product; qty: number };
type Cart = { operationId: string; attempted: boolean; catalogEnabled?: boolean; buyer?: SaleBuyer; lines: CartLine[] };
const fresh = (lines: CartLine[] = []): Cart => ({ operationId: crypto.randomUUID(), attempted:false, lines });
const inMemory = new Map<string,Cart>();

export function readStallCart(scope: string): Cart | null {
  const existing = inMemory.get(scope);
  if (existing) return existing;
  try {
    const raw = sessionStorage.getItem(scope);
    if (raw) {
      const saved = JSON.parse(raw) as Cart;
      if (typeof saved.operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.operationId) && typeof saved.attempted === 'boolean'
        && (!saved.buyer || [saved.buyer.uid,saved.buyer.ticketId,saved.buyer.name,saved.buyer.phone].every(value => typeof value === 'string'))
        && Array.isArray(saved.lines) && saved.lines.length && saved.lines.every(l =>
          l?.product && typeof l.product.id === 'string' && typeof l.product.name === 'string' && Number.isFinite(l.product.price) && l.product.price >= 0
          && Number.isSafeInteger(l.qty) && l.qty > 0)) return saved;
    }
  } catch { /* A cashier can still sell when session storage is unavailable. */ }
  return null;
}

/** One buyer on one event, for this tab and cashier. A retry after a lost response keeps the complete original request. */
export function useStallCart(scope: string) {
  const [cart,setCart] = useState(() => readStallCart(scope) || fresh());
  const latest = useRef(cart);
  function persist(next: Cart) {
    latest.current = next;
    if (next.lines.length) inMemory.set(scope,next);
    else inMemory.delete(scope);
    try {
      if (next.lines.length) sessionStorage.setItem(scope,JSON.stringify(next));
      else sessionStorage.removeItem(scope);
    } catch { /* The mounted cart retains the retry key. */ }
    setCart(next);
  }
  const change = (update: (current: CartLine[]) => CartLine[]) => {
    if (!latest.current.attempted) persist(fresh(update(latest.current.lines)));
  };
  const begin = (catalogEnabled: boolean, buyer: SaleBuyer | null) => {
    const current = latest.current;
    const next = { ...current, attempted:true, catalogEnabled:current.catalogEnabled ?? catalogEnabled, buyer:current.buyer ?? buyer ?? undefined };
    persist(next);
    return next;
  };
  const settle = (operationId: string, accepted: boolean) => {
    const current = latest.current;
    if (current.operationId !== operationId) return;
    const stored = readStallCart(scope);
    if (stored?.operationId !== operationId) {
      // Another mounted visit to this buyer may have resolved the receipt and started a new cart.
      latest.current = stored || fresh();
      setCart(latest.current);
      return;
    }
    persist(accepted ? fresh() : { ...current, attempted:false });
  };
  return { cart, change, begin, settle };
}

export function sameOfferedLine(chosen: Product, current: Product) {
  return chosen.id === current.id && chosen.price === current.price && chosen.name === current.name
    && chosen.catalogId === current.catalogId && chosen.catalogProductId === current.catalogProductId
    && catalogGeneration(chosen.catalogGeneration) === catalogGeneration(current.catalogGeneration)
    && catalogGeneration(chosen.catalogProductGeneration) === catalogGeneration(current.catalogProductGeneration);
}
