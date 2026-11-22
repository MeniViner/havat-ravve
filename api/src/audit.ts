// The assistant log ("יומן אינסטינקט"): one document per authenticated API request in api_log/{requestId}, so the
// owners can see which key did what: "האינסטינקט של מני יצר משימה", "... מחק", "... נכשל". Only owners read it
// (firestore.rules); nobody writes it but this Worker. It is written after the response (best effort), so a slow
// log never slows or fails the action itself.
//
// A key's name comes from KEY_LABELS (wrangler.toml: {"<credential id>": "האינסטינקט של מני"}), else it is
// "אינסטינקט של <first name of the person the key acts as>".
import { ALL_OPERATIONS } from './catalog';
import { type Env, Firestore } from './firestore';
import { HE, type ApiError } from './http';
import { nowIso } from './core';

export const LOG = 'api_log';

/** What the request handler collects for the log. Bodies are kept here only, never in the console line. */
export type Audit = {
  credential?: string;
  actor?: { id: string; role: string; uid?: string; name?: string };
  op?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string | null;
  result?: unknown;
  replayed?: boolean;
};

const firstName = (s: string) => s.trim().split(/\s+/)[0] || s;

export function keyLabel(env: Env, credential: string, actorName?: string): string {
  try {
    const map = JSON.parse(env.KEY_LABELS || '{}') as Record<string, unknown>;
    if (typeof map[credential] === 'string' && map[credential]) return String(map[credential]).slice(0, 60);
  } catch { /* a broken KEY_LABELS falls back to the default name */ }
  return actorName ? `אינסטינקט של ${firstName(actorName)}` : `מפתח ${credential}`;
}

// ---------- which catalog operation a request was ----------
type OpRef = { name: string; he: string; kind: 'read' | 'write'; method: string; re: RegExp };
let table: OpRef[] | null = null;
function ops(): OpRef[] {
  if (table) return table;
  table = ALL_OPERATIONS.map((o) => ({
    name: o.name, he: o.he, kind: o.kind === 'read' ? 'read' : 'write', method: o.method,
    re: new RegExp('^' + o.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+') + '$'),
  }));
  return table;
}
export function opFor(method: string, path: string, name?: string) {
  const p = path.replace(/\/+$/, '') || '/';
  return ops().find((o) => (name ? o.name === name : o.method === method && o.re.test(p))) || null;
}

/** The verb the log shows after the key's name. */
export function verbOf(name: string, kind: 'read' | 'write'): string {
  if (kind === 'read') return 'קרא';
  const a = name.slice(name.lastIndexOf('.') + 1);
  if (/^(delete|remove)/.test(a)) return 'מחק';
  if (/^(cancel|undo)/.test(a)) return 'ביטל';
  if (/^(send|resend|invite|remind)/.test(a) || name === 'vendors.addPerson') return 'שלח';
  if (/^(create|add|open|copy|split|startTrip|postUpdate|saveQuestion)/.test(a) || name === 'presence.save') return 'יצר';
  if (/^(complete|close|admit|confirm|pay|markRead|markConfirmation|setHandled|stamp|setBought|take|keep|reject|reopen)/.test(a) || name.startsWith('gate.')) return 'ביצע';
  return 'ערך';
}

const cap = (v: unknown, n: number) => {
  if (v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/** The records an action touched: its refs, and the "<thing>Id" fields of its answer. */
function refsOf(result: unknown): { col: string; id: string }[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const out: { col: string; id: string }[] = [];
  if (Array.isArray(r.refs)) for (const x of r.refs) if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') out.push({ col: String((x as { col?: unknown }).col || ''), id: String((x as { id: string }).id) });
  for (const [k, v] of Object.entries(r)) if (/Id$/.test(k) && typeof v === 'string' && !out.some((o) => o.id === v)) out.push({ col: k.slice(0, -2), id: v });
  return out.slice(0, 20);
}

/** The log document for one request (null when no key was recognised: an unknown key is not anyone's action). */
export function auditDoc(env: Env, a: Audit, req: { requestId: string; method: string; path: string; query: string; status: number; ms: number; error?: ApiError }) {
  if (!a.credential || !a.actor) return null;
  const op = opFor(req.method, req.path, a.op);
  const kind: 'read' | 'write' = op?.kind || (req.method === 'GET' ? 'read' : 'write');
  const name = op?.name || a.op || `${req.method} ${req.path}`;
  const ok = req.status < 400;
  const items = a.result && typeof a.result === 'object' && Array.isArray((a.result as { items?: unknown }).items) ? (a.result as { items: unknown[] }).items.length : null;
  return {
    id: req.requestId, at: nowIso(),
    credential: a.credential, keyLabel: keyLabel(env, a.credential, a.actor.name),
    actor: { id: a.actor.id, role: a.actor.role, uid: a.actor.uid || '', name: a.actor.name || '' },
    kind, op: name, opHe: op?.he || '', verb: verbOf(name, kind),
    method: req.method, path: req.path, query: cap(req.query, 500),
    body: kind === 'write' ? cap(a.body || {}, 4000) : '',
    // a read keeps only how many records it returned; a write keeps its answer (a delete's answer is what was deleted)
    result: kind === 'write' && ok ? cap(a.result, 4000) : '', count: items,
    refs: kind === 'write' && ok ? refsOf(a.result) : [],
    status: req.status, ok, code: req.error?.code || '', message: req.error ? `${HE[req.error.code]}: ${req.error.message}`.slice(0, 300) : '',
    replayed: !!a.replayed, idempotencyKey: a.idempotencyKey || '', ms: req.ms,
  };
}

export async function writeAudit(env: Env, doc: Record<string, unknown> & { id: string }) {
  const fs = new Firestore(env, new Set());
  await fs.commit([fs.set(LOG, doc.id, doc)]);
}
