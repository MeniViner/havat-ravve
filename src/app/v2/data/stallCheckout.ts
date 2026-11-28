import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db, emulatorMode, readyAuth } from '../../firebase';
import { demoDoc, demoItems, demoOnly, getDemo, getDemoStates, isDemoId, PERSONA_UID } from '../../demo/store';
import { newId, transact } from '../../db';
import { nowIso } from '../../clock';
import { activityOp } from '../../activity';
import { readOnlyLock } from '../../switches';
import { FILES_API } from '../../upload';
import type { Actor, Product, Tab } from '../../types';
import { hasCatalogReference } from '../../../../shared/farm-catalogs';
import {
  matchingSaleBuyer,
  saleRound,
  saleSnapshotMatches,
  stallChangedMessage,
  stallOfflineMessage,
  standaloneOfflineMessage,
  type SaleCart,
  type SaleLine,
  type SaleReceipt,
} from '../../../../shared/stall-sale';

export type CheckoutOptions = { operationId?: string; catalogEnabled?: boolean };
const offline = () =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || (demoOnly() && getDemoStates().offline);
export function cartSnapshot(product: Product, qty: number): SaleLine {
  const base = { productId: product.id, qty, price: product.price };
  return hasCatalogReference(product)
    ? {
        ...base,
        catalogId: product.catalogId,
        catalogProductId: product.catalogProductId,
        catalogGeneration: product.catalogGeneration ?? 0,
        catalogProductGeneration: product.catalogProductGeneration ?? 0,
      }
    : base;
}
export async function catalogCheckoutRequired(eventId: string, lines: SaleLine[], known?: boolean) {
  if (known || lines.some(hasCatalogReference)) return true;
  const col = 'events/' + eventId + '/stall_config';
  if (demoOnly()) return demoDoc(col + '/catalog')?.enabled === true;
  if (isDemoId(eventId)) throw new Error('זה אירוע הדגמה.');
  const marker = doc(db, col, 'catalog');
  if (!offline()) {
    try {
      return (await getDocFromServer(marker)).data()?.enabled === true;
    } catch (error) {
      if (!['unavailable', 'deadline-exceeded'].includes((error as { code?: string }).code || '')) throw error;
    }
  }
  try {
    return (await getDocFromCache(marker)).data()?.enabled === true;
  } catch {
    if (known === false) return false;
    throw new Error(stallOfflineMessage);
  }
}

const attemptedOnline = new Set<string>();
export function hasUnresolvedStallSale(operationId: string) {
  if (!operationId) return false;
  try {
    if (sessionStorage.getItem('farm-pos-sent/' + operationId)) return true;
  } catch {
    /* in-memory fallback */
  }
  return attemptedOnline.has(operationId);
}
function clearOnlineAttempt(operationId: string) {
  attemptedOnline.delete(operationId);
  try {
    sessionStorage.removeItem('farm-pos-sent/' + operationId);
  } catch {
    /* in-memory state already cleared */
  }
}
export async function needsSignedStallSale(actor: Actor, cart: SaleCart, options: CheckoutOptions) {
  const { eventId, items: lines } = cart;
  const operationId = options.operationId || previousOperation(await fallbackSlot(actor, cart));
  if (operationId && hasUnresolvedStallSale(operationId)) {
    if (offline()) throw new Error('לקנייה הזו כבר נשלחה בקשה. חזרו לחיבור ונסו שוב עם אותו סל לקבלת האישור.');
    return true;
  }
  if (!(await catalogCheckoutRequired(eventId, lines, options.catalogEnabled))) return false;
  if (!offline()) return true;
  if (lines.some(hasCatalogReference)) throw new Error(stallOfflineMessage);
  if (lines.length !== 1) throw new Error(standaloneOfflineMessage);
  if (demoOnly() && !saleSnapshotMatches(lines[0], demoDoc('events/' + eventId + '/products/' + lines[0].productId)))
    throw new Error(stallChangedMessage);
  return false;
}

async function hashSlot(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
const saleLogId = async (uid: string, operationId: string) =>
  'pos_' + (await hashSlot(JSON.stringify([uid, operationId.toLowerCase()])));
const fallbackSlot = async (actor: Actor, cart: SaleCart) =>
  'farm-pos-pending/' + (await hashSlot(JSON.stringify([actor.uid, cart])));
export async function localStallLog(actor: Actor, operationId: string, cart: SaleCart) {
  const id = await saleLogId(actor.uid, operationId);
  const cached = async (col: string, key: string) =>
    demoOnly()
      ? demoDoc(col + '/' + key)
      : getDocFromCache(doc(db, col, key)).then(
          (s) => s.data() || null,
          () => null,
        );
  const receipt = await cached('activity', id);
  if (!receipt) return { id, result: null };
  const tabId = String(receipt.refId),
    tab = await cached('tabs', tabId);
  const lines = Array.isArray(tab?.items)
    ? tab.items.filter((i: { saleOperation?: string }) => i.saleOperation === operationId.toLowerCase())
    : [];
  const target =
    tab &&
    tab.eventId === cart.eventId &&
    (cart.tabId ? cart.tabId === tabId : cart.guest && matchingSaleBuyer({ ...tab, status: 'open' }, cart.guest));
  if (
    !target ||
    receipt.by?.uid !== actor.uid ||
    lines.length !== cart.items.length ||
    !cart.items.every((i) =>
      lines.some(
        (r: { productId: string; qty: number; price: number }) =>
          r.productId === i.productId && r.qty === i.qty && r.price === i.price,
      ),
    )
  )
    throw new Error('מזהה הקנייה כבר נרשם. יש לבדוק את תנועות החשבון לפני ניסיון נוסף.');
  return { id, result: { tabId, total: saleRound(cart.items.reduce((s, i) => s + i.price * i.qty, 0)), replayed: true } };
}
let demoQueue = Promise.resolve();
function demoCheckout(actor: Actor, cart: SaleCart, operationId: string) {
  const work = demoQueue.then(() =>
    transact(
      async (tx) => {
        const profile = demoDoc('users/' + actor.uid);
        if (
          PERSONA_UID[getDemo().persona] !== actor.uid ||
          profile?.status !== 'active' ||
          !['owner', 'manager', 'staff'].includes(String(profile.role))
        )
          throw new Error('נדרשת כניסה של חבר צוות פעיל.');
        const key = actor.uid + '_' + operationId,
          fingerprint = JSON.stringify(cart),
          old = demoDoc('stall_sale_receipts/' + key);
        if (old) {
          if (old.fingerprint !== fingerprint) throw new Error('מזהה הפעולה כבר שימש לסל אחר.');
          return { tabId: String(old.tabId), total: Number(old.total), replayed: true };
        }
        const event = demoDoc('events/' + cart.eventId);
        if (!event || event.closed || event.stall === false) throw new Error('הדוכן באירוע הזה סגור.');
        if (demoDoc('settings/switches')?.readOnly && profile.role !== 'owner') throw new Error('המערכת במצב קריאה בלבד.');
        let buyer = cart.guest;
        if (buyer?.ticketId) {
          const t = demoDoc('tickets/' + buyer.ticketId);
          if (
            !t ||
            t.status !== 'valid' ||
            t.eventId !== cart.eventId ||
            t.ownerUid !== buyer.uid ||
            (t.holderName || t.ownerName) !== buyer.name
          )
            throw new Error('הכרטיס אינו תקף לקונה באירוע הזה.');
          buyer = { ...buyer, phone: String(t.ownerPhone || '') };
        }
        const tab = (
          cart.tabId
            ? demoDoc('tabs/' + cart.tabId)
            : demoItems('tabs')
                .filter((t) => t.eventId === cart.eventId && matchingSaleBuyer(t, buyer!))
                .sort((a, b) => Number(b.total) - Number(a.total))[0]
        ) as Tab | undefined;
        if (cart.tabId && (!tab || tab.eventId !== cart.eventId || tab.status !== 'open'))
          throw new Error('החשבון כבר נסגר או שייך לאירוע אחר.');
        if ((tab?.items.length || 0) + cart.items.length > 500) throw new Error('חשבון אחד יכול להכיל עד 500 שורות.');
        const at = nowIso(),
          base = Date.parse(at);
        const added = cart.items.map((line, index) => {
          const p = demoDoc('events/' + cart.eventId + '/products/' + line.productId);
          const parent = 'farm_catalogs/' + p?.catalogId;
          if (
            !Number.isSafeInteger(line.qty) ||
            line.qty <= 0 ||
            !saleSnapshotMatches(
              line,
              p,
              p?.catalogId ? demoDoc(parent) : null,
              p?.catalogProductId ? demoDoc(parent + '/products/' + p.catalogProductId) : null,
            )
          )
            throw new Error(stallChangedMessage);
          return {
            productId: line.productId,
            qty: line.qty,
            price: Number(p!.price),
            name: String(p!.name),
            at: new Date(base + index).toISOString(),
            by: actor,
          };
        });
        const total = saleRound(added.reduce((s, i) => s + i.price * i.qty, 0)),
          tabId = tab?.id || newId('tabs');
        const result = { tabId, total, replayed: false };
        const update = {
          items: [...(tab?.items || []), ...added],
          total: saleRound((tab?.total || 0) + total),
          updatedAt: at,
        };
        if (!Number.isSafeInteger(Math.round(update.total * 100))) throw new Error('סכום הקנייה אינו תקין.');
        const guestName = tab?.guestName ?? buyer!.name,
          history = { eventId: cart.eventId, subjectUid: tab?.guestUid ?? buyer!.uid };
        if (tab) tx.update('tabs', tabId, update);
        else {
          tx.set('tabs', tabId, {
            ...update,
            eventId: cart.eventId,
            eventTitle: event.title,
            guestUid: buyer!.uid,
            guestName,
            guestPhone: buyer!.phone,
            ticketId: buyer!.ticketId,
            status: 'open',
            createdBy: actor,
            createdAt: at,
          });
          const a = activityOp(actor, 'tab', tabId, 'opened', guestName + ' · ' + event.title, history);
          tx.set(a.col, a.id, a.data);
        }
        const a = activityOp(
          actor,
          'tab',
          tabId,
          'item',
          guestName + ': ' + added.map((i) => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ') + ' · ' + total + ' ₪',
          history,
        );
        tx.set(a.col, a.id, a.data);
        if (cart.items.some((i) => i.catalogId))
          tx.set('events/' + cart.eventId + '/stall_config', 'catalog', { enabled: true });
        tx.set('stall_sale_receipts', key, { ...result, fingerprint });
        return result;
      },
      { serverOnly: true },
    ),
  );
  demoQueue = work.then(
    () => undefined,
    () => undefined,
  );
  return work;
}

// A direct caller without an explicit key keeps the pending checkout through a timeout or reload.
const pending = new Map<string, string>();
function previousOperation(slot: string) {
  let previous = pending.get(slot);
  try {
    previous ||= sessionStorage.getItem(slot) || undefined;
  } catch {
    /* tab storage unavailable */
  }
  return previous;
}
function pendingOperation(slot: string) {
  const previous = previousOperation(slot);
  if (previous) return previous;
  const id = crypto.randomUUID();
  pending.set(slot, id);
  try {
    sessionStorage.setItem(slot, id);
  } catch {
    /* in-memory key remains */
  }
  return id;
}
export async function submitStallCart(actor: Actor, cart: SaleCart, options: CheckoutOptions = {}): Promise<SaleReceipt> {
  if (offline()) throw new Error(stallOfflineMessage);
  const lock = readOnlyLock();
  if (lock && !demoOnly()) throw new Error(lock);
  const slot = options.operationId ? '' : await fallbackSlot(actor, cart);
  const operationId = options.operationId || pendingOperation(slot);
  let result: SaleReceipt;
  if (demoOnly()) result = await demoCheckout(actor, cart, operationId);
  else {
    if (isDemoId(cart.eventId) || (cart.tabId && isDemoId(cart.tabId)) || cart.items.some((i) => isDemoId(i.productId)))
      throw new Error('זה סל הדגמה.');
    const user = (await readyAuth()).currentUser;
    if (!user || user.uid !== actor.uid) throw new Error('נדרשת כניסה של חבר צוות.');
    const base = emulatorMode ? sessionStorage.getItem('farm-files-api') : FILES_API;
    if (!base || (emulatorMode && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)))
      throw new Error('שרת הדוכן המקומי אינו זמין.');
    const token = await user.getIdToken();
    const retryingUnknown = hasUnresolvedStallSale(operationId);
    attemptedOnline.add(operationId);
    try {
      sessionStorage.setItem('farm-pos-sent/' + operationId, '1');
    } catch {
      /* in-memory fallback */
    }
    let response: Response, payload;
    try {
      response = await fetch(base + '/v1/stall-sales', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ ...cart, operationId }),
        signal: AbortSignal.timeout(25000),
      });
      payload = await response.json();
    } catch {
      throw new Error('טרם התקבל אישור לקנייה. נסו שוב עם אותו סל לאחר חיבור.');
    }
    if (!response.ok || payload?.ok !== true) {
      const code = payload?.error?.code;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        typeof code === 'string' &&
        (!retryingUnknown ||
          code === 'STALE_WRITE' ||
          code === 'IDEMPOTENCY_CONFLICT' ||
          payload.error.details?.saleChecked === true)
      )
        clearOnlineAttempt(operationId);
      throw new Error(payload?.error?.he || 'לא התקבל אישור לקנייה. נסו שוב עם אותו סל.');
    }
    if (
      !payload.data ||
      typeof payload.data.tabId !== 'string' ||
      typeof payload.data.total !== 'number' ||
      !Number.isFinite(payload.data.total) ||
      typeof payload.data.replayed !== 'boolean'
    )
      throw new Error('טרם התקבל אישור לקנייה. נסו שוב עם אותו סל לאחר חיבור.');
    result = payload.data;
  }
  clearOnlineAttempt(operationId);
  if (slot) {
    pending.delete(slot);
    try {
      sessionStorage.removeItem(slot);
    } catch {
      /* already cleared in memory */
    }
  }
  return result;
}
