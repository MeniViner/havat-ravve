import { activity, TEAM_ROLES } from './core';
import { Firestore, backoff, decFields, isContention, isUncertain, type Doc, type Env, type Write } from './firestore';
import { ApiError, invalid } from './http';
import { verifyIdToken } from './idtoken';
import { autoId, canonical, sha256hex, UUID_RE } from './util';
import {
  matchingSaleBuyer,
  phoneDigits,
  saleBuyerKey,
  saleRound,
  availableStallSnapshot,
  sameSaleSnapshot,
  stallChangedMessage,
  type SaleBuyer,
  type SaleCart,
  type SaleLine,
  type SaleReceipt,
} from '../../shared/stall-sale';

const receipts = 'stall_sale_receipts';
const pointers = 'stall_buyer_tabs';
const isId = (id: unknown): id is string =>
  typeof id === 'string' && id.length > 0 && id.length <= 1500 && new TextEncoder().encode(id).length <= 1500 &&
  id !== '.' && id !== '..' && !/^__.*__$/.test(id) && !/[\x00-\x1f\x7f/]/.test(id);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasOnly = (obj: Record<string, unknown>, keys: string[]) => Object.keys(obj).every((k) => keys.includes(k));
const changed = () => {
  const e = new ApiError('STALE_WRITE', 'the cart contains a stale or unavailable product');
  e.he = stallChangedMessage;
  return e;
};

function command(body: Record<string, unknown>) {
  if (
    !hasOnly(body, ['eventId', 'tabId', 'guest', 'items', 'operationId']) ||
    !isId(body.eventId) ||
    typeof body.operationId !== 'string' ||
    !UUID_RE.test(body.operationId) ||
    !!body.tabId === !!body.guest ||
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 500
  )
    throw invalid('sale', 'invalid sale or cart');
  const items: SaleLine[] = body.items.map((row) => {
    if (
      !object(row) ||
      !hasOnly(row, [
        'productId',
        'price',
        'qty',
        'catalogId',
        'catalogProductId',
        'catalogGeneration',
        'catalogProductGeneration',
      ]) ||
      !isId(row.productId) ||
      typeof row.price !== 'number' ||
      !Number.isFinite(row.price) ||
      row.price < 0 ||
      typeof row.qty !== 'number' ||
      !Number.isSafeInteger(row.qty) ||
      row.qty < 1
    )
      throw invalid('items', 'invalid product or quantity');
    if (
      row.catalogId !== undefined ||
      row.catalogProductId !== undefined ||
      row.catalogGeneration !== undefined ||
      row.catalogProductGeneration !== undefined
    ) {
      if (
        !isId(row.catalogId) ||
        !isId(row.catalogProductId) ||
        [row.catalogGeneration, row.catalogProductGeneration].some(
          (g) => g !== undefined && (typeof g !== 'number' || !Number.isSafeInteger(g) || g < 0),
        )
      )
        throw invalid('items', 'invalid catalog snapshot');
      return {
        productId: row.productId,
        price: row.price,
        qty: row.qty,
        catalogId: row.catalogId,
        catalogProductId: row.catalogProductId,
        catalogGeneration: Number(row.catalogGeneration || 0),
        catalogProductGeneration: Number(row.catalogProductGeneration || 0),
      };
    }
    return { productId: row.productId, qty: row.qty, price: row.price };
  });
  if (new Set(items.map((i) => i.productId)).size !== items.length) throw invalid('items', 'duplicate event product');
  const cart: SaleCart = { eventId: body.eventId, items };
  if (body.tabId) {
    if (!isId(body.tabId)) throw invalid('tabId', 'invalid tab');
    cart.tabId = body.tabId;
  } else {
    const g = body.guest;
    if (
      !object(g) ||
      !hasOnly(g, ['uid', 'name', 'phone', 'ticketId']) ||
      typeof g.name !== 'string' ||
      !g.name.trim() ||
      g.name.length > 80 ||
      typeof g.phone !== 'string' ||
      g.phone.length > 25 ||
      typeof g.uid !== 'string' ||
      typeof g.ticketId !== 'string' ||
      (g.uid && !isId(g.uid)) ||
      (g.ticketId && !isId(g.ticketId)) ||
      (!g.ticketId && (g.uid || !/^\+?[\d(). -]+$/.test(g.phone) || !/^\d{9,15}$/.test(phoneDigits(g.phone))))
    )
      throw invalid('guest', 'invalid buyer or ticket');
    cart.guest = { uid: g.uid, name: g.name.trim(), phone: g.phone.trim(), ticketId: g.ticketId };
  }
  return { cart, key: body.operationId.toLowerCase() };
}

async function loadDocs(fs: Firestore, paths: string[], tx: string, fields: string[]) {
  const names = [...new Set(paths)];
  const docs = await fs.rawGet(names, fields, true, tx);
  return new Map(docs.map((d) => [d.name, decFields(d.fields || {})]));
}

/** The two sets of documents share a transaction snapshot and scale independently of the number of catalog parents. */
export async function readStallProducts(fs: Firestore, eventId: string, ids: string[], tx: string) {
  const collection = 'events/' + eventId + '/products';
  const data = await loadDocs(
    fs,
    ids.map((id) => fs.name(collection, id)),
    tx,
    ['catalogId', 'catalogProductId', 'catalogGeneration', 'catalogProductGeneration', 'active', 'name', 'price'],
  );
  const products = new Map<string, Record<string, unknown>>();
  const paths: string[] = [];
  for (const id of ids) {
    const p = data.get(fs.name(collection, id));
    if (!p) continue;
    products.set(id, p);
    if (isId(p.catalogId) && isId(p.catalogProductId))
      paths.push(
        fs.name('farm_catalogs', p.catalogId),
        fs.name('farm_catalogs/' + p.catalogId + '/products', p.catalogProductId),
      );
  }
  const masters = await loadDocs(fs, paths, tx, ['archived', 'generation']);
  const available = new Set<string>();
  for (const [id, p] of products) {
    const catalog = masters.get(fs.name('farm_catalogs', String(p.catalogId)));
    const product = masters.get(fs.name('farm_catalogs/' + p.catalogId + '/products', String(p.catalogProductId)));
    if (availableStallSnapshot(p, catalog, product)) available.add(id);
  }
  return { products, available };
}

async function resolveGuest(fs: Firestore, eventId: string, supplied: SaleBuyer, tx: string): Promise<SaleBuyer> {
  if (!supplied.ticketId) return supplied;
  const ticket = await fs.get('tickets', supplied.ticketId, tx);
  if (!ticket || ticket.data.eventId !== eventId || ticket.data.status !== 'valid')
    throw invalid('guest', 'the ticket is not valid for this event');
  const g = ticket.data;
  if (String(g.ownerUid || '') !== supplied.uid || String(g.holderName || g.ownerName || '') !== supplied.name)
    throw invalid('guest', 'the selected ticket holder changed');
  return {
    uid: String(g.ownerUid || ''),
    name: String(g.holderName || g.ownerName),
    phone: String(g.ownerPhone || ''),
    ticketId: ticket.id,
  };
}

async function account(fs: Firestore, cart: SaleCart, tx: string) {
  if (cart.tabId) {
    const tab = await fs.get('tabs', cart.tabId, tx);
    if (!tab || tab.data.eventId !== cart.eventId || tab.data.status !== 'open')
      throw invalid('tabId', 'this account is not open for the event', 'החשבון כבר נסגר או שייך לאירוע אחר.');
    return { tab, tabId: tab.id, buyer: null, pointer: null };
  }
  const buyer = await resolveGuest(fs, cart.eventId, cart.guest!, tx);
  const id = await sha256hex(JSON.stringify([cart.eventId, ...saleBuyerKey(buyer)]));
  const pointer = await fs.get(pointers, id, tx);
  let tab = pointer ? await fs.get('tabs', String(pointer.data.tabId), tx) : null;
  if (!tab || tab.data.eventId !== cart.eventId || !matchingSaleBuyer(tab.data, buyer)) {
    // Existing accounts, including walk-ins who entered formatted phone numbers, predate the pointer.
    const old = await fs.query(
      {
        from: [{ collectionId: 'tabs' }],
        where: { fieldFilter: { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: cart.eventId } } },
        select: {
          fields: ['status', 'guestUid', 'guestName', 'guestPhone', 'ticketId', 'total', 'createdAt'].map((fieldPath) => ({
            fieldPath,
          })),
        },
      },
      '',
      tx,
    );
    const matches = old
      .filter((t) => matchingSaleBuyer(t.data, buyer))
      .sort((a, b) => Number(b.data.total || 0) - Number(a.data.total || 0) || a.id.localeCompare(b.id));
    tab = matches[0] ? await fs.get('tabs', matches[0].id, tx) : null;
  }
  const tabId = tab?.id || autoId();
  const write =
    pointer?.data.tabId === tabId
      ? null
      : pointer
        ? fs.patch(pointers, id, { tabId }, pointer.updateTime)
        : fs.create(pointers, id, { tabId });
  return { tab, tabId, buyer, pointer: write };
}

function replay(receipt: Doc, fingerprint: string): SaleReceipt {
  if (receipt.data.fingerprint !== fingerprint)
    throw new ApiError('IDEMPOTENCY_CONFLICT', 'this operation id belongs to a different cart');
  return { tabId: String(receipt.data.tabId), total: Number(receipt.data.total), replayed: true };
}

export async function stallSaleRoute(req: Request, env: Env, body: Record<string, unknown>, fs: Firestore) {
  const token = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || '')?.[1];
  if (!token) throw new ApiError('UNAUTHENTICATED', 'a Firebase ID token is required');
  const { uid } = await verifyIdToken(token, env);
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key:'pos:' + uid })).success)
    throw new ApiError('RATE_LIMITED', 'too many requests from this cashier', {}, { 'retry-after':'60' });
  const { cart, key } = command(body);
  const fingerprint = await sha256hex(canonical(cart));
  const receiptId = await sha256hex(JSON.stringify([uid, key]));
  for (let attempt = 0; ; attempt++) {
    const tx = await fs.begin();
    let committing = false, checkedPriorSale = false;
    try {
      const profile = await fs.get('users', uid, tx);
      if (!profile || profile.data.status !== 'active' || !TEAM_ROLES.has(String(profile.data.role)))
        throw new ApiError('FORBIDDEN', 'an active team member is required');
      const existing = await fs.get(receipts, receiptId, tx);
      if (existing) {
        await fs.rollback(tx);
        return replay(existing, fingerprint);
      }
      // A standalone checkout queued on this device may already have synchronized before a signed retry.
      const activityId = 'pos_' + receiptId,
        direct = await fs.get('activity', activityId, tx);
      if (direct) {
        const tab = await fs.get('tabs', String(direct.data.refId), tx);
        const recorded = Array.isArray(tab?.data.items)
          ? (tab.data.items as Record<string, unknown>[]).filter((i) => i.saleOperation === key)
          : [];
        const buyer = cart.guest;
        const sameTarget =
          tab &&
          tab.data.eventId === cart.eventId &&
          (cart.tabId ? tab.id === cart.tabId : buyer && matchingSaleBuyer({ ...tab.data, status: 'open' }, buyer));
        const sameLines =
          recorded.length === cart.items.length &&
          cart.items.every(
            (i) =>
              !i.catalogId &&
              !i.catalogProductId &&
              recorded.some((r) => r.productId === i.productId && r.qty === i.qty && r.price === i.price),
          );
        if (
          !sameTarget ||
          !sameLines ||
          (direct.data.by as { uid?: string })?.uid !== uid ||
          direct.data.kind !== 'tab' ||
          direct.data.action !== 'item'
        )
          throw new ApiError('IDEMPOTENCY_CONFLICT', 'the operation was previously recorded on this device');
        await fs.rollback(tx);
        return { tabId: tab!.id, total: saleRound(cart.items.reduce((s, i) => s + i.qty * i.price, 0)), replayed: true };
      }
      checkedPriorSale = true;
      const event = await fs.get('events', cart.eventId, tx);
      if (!event || event.data.closed || event.data.stall === false)
        throw invalid('eventId', 'the stall is closed', 'הדוכן באירוע הזה סגור.');
      const switches = await fs.get('settings', 'switches', tx);
      if (switches?.data.readOnly && profile.data.role !== 'owner') throw new ApiError('FORBIDDEN', 'the farm is read-only');
      const config = 'events/' + cart.eventId + '/stall_config',
        marker = await fs.get(config, 'catalog', tx);
      const { products, available } = await readStallProducts(
        fs,
        cart.eventId,
        cart.items.map((i) => i.productId),
        tx,
      );
      const by = { uid, name: String(profile.data.displayName || '').slice(0, 80) };
      const base = Date.now(),
        at = new Date(base).toISOString();
      const added = cart.items.map((line, index) => {
        const p = products.get(line.productId);
        if (!p || !available.has(line.productId) || !sameSaleSnapshot(line, p)) throw changed();
        return {
          productId: line.productId,
          name: String(p!.name),
          price: Number(p!.price),
          qty: line.qty,
          at: new Date(base + index).toISOString(),
          by,
          saleOperation: key,
        };
      });
      const { tab, tabId, buyer, pointer } = await account(fs, cart, tx);
      const previous = tab?.data.items || [];
      if (!Array.isArray(previous) || previous.length + added.length > 500)
        throw invalid('items', 'the account exceeds 500 lines');
      const total = saleRound(added.reduce((s, i) => s + i.price * i.qty, 0)),
        newTotal = saleRound(Number(tab?.data.total || 0) + total);
      if (!Number.isSafeInteger(Math.round(newTotal * 100)) || newTotal < 0) throw invalid('items', 'invalid account total');
      const update = { items: [...previous, ...added], total: newTotal, updatedAt: at };
      const writes: Write[] = [];
      if (tab) writes.push(fs.patch('tabs', tabId, update, tab.updateTime));
      else {
        writes.push(
          fs.create('tabs', tabId, {
            ...update,
            eventId: event.id,
            eventTitle: String(event.data.title || ''),
            guestUid: buyer!.uid,
            guestName: buyer!.name,
            guestPhone: buyer!.phone,
            ticketId: buyer!.ticketId,
            status: 'open',
            createdAt: at,
            createdBy: by,
          }),
        );
        writes.push(
          activity(fs, by, 'tab', tabId, 'opened', buyer!.name + ' · ' + event.data.title, {
            eventId: event.id,
            subjectUid: buyer!.uid,
          }),
        );
      }
      if (pointer) writes.push(pointer);
      if (cart.items.some((i) => i.catalogId) && marker?.data.enabled !== true)
        writes.push(fs.set(config, 'catalog', { enabled: true }));
      const name = String(tab?.data.guestName || buyer?.name || '');
      const label =
        name + ': ' + added.map((i) => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ') + ' · ' + total + ' ₪';
      writes.push(
        fs.create('activity', activityId, {
          kind: 'tab',
          refId: tabId,
          action: 'item',
          text: label.slice(0, 500),
          by,
          at,
          subjectUid: String(tab?.data.guestUid || buyer?.uid || ''),
          eventId: event.id,
        }),
      );
      writes.push(fs.create(receipts, receiptId, { fingerprint, uid, tabId, total, eventId: event.id, createdAt: at }));
      committing = true;
      await fs.commit(writes, tx);
      return { tabId, total, replayed: false };
    } catch (e) {
      await fs.rollback(tx);
      if (isContention(e) && attempt < 6) {
        await backoff(attempt);
        continue;
      }
      if (committing && isUncertain(e)) {
        const saved = await fs.get(receipts, receiptId).catch(() => null);
        if (saved) return replay(saved, fingerprint);
        throw new ApiError('OUTCOME_UNKNOWN', 'resend exactly this cart with its original operation id');
      }
      if (e instanceof ApiError && e.status<500 && checkedPriorSale && !committing) e.details.saleChecked = true;
      throw e;
    }
  }
}
