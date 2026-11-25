// Images and event documents in R2 (FILE_BUCKET, free tier), for the app. New routes only; the assistant API is unchanged.
//
//   POST /v1/files?kind=<kind>   body: the file bytes, Content-Type: image/jpeg|image/webp|image/png (or application/pdf
//                                for kind=eventfile), Authorization: Bearer <Firebase ID token of the signed-in person>
//                                → 201 { url, key, size, type }
//   GET  /v1/files/<key>         the file, cached for a year (keys are random and never reused)
//
// Who may upload follows firestore.rules for the field the file goes into: a profile photo is anyone's own,
// task / shopping / place photos are the team's, event images and event files are managers', a stall photo is
// its vendor's or a manager's. The key carries 192 random bits, so a link is as private as the document that
// holds it (the same model as a Firebase Storage download link). Content is checked by its first bytes, and
// served with nosniff and a sandbox CSP, so a file can never run as a page.
import { ApiError, type Meta, fail } from './http';
import { type Env, Firestore, toApiError } from './firestore';
import { verifyIdToken } from './idtoken';

export type R2Object = { key: string; size: number; uploaded: Date; customMetadata?: Record<string, string> };
export type R2 = {
  put(key: string, value: ArrayBuffer | Uint8Array | string, o?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string>; onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<{ etag: string } | null>;
  get(key: string): Promise<{ body: ReadableStream; size: number; etag: string; httpEtag: string; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; text(): Promise<string> } | null>;
  /** Backups and the recycle bin (backup.ts). */
  list(o: { prefix?: string; delimiter?: string; cursor?: string; limit?: number; include?: ('customMetadata' | 'httpMetadata')[] }): Promise<{ objects: R2Object[]; delimitedPrefixes: string[]; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
};

const KINDS = {
  avatar: { who: 'anyone', pdf: false },
  task: { who: 'team', pdf: false },
  shopping: { who: 'team', pdf: false },
  place: { who: 'team', pdf: false },
  event: { who: 'manager', pdf: false },
  eventfile: { who: 'manager', pdf: true },
  stall: { who: 'vendor', pdf: false },
} as const;
type Kind = keyof typeof KINDS;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'application/pdf': 'pdf' };
const EXT_TYPE: Record<string, string> = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png', pdf: 'application/pdf' };
export const KEY_RE = /^(avatar|task|shopping|place|event|eventfile|stall)\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{32}\.(jpg|webp|png|pdf)$/;
/** The app's own origins: production, its preview channels, and local development. */
const ORIGIN_RE = /^(https:\/\/havat-ravve(--[a-z0-9-]{1,80})?\.(web\.app|firebaseapp\.com)|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;
const TEAM = new Set(['owner', 'manager', 'staff']);
const MANAGERS = new Set(['owner', 'manager']);

export const isFilesPath = (path: string) => path === '/v1/files' || path.startsWith('/v1/files/');

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  return ORIGIN_RE.test(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
}

/** True when the first bytes are what the type says. */
function looksLike(type: string, b: Uint8Array): boolean {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && at(1, 'PNG');
  if (type === 'image/webp') return at(0, 'RIFF') && at(8, 'WEBP');
  if (type === 'application/pdf') return at(0, '%PDF-');
  return false;
}

function mayUpload(kind: Kind, profile: Record<string, unknown>) {
  const role = String(profile.role || '');
  const who = KINDS[kind].who;
  if (who === 'anyone') return true;
  if (who === 'team') return TEAM.has(role);
  if (who === 'manager') return MANAGERS.has(role);
  return role === 'vendor' || MANAGERS.has(role);
}

const randomKey = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_'); };

async function upload(req: Request, env: Env, url: URL, log: Record<string, unknown>): Promise<Response> {
  if (!env.FILE_BUCKET) throw new ApiError('INTERNAL', 'FILE_BUCKET is not bound');
  const kind = url.searchParams.get('kind') || '';
  if (!Object.hasOwn(KINDS, kind)) throw new ApiError('VALIDATION_FAILED', 'unknown kind', { field: 'kind' });
  const k = kind as Kind;
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(req.headers.get('authorization') || '');
  let who: { uid: string };
  try {
    if (!m) throw new ApiError('UNAUTHENTICATED', 'missing sign-in token');
    who = await verifyIdToken(m[1], env);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNAUTHENTICATED' && env.AUTH_LIMITER) {
      const ip = req.headers.get('cf-connecting-ip') || 'local';
      if (!(await env.AUTH_LIMITER.limit({ key: 'auth:' + ip })).success) throw new ApiError('RATE_LIMITED', 'too many failed authentications', {}, { 'retry-after': '60' });
    }
    throw e;
  }
  log.uid = 'set'; // never the uid itself
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: 'upload:' + who.uid })).success) throw new ApiError('RATE_LIMITED', 'too many uploads', {}, { 'retry-after': '60' });
  const profile = (await new Firestore(env).get('users', who.uid))?.data;
  if (!profile || profile.status !== 'active') throw new ApiError('FORBIDDEN', 'no active profile');
  if (!mayUpload(k, profile)) throw new ApiError('FORBIDDEN', `may not upload ${k}`);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type] || (type === 'application/pdf' && !KINDS[k].pdf)) throw new ApiError('VALIDATION_FAILED', 'unsupported file type', { field: 'content-type' });
  const max = type === 'application/pdf' ? MAX_PDF : MAX_IMAGE;
  if (Number(req.headers.get('content-length') || 0) > max) throw new ApiError('VALIDATION_FAILED', 'file too large', { field: 'body', max });
  const body = await req.arrayBuffer();
  if (!body.byteLength) throw new ApiError('VALIDATION_FAILED', 'empty file', { field: 'body' });
  if (body.byteLength > max) throw new ApiError('VALIDATION_FAILED', 'file too large', { field: 'body', max });
  if (!looksLike(type, new Uint8Array(body, 0, Math.min(16, body.byteLength)))) throw new ApiError('VALIDATION_FAILED', 'file content does not match its type', { field: 'body' });
  const key = `${k}/${who.uid}/${randomKey()}.${TYPES[type]}`;
  await env.FILE_BUCKET.put(key, body, { httpMetadata: { contentType: type }, customMetadata: { kind: k, uid: who.uid, at: new Date().toISOString() } });
  log.kind = k; log.size = body.byteLength;
  // the link's host: FILES_PUBLIC_BASE when set (a custom domain later, or local proofs), else this Worker's own origin
  const host = /^https?:\/\/[a-z0-9.:-]+$/i.test(env.FILES_PUBLIC_BASE || '') ? env.FILES_PUBLIC_BASE : url.origin;
  return Response.json({ ok: true, data: { url: `${host}/v1/files/${key}`, key, size: body.byteLength, type } }, { status: 201, headers: { 'cache-control': 'no-store', ...cors(req) } });
}

async function serve(req: Request, env: Env, key: string): Promise<Response> {
  if (!env.FILE_BUCKET) throw new ApiError('INTERNAL', 'FILE_BUCKET is not bound');
  const obj = await env.FILE_BUCKET.get(key);
  if (!obj) throw new ApiError('NOT_FOUND', 'no such file');
  const headers: Record<string, string> = {
    'content-type': EXT_TYPE[key.split('.').pop()!] || 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: obj.httpEtag,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'cross-origin',
    'access-control-allow-origin': '*',
  };
  if (req.headers.get('if-none-match') === obj.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { status: 200, headers: { ...headers, 'content-length': String(obj.size) } });
}

/** Every /v1/files request: preflight, upload, download. One log line per request, never a uid, token or address. */
export async function handleFiles(req: Request, env: Env, url: URL, meta: Meta): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  const log: Record<string, unknown> = { requestId: meta.requestId, method: req.method, path: path.startsWith('/v1/files/') ? '/v1/files/:key' : path };
  let res: Response;
  try {
    if (req.method === 'OPTIONS') {
      res = new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'POST, GET', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400' } });
    } else if (req.method === 'POST' && path === '/v1/files') {
      res = await upload(req, env, url, log);
    } else if ((req.method === 'GET' || req.method === 'HEAD') && path.startsWith('/v1/files/')) {
      const key = decodeURIComponent(path.slice('/v1/files/'.length));
      if (!KEY_RE.test(key)) throw new ApiError('NOT_FOUND', 'no such file');
      res = await serve(req, env, key);
    } else {
      throw new ApiError('NOT_FOUND', `no route for ${req.method} ${log.path}`);
    }
  } catch (e) {
    const err = toApiError(e);
    if (!(e instanceof ApiError)) log.internal = e instanceof Error ? e.message.slice(0, 300) : String(e);
    log.code = err.code;
    res = fail(meta, err);
    for (const [h, v] of Object.entries(cors(req))) res.headers.set(h, v);
  }
  log.status = res.status;
  log.wallMs = Date.now() - meta.started;
  console.log(JSON.stringify(log));
  return res;
}
