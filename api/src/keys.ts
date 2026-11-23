// API keys the owners manage from the console (/admin): stored in TOKEN_KV under one record, as the SHA-256 of each key
// (the key itself is shown once, at creation or rotation, and never stored). A key here overrides a key of the same id in
// the API_CREDENTIALS secret, so a key that started in the secret can be renamed, revoked or rotated from the console too.
// KV is eventually consistent (up to about a minute between locations) and each isolate caches the record for 30
// seconds, so a revoke takes effect within about a minute and a half everywhere.
import { ApiError, invalid } from './http';
import type { Env } from './firestore';
import { ALL_SCOPES, type CredentialDef, credentials } from './auth';
import { sha256hex } from './util';

const KV_KEY = 'api-keys:v1';
const CACHE_MS = 30_000;
let cache: { at: number; keys: CredentialDef[] } | null = null;

export async function storedKeys(env: Env, fresh = false): Promise<CredentialDef[]> {
  if (!env.TOKEN_KV) return [];
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.keys;
  let keys: CredentialDef[] = [];
  try { const raw = await env.TOKEN_KV.get(KV_KEY); keys = raw ? JSON.parse(raw) : []; } catch { keys = cache?.keys || []; }
  cache = { at: Date.now(), keys: Array.isArray(keys) ? keys : [] };
  return cache.keys;
}
async function save(env: Env, keys: CredentialDef[]) {
  if (!env.TOKEN_KV) throw new ApiError('INTERNAL', 'TOKEN_KV is not bound');
  await env.TOKEN_KV.put(KV_KEY, JSON.stringify(keys));
  cache = { at: Date.now(), keys };
}

export type KeyView = {
  id: string; label: string; actors: string[]; status: 'active' | 'revoked' | 'expired'; expiresAt: string | null;
  rotating: boolean; previousUntil: string | null; source: 'console' | 'secret'; createdAt: string | null; createdBy: string | null; updatedAt: string | null;
  /** null: everything the person's role allows; else only these. */
  scopes: string[] | null;
};

/** A limited key's scopes, checked: null (the role's) or a non-empty list of known scopes. */
export function scopesOf(v: unknown): string[] | null {
  if (v === null || v === undefined || v === 'all') return null;
  if (!Array.isArray(v) || !v.length || v.length > ALL_SCOPES.length) throw invalid('scopes', 'null for everything the person may do, or a list of scopes');
  const out = [...new Set(v.map(String))];
  const bad = out.find((x) => !(ALL_SCOPES as readonly string[]).includes(x));
  if (bad) throw invalid('scopes', `no such scope: ${bad.slice(0, 40)}`);
  return out.sort();
}

/** Every key the server accepts, without hashes. */
export async function listKeys(env: Env): Promise<KeyView[]> {
  const stored = await storedKeys(env, true);
  const fromConsole = new Set(stored.map((k) => k.id));
  let labels: Record<string, string> = {};
  try { labels = JSON.parse(env.KEY_LABELS || '{}'); } catch { /* default names */ }
  const now = Date.now();
  return credentials(env.API_CREDENTIALS, stored).map((k) => ({
    id: k.id, label: k.label || labels[k.id] || '', actors: k.actors,
    status: k.disabled ? 'revoked' : k.expiresAt && !(Date.parse(k.expiresAt) > now) ? 'expired' : 'active',
    expiresAt: k.expiresAt || null,
    rotating: !!k.previousSha256 && Date.parse(k.previousUntil || '') > now, previousUntil: k.previousUntil || null,
    source: fromConsole.has(k.id) ? 'console' : 'secret', createdAt: k.createdAt || null, createdBy: k.createdBy || null, updatedAt: k.updatedAt || null,
    scopes: Array.isArray(k.scopes) ? k.scopes : null,
  }));
}

const newKey = () => 'hr_' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

/** A key from the console, or one from the secret copied into the console's record so it can be changed. */
async function editable(env: Env, id: string): Promise<{ all: CredentialDef[]; key: CredentialDef }> {
  const all = [...await storedKeys(env, true)];
  let key = all.find((k) => k.id === id);
  if (!key) {
    const fromSecret = credentials(env.API_CREDENTIALS, []).find((k) => k.id === id);
    if (!fromSecret) throw new ApiError('NOT_FOUND', 'no such key');
    key = { ...fromSecret };
    all.push(key);
  }
  return { all, key };
}

export async function createKey(env: Env, input: { id?: string; label: string; actor: string; expiresAt?: string | null; scopes?: unknown }, by: string) {
  const label = String(input.label || '').trim();
  if (!label || label.length > 60) throw invalid('label', 'a name of 1 to 60 characters');
  if (!/^user:[A-Za-z0-9_-]{1,128}$/.test(input.actor)) throw invalid('actor', 'the person the key acts as (user:<uid>)');
  const id = input.id ? String(input.id) : 'cred-' + label.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 20) || 'cred-key';
  const all = [...await storedKeys(env, true)];
  let unique = ID_RE.test(id) ? id : 'cred-key';
  const taken = new Set([...all, ...credentials(env.API_CREDENTIALS, [])].map((k) => k.id));
  for (let n = 2; taken.has(unique); n++) unique = `${id}-${n}`;
  if (input.expiresAt && !(Date.parse(input.expiresAt) > Date.now())) throw invalid('expiresAt', 'must be in the future');
  const scopes = scopesOf(input.scopes);
  const key = newKey();
  const now = new Date().toISOString();
  all.push({ id: unique, sha256: await sha256hex(key), actors: [input.actor], label, createdAt: now, createdBy: by, updatedAt: now, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}), ...(scopes ? { scopes } : {}) });
  await save(env, all);
  return { id: unique, key };
}

export async function changeKey(env: Env, id: string, action: string, input: Record<string, unknown>, by: string) {
  const { all, key } = await editable(env, id);
  const now = new Date();
  let plain: string | undefined;
  if (action === 'rename') {
    const label = String(input.label || '').trim();
    if (!label || label.length > 60) throw invalid('label', 'a name of 1 to 60 characters');
    key.label = label;
  } else if (action === 'revoke') key.disabled = true;
  else if (action === 'restore') key.disabled = false;
  else if (action === 'expire') {
    const at = input.expiresAt ? String(input.expiresAt) : '';
    if (at && !(Date.parse(at) > 0)) throw invalid('expiresAt', 'an ISO date');
    if (at) key.expiresAt = at; else delete key.expiresAt;
  } else if (action === 'scopes') {
    // what the key may do: everything its person may (null), or only part of it
    const scopes = scopesOf(input.scopes);
    if (scopes) key.scopes = scopes; else delete key.scopes;
  } else if (action === 'rotate') {
    // the old key keeps working for the grace period (0 to 72 hours), so the assistant can switch without a gap
    const hours = Math.max(0, Math.min(72, Number(input.graceHours ?? 24)));
    plain = newKey();
    if (hours > 0) { key.previousSha256 = key.sha256; key.previousUntil = new Date(now.getTime() + hours * 3600_000).toISOString(); }
    else { delete key.previousSha256; delete key.previousUntil; }
    key.sha256 = await sha256hex(plain);
    key.disabled = false;
  } else throw new ApiError('NOT_FOUND', `no such key action: ${action}`);
  key.updatedAt = now.toISOString();
  key.createdBy = key.createdBy || by;
  await save(env, all);
  return { id: key.id, ...(plain ? { key: plain } : {}) };
}
