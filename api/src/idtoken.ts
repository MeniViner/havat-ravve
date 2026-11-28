// Verifies a Firebase Auth ID token (the app's signed-in person) with WebCrypto, no dependencies.
// Production: RS256 against Google's published securetoken keys, cached per isolate for their max-age.
// Emulator mode only (FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST both set): the Auth emulator's
// unsigned tokens are accepted, as the Admin SDK does; every claim is still checked.
import { ApiError } from './http';
import type { Env } from './firestore';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SKEW_S = 300;
let jwks: { at: number; maxAge: number; keys: Map<string, CryptoKey> } | null = null;

const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64u(s)));

async function keyFor(kid: string, env: Env): Promise<CryptoKey | undefined> {
  const now = Date.now();
  if (!jwks || now - jwks.at > jwks.maxAge || !jwks.keys.has(kid)) {
    // tests only (emulator + TEST_FAULTS): a local key set, so the RS256 path is proven without Google
    const url = env.FIRESTORE_EMULATOR_HOST && env.TEST_FAULTS === '1' && env.GOOGLE_JWKS_URL ? env.GOOGLE_JWKS_URL : JWKS_URL;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new ApiError('UPSTREAM_ERROR', 'could not load the sign-in keys');
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600) * 1000;
    const body = await res.json() as { keys?: (JsonWebKey & { kid?: string })[] };
    const keys = new Map<string, CryptoKey>();
    for (const k of body.keys || []) {
      if (!k.kid || k.kty !== 'RSA') continue;
      keys.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    jwks = { at: now, maxAge: Math.min(Math.max(maxAge, 60_000), 6 * 3600_000), keys };
  }
  return jwks.keys.get(kid);
}

/** The uid of a valid, unexpired ID token for this project; UNAUTHENTICATED otherwise. */
export async function verifyIdToken(token: string, env: Env, requireGoogleEmail = false): Promise<{ uid: string; email: string }> {
  const emulator = !!env.FIRESTORE_EMULATOR_HOST && !!env.FIREBASE_AUTH_EMULATOR_HOST;
  // the Auth emulator in single-project mode signs for its own demo project while the app's data keeps the real id
  const project = (emulator && env.AUTH_EMULATOR_PROJECT) || env.FIRESTORE_PROJECT_ID;
  if (!project) throw new ApiError('INTERNAL', 'FIRESTORE_PROJECT_ID is not configured');
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError('UNAUTHENTICATED', 'malformed sign-in token');
  let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try { header = json(parts[0]); claims = json(parts[1]); } catch { throw new ApiError('UNAUTHENTICATED', 'malformed sign-in token'); }
  if (header.alg === 'none' && emulator) {
    // the Auth emulator signs nothing
  } else {
    if (header.alg !== 'RS256' || !header.kid) throw new ApiError('UNAUTHENTICATED', 'sign-in token has the wrong algorithm');
    const key = await keyFor(header.kid, env);
    if (!key) throw new ApiError('UNAUTHENTICATED', 'sign-in token signed by an unknown key');
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) throw new ApiError('UNAUTHENTICATED', 'sign-in token signature is not valid');
  }
  const now = Math.floor(Date.now() / 1000);
  const sub = claims.sub;
  if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}`) throw new ApiError('UNAUTHENTICATED', 'sign-in token is for another project');
  if (typeof claims.exp !== 'number' || claims.exp < now - SKEW_S) throw new ApiError('UNAUTHENTICATED', 'sign-in token has expired');
  if (typeof claims.iat !== 'number' || claims.iat > now + SKEW_S) throw new ApiError('UNAUTHENTICATED', 'sign-in token is from the future');
  if (typeof sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sub)) throw new ApiError('UNAUTHENTICATED', 'sign-in token has no valid user');
  if (requireGoogleEmail && (claims.email_verified !== true || (claims.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider !== 'google.com')) {
    throw new ApiError('UNAUTHENTICATED', 'a verified Google address is required');
  }
  return { uid: sub, email: typeof claims.email === 'string' ? claims.email : '' };
}
