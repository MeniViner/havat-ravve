// Counts the subrequests of one cron run (fetch, KV and R2 calls: the free plan allows 50 per invocation). The run works
// on a copy of env whose KV, R2 and FETCH count themselves, so a request answered by the same isolate at the same moment
// is never counted with it.
import type { Env } from './firestore';

export function meter<E extends Env>(env: E, limit: number): { env: E; used(): number } {
  let n = 0;
  const request = <T>(run: () => T) => {
    if (n >= limit) throw new Error('scheduled subrequest budget exhausted');
    n++;
    return run();
  };
  const out = Object.create(env) as E;
  const own = (k: string, value: unknown) => Object.defineProperty(out, k, { value, enumerable: true });
  const kv = env.TOKEN_KV;
  if (kv) own('TOKEN_KV', { get: (k: string) => request(() => kv.get(k)), put: (k: string, v: string, o?: { expirationTtl?: number }) => request(() => kv.put(k, v, o)), delete: async (k: string) => request(() => kv.delete?.(k)) });
  const b = env.FILE_BUCKET;
  if (b) own('FILE_BUCKET', { put: (...a: Parameters<typeof b.put>) => request(() => b.put(...a)), get: (...a: Parameters<typeof b.get>) => request(() => b.get(...a)), list: (...a: Parameters<typeof b.list>) => request(() => b.list(...a)), delete: (...a: Parameters<typeof b.delete>) => request(() => b.delete(...a)) });
  own('FETCH', (input: RequestInfo | URL, init?: RequestInit) => request(() => fetch(input, init)));
  return { env: out, used: () => n };
}
