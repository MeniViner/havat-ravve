// Standard Web Push from a Worker, WebCrypto only (no node, no library):
//  - VAPID (RFC 8292): an ES256 JWT per push-service origin, signed with the farm's VAPID private key.
//  - Message encryption (RFC 8291, aes128gcm of RFC 8188): one record, an ephemeral ECDH key per message.
// Works for Chrome/Android (fcm.googleapis.com), Firefox (push.services.mozilla.com), Safari and the iPhone
// Home Screen app on iOS 16.4+ (web.push.apple.com), Edge (notify.windows.com).
//
// Keys, as `node scripts/push-test.mjs --generate` prints them (the format every Web Push library uses):
//   VAPID_PUBLIC_KEY  base64url of the 65-byte uncompressed P-256 point (the browser's applicationServerKey)
//   VAPID_PRIVATE_KEY base64url of the 32-byte private scalar d
// The private key lives only in the Worker secret; it is never logged and never leaves this file's functions.

export type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Vapid = { publicKey: string; privateKey: string; subject: string };
export type WebPushOptions = { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string };
export type WebPushResult = { status: number; ok: boolean; gone: boolean; retry: boolean };

const te = new TextEncoder();
/** Bytes backed by a plain ArrayBuffer (what WebCrypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (s: string): Bytes => new Uint8Array(te.encode(s));

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Bytes {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** Push services this sender talks to (endpoint host suffixes, https only). Anything else is refused before any request. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
/** `testHosts` (test mode only) lets a local mock push service through. */
export function allowedEndpoint(endpoint: string, testHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (testHosts.length && u.protocol === 'http:' && testHosts.includes(u.host)) return true;
  if (u.protocol !== 'https:' || u.port) return false;
  return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
}

// ---------- VAPID ----------
let keyCache: { pem: string; key: CryptoKey } | null = null;
async function vapidKey(v: Vapid): Promise<CryptoKey> {
  const id = v.publicKey + '.' + v.privateKey;
  if (keyCache?.pem === id) return keyCache.key;
  const pub = b64urlDecode(v.publicKey);
  const d = b64urlDecode(v.privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw new Error('VAPID keys are not P-256 (public 65 bytes, private 32 bytes, base64url)');
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: b64urlEncode(d), x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: false }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache = { pem: id, key };
  return key;
}

/** One JWT per push-service origin per run (12 hours valid; services accept up to 24). */
const jwtCache = new Map<string, { jwt: string; exp: number }>();
export async function vapidAuthorization(endpoint: string, v: Vapid, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const hit = jwtCache.get(aud + '|' + v.publicKey);
  let jwt = hit && hit.exp - nowS > 3600 ? hit.jwt : '';
  if (!jwt) {
    const exp = nowS + 12 * 3600;
    const unsigned = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64urlEncode(utf8(JSON.stringify({ aud, exp, sub: v.subject })));
    // WebCrypto ECDSA returns r||s (64 bytes), which is exactly the JWS ES256 signature format
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(v), utf8(unsigned)));
    jwt = unsigned + '.' + b64urlEncode(sig);
    jwtCache.set(aud + '|' + v.publicKey, { jwt, exp });
  }
  return `vapid t=${jwt}, k=${v.publicKey}`;
}

// ---------- RFC 8291 encryption ----------
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** The aes128gcm body for one subscription: salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext. */
export async function encrypt(sub: WebPushSubscription, plaintext: Bytes, salt: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.keys.p256dh);
  const authSecret = b64urlDecode(sub.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('subscription keys are malformed');
  const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, as.privateKey, 256));
  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // a single (last) record: the plaintext followed by the 0x02 delimiter, no padding
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** A Topic header is at most 32 characters of the URL-safe base64 alphabet. */
export const topicOf = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

/**
 * Sends one push. Never throws for a push-service answer: 404/410 mean the subscription is gone (drop it),
 * 429/5xx and network errors are worth a later retry, anything else is a permanent failure for this message.
 */
export async function sendWebPush(sub: WebPushSubscription, payload: unknown, v: Vapid, o: WebPushOptions = {}): Promise<WebPushResult> {
  const body = await encrypt(sub, utf8(JSON.stringify(payload)));
  const headers: Record<string, string> = {
    authorization: await vapidAuthorization(sub.endpoint, v),
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(o.ttl ?? 6 * 3600),
    urgency: o.urgency || 'normal',
  };
  const topic = o.topic ? topicOf(o.topic) : '';
  if (topic) headers.topic = topic;
  let res: Response;
  try { res = await fetch(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) }); }
  catch { return { status: 0, ok: false, gone: false, retry: true }; }
  // the answer body is never read into a log: some services echo the endpoint
  await res.body?.cancel().catch(() => {});
  const s = res.status;
  return { status: s, ok: s >= 200 && s < 300, gone: s === 404 || s === 410, retry: s === 429 || s >= 500 };
}
