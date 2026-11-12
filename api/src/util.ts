// Validation driven by catalog specs, canonical JSON, hashing and ids.
import type { Param } from './catalog';
import { invalid } from './http';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function realDate(s: string) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Checks raw input against a spec and returns the normalized values (trimmed strings, defaults applied,
 * absent optionals as null). `fromQuery` means every value arrives as a string and is coerced.
 */
export function validate(spec: Record<string, Param>, raw: Record<string, unknown>, fromQuery = false): Record<string, unknown> {
  for (const k of Object.keys(raw)) if (!(k in spec)) throw invalid(k, `unknown field "${k}"`);
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(spec)) {
    let v = raw[k];
    if (v === undefined || v === null || (fromQuery && v === '')) {
      if ('required' in p && p.required) throw invalid(k, `"${k}" is required`);
      out[k] = 'default' in p && p.default !== undefined ? p.default : null;
      continue;
    }
    switch (p.type) {
      case 'string': {
        if (typeof v !== 'string') throw invalid(k, `"${k}" must be a string`);
        const s = v.normalize('NFC').trim();
        if (s.length < (p.min ?? 0)) throw invalid(k, `"${k}" is too short`);
        if (s.length > p.max) throw invalid(k, `"${k}" is longer than ${p.max}`);
        out[k] = s;
        break;
      }
      case 'uid':
      case 'id':
        if (typeof v !== 'string' || !ID_RE.test(v)) throw invalid(k, `"${k}" is not a valid ${p.type}`);
        out[k] = v;
        break;
      case 'date':
        if (typeof v !== 'string' || !realDate(v)) throw invalid(k, `"${k}" must be an absolute date YYYY-MM-DD`);
        out[k] = v;
        break;
      case 'bool':
        if (fromQuery && typeof v === 'string') { if (v !== 'true' && v !== 'false') throw invalid(k, `"${k}" must be true or false`); v = v === 'true'; }
        if (typeof v !== 'boolean') throw invalid(k, `"${k}" must be a boolean`);
        out[k] = v;
        break;
      case 'enum':
        if (typeof v !== 'string' || !p.values.includes(v)) throw invalid(k, `"${k}" must be one of: ${p.values.join(', ')}`);
        out[k] = v;
        break;
      case 'int': {
        const n = fromQuery && typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v;
        if (typeof n !== 'number' || !Number.isInteger(n)) throw invalid(k, `"${k}" must be an integer`);
        if (n < p.min || n > p.max) throw invalid(k, `"${k}" must be between ${p.min} and ${p.max}`);
        out[k] = n;
        break;
      }
    }
  }
  return out;
}

/** JSON with sorted keys and no undefined values, so equal payloads hash equally. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-length hex strings. */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** A Firestore-style 20 character auto id. */
export function autoId(len = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHA[b % ALPHA.length];
  return s;
}

export const b64url = {
  encode(s: string) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  decode(s: string) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  },
};

/** Lower-case, NFC, no niqqud or cantillation, single spaces: how names are compared. */
export const normName = (s: string) => s.normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/[\s‏‎]+/g, ' ').trim().toLowerCase();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds until the next midnight in America/Los_Angeles, when Spark's daily Firestore quotas reset. */
export function secondsToPacificMidnight(now = new Date()): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now).map((p) => [p.type, p.value]));
  const elapsed = (Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return Math.max(60, 86400 - elapsed);
}
