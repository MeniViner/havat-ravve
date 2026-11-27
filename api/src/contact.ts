// Public, write-only entry to the managers' contact inbox. A typed reply address never identifies a farm account.
import { Firestore, isContention, type Env } from './firestore';
import { verifyIdToken } from './idtoken';

type Input = { id: string; subject: string; message: string; method: 'email' | 'phone'; reply: string };
function input(value: unknown): Input | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !['id', 'subject', 'message', 'method', 'reply'].includes(k))) return null;
  const field = (key: string, max: number) => typeof v[key] === 'string' && v[key].length <= max ? v[key].trim() : '';
  const id = field('id', 36), subject = field('subject', 200), message = field('message', 500), reply = field('reply', 200);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || !subject || !message) return null;
  if (v.method === 'email' && /^[^\s@?&/#]+@[^\s@?&/#]+\.[^\s@?&/#]+$/.test(reply)) return { id, subject, message, method: 'email', reply };
  if (v.method === 'phone' && reply.length <= 25 && /^\+?[\d(). -]+$/.test(reply) && /^\d{9,15}$/.test(reply.replace(/\D/g, ''))) return { id, subject, message, method: 'phone', reply };
  return null;
}

export async function handleContact(req: Request, env: Env) {
  const origin = req.headers.get('origin') || '';
  const official = /^https:\/\/havat-ravve\.(web\.app|firebaseapp\.com)$/.test(origin);
  const local = !!env.FIRESTORE_EMULATOR_HOST && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  if (!official && !local) return new Response(null, { status: 403 });
  const headers = { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'content-type,authorization', 'cache-control': 'no-store' };
  const response = (status: number) => new Response(null, { status, headers });
  if (req.method === 'OPTIONS') return response(204);
  if (req.method !== 'POST') return response(405);
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return response(415);
  if (Number(req.headers.get('content-length')) > 8192) return response(413);
  try {
    // Use the already provisioned bindings. Requests cannot consume farm writes when a production limiter is missing.
    if (!local && (!env.AUTH_LIMITER || !env.HIT_LIMITER)) return response(503);
    if (env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({ key: 'contact:' + (req.headers.get('cf-connecting-ip') || 'local') })).success) return response(429);
    if (env.HIT_LIMITER && !(await env.HIT_LIMITER.limit({ key: 'contact:all' })).success) return response(429);
    const reader = req.body?.getReader();
    if (!reader) return response(400);
    const decoder = new TextDecoder();
    let bytes = 0, raw = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return response(413); }
      raw += decoder.decode(next.value, { stream: true });
    }
    raw += decoder.decode();
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return response(400); }
    const data = input(payload);
    if (!data) return response(400);
    const fs = new Firestore(env);
    let accountUid = '';
    const authorization = req.headers.get('authorization');
    if (authorization) {
      if (!authorization.startsWith('Bearer ')) return response(401);
      let identity;
      try { identity = await verifyIdToken(authorization.slice(7), env, true); } catch { return response(401); }
      // Only an explicit Google choice for that exact address can link its existing account.
      if (data.method === 'email' && identity.email.toLowerCase() === data.reply.toLowerCase()) {
        const p = await fs.get('users', identity.uid);
        if (p?.data.status === 'active') accountUid = identity.uid;
      }
    }
    const id = 'contact-' + data.id;
    const at = new Date().toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (await fs.get('contact_people', id)) return response(204); // same opaque submission, including a lost response
      const writes = [];
      let customerNumber: number | undefined;
      if (!accountUid) {
        const counter = await fs.get('counters', 'users');
        const value = counter ? counter.data.value : 0;
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + 1)) return response(503);
        customerNumber = value + 1;
        writes.push(counter ? fs.patch('counters', 'users', { value: customerNumber }, counter.updateTime) : fs.create('counters', 'users', { value: customerNumber }));
      }
      writes.push(fs.create('contact_people', id, { accountUid, customerNumber, method: data.method, reply: data.reply, createdAt: at }));
      writes.push(fs.create('notifications', id, { type: 'contact', title: data.subject, text: data.message, refId: accountUid || id,
        contactId: id, link: '/manage/inbox/' + id, createdAt: at, handled: false, handledBy: null, handledAt: null }));
      try { await fs.commit(writes); return response(204); }
      catch (error) { if (!isContention(error)) throw error; }
    }
    return response(503);
  } catch { return response(503); }
}
