// Counts the subrequests of one cron run (fetch, KV and R2 calls: the free plan allows 50 per invocation). The run works
// on a copy of env whose KV, R2 and FETCH count themselves, so a request answered by the same isolate at the same moment
// is never counted with it.
import type { Env } from './firestore';

export function meter<E extends Env>(env: E): { env: E; used(): number } {
  let n = 0;
  const tick = <T>(v: T) => { n++; return v; };
  const out = Object.create(env) as E;
  const own = (k: string, value: unknown) => Object.defineProperty(out, k, { value, enumerable: true });
  const kv = env.TOKEN_KV;
  if (kv) own('TOKEN_KV', { get: (k: string) => tick(kv.get(k)), put: (k: string, v: string, o?: { expirationTtl?: number }) => tick(kv.put(k, v, o)), delete: async (k: string) => tick(kv.delete?.(k)) });
  const b = env.FILE_BUCKET;
  if (b) own('FILE_BUCKET', { put: (...a: Parameters<typeof b.put>) => tick(b.put(...a)), get: (...a: Parameters<typeof b.get>) => tick(b.get(...a)), list: (...a: Parameters<typeof b.list>) => tick(b.list(...a)), delete: (...a: Parameters<typeof b.delete>) => tick(b.delete(...a)) });
  own('FETCH', (input: RequestInfo | URL, init?: RequestInit) => tick(fetch(input, init)));
  return { env: out, used: () => n };
}
