// Firebase Cloud Messaging HTTP v1 from a Worker (the second sender behind PUSH_MODE, docs/push-setup.md).
// The message is data-only: the app's own service worker (src/sw.ts, `push`) shows it, exactly like a Web Push
// message, so both senders look the same on the phone.
//
// Credentials: FCM_SERVICE_ACCOUNT (a service account with the "Firebase Cloud Messaging API Admin" role), or the
// Worker's GCP_SERVICE_ACCOUNT when that one has the role. The access token has its own scope and its own KV key,
// so the Firestore token (firestore.ts) is never widened.

export type FcmEnv = {
  FCM_SERVICE_ACCOUNT?: string;
  GCP_SERVICE_ACCOUNT?: string;
  FCM_PROJECT_ID?: string;
  FIRESTORE_PROJECT_ID?: string;
  TOKEN_KV?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> };
  /** Test mode only (emulator + TEST_FAULTS): mock token and FCM endpoints. */
  GOOGLE_TOKEN_URL?: string;
  FCM_API_URL?: string;
};
export type FcmResult = { status: number; ok: boolean; gone: boolean; retry: boolean };

type ServiceAccount = { client_email: string; private_key: string; private_key_id?: string; project_id?: string };
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_URL = 'https://fcm.googleapis.com';

const b64url = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let memo: { email: string; token: string; expiresAt: number } | null = null;
let keyMemo: { pem: string; key: CryptoKey } | null = null;

function serviceAccount(env: FcmEnv): ServiceAccount {
  const raw = env.FCM_SERVICE_ACCOUNT || env.GCP_SERVICE_ACCOUNT || '';
  let sa: ServiceAccount;
  try { sa = JSON.parse(raw); } catch { throw new Error('FCM service account is not valid JSON'); }
  if (!sa.client_email || !sa.private_key) throw new Error('FCM service account is missing client_email or private_key');
  return sa;
}
export const fcmProject = (env: FcmEnv) => env.FCM_PROJECT_ID || env.FIRESTORE_PROJECT_ID || '';
export const fcmConfigured = (env: FcmEnv) => !!(env.FCM_SERVICE_ACCOUNT || env.GCP_SERVICE_ACCOUNT) && !!fcmProject(env);

async function rsaKey(pem: string): Promise<CryptoKey> {
  if (keyMemo?.pem === pem) return keyMemo.key;
  const der = Uint8Array.from(atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  keyMemo = { pem, key };
  return key;
}

/** An access token for the messaging scope: memory, then KV (shared by isolates), then a fresh signature. */
export async function fcmToken(env: FcmEnv, tokenUrl = TOKEN_URL): Promise<string> {
  const sa = serviceAccount(env);
  if (memo && memo.email === sa.client_email && Date.now() < memo.expiresAt) return memo.token;
  const kvKey = 'gtoken-fcm1:' + sa.client_email;
  if (env.TOKEN_KV) {
    try {
      const hit = JSON.parse((await env.TOKEN_KV.get(kvKey)) || 'null') as { token: string; expiresAt: number } | null;
      if (hit && hit.expiresAt - Date.now() > 120_000) { memo = { email: sa.client_email, token: hit.token, expiresAt: hit.expiresAt - 60_000 }; return hit.token; }
    } catch { /* KV unavailable: sign */ }
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64urlJson({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) }) + '.' + b64urlJson({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await rsaKey(sa.private_key), new TextEncoder().encode(unsigned)));
  let res: Response;
  try {
    res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64url(sig), signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('Google token endpoint unreachable'); }
  // never log the body: it holds a token
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Google token exchange returned no token');
  const expiresAt = Date.now() + Math.max(0, (j.expires_in ?? 3600) - 60) * 1000;
  memo = { email: sa.client_email, token: j.access_token, expiresAt };
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  if (env.TOKEN_KV && ttl > 180) await env.TOKEN_KV.put(kvKey, JSON.stringify({ token: j.access_token, expiresAt }), { expirationTtl: ttl }).catch(() => {});
  return j.access_token;
}

export type FcmMessage = { title: string; body: string; link: string; tag: string; urgent: boolean; ttl: number };

/** Sends one data message to one registration token. 404 / UNREGISTERED means the token is gone (drop it). */
export async function sendFcm(env: FcmEnv, token: string, m: FcmMessage, urls: { api?: string; token?: string } = {}): Promise<FcmResult> {
  const bearer = await fcmToken(env, urls.token);
  const message = {
    token,
    // data values must be strings
    data: { title: m.title, body: m.body, link: m.link, tag: m.tag, urgent: m.urgent ? 'true' : 'false' },
    webpush: { headers: { TTL: String(m.ttl), Urgency: m.urgent ? 'high' : 'normal' } },
  };
  let res: Response;
  try {
    res = await fetch(`${urls.api || FCM_URL}/v1/projects/${encodeURIComponent(fcmProject(env))}/messages:send`, { method: 'POST', headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' }, body: JSON.stringify({ message }), signal: AbortSignal.timeout(8000) });
  } catch { return { status: 0, ok: false, gone: false, retry: true }; }
  const s = res.status;
  let code = '';
  if (!res.ok) {
    try {
      const j = (await res.json()) as { error?: { status?: string; details?: { errorCode?: string }[] } };
      code = j.error?.details?.find((d) => d.errorCode)?.errorCode || j.error?.status || '';
    } catch { /* not json */ }
  } else await res.body?.cancel().catch(() => {});
  // INVALID_ARGUMENT can be our payload as well as the token, so only these two drop a device
  const gone = s === 404 || code === 'UNREGISTERED';
  return { status: s, ok: res.ok, gone, retry: s === 429 || s >= 500 };
}
