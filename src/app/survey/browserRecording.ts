import { openDB, type DBSchema } from 'idb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { quality, type Fix, type Recording, type Sample } from './model';

type Walk = Recording & { segment: number; newSegment: boolean; elapsedMs: number; activeSince: number };
type Action = 'start' | 'resume' | 'pause' | 'finish' | 'saved';
interface Store extends DBSchema {
  sessions: { key: string; value: Walk };
  samples: { key: [string, number]; value: Sample };
}
let dbPromise: ReturnType<typeof openDB<Store>> | undefined;
const storage = () =>
  (dbPromise ??= openDB<Store>('farm-browser-recordings', 1, {
    upgrade(db) {
      db.createObjectStore('sessions');
      db.createObjectStore('samples');
    },
  }));
const range = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
const stop = (r: Walk, state: Walk['state'], at: number): Walk => ({
  ...r,
  state,
  newSegment: true,
  elapsedMs: r.elapsedMs + (r.activeSince ? Math.max(0, at - r.activeSince) : 0),
  activeSince: 0,
});
export function useBrowserRecording(scope: string, uid: string, fix: Fix | null, enabled: boolean) {
  const [session, setSession] = useState<Walk>(),
    [samples, setSamples] = useState<Sample[]>([]);
  const [issue, setIssue] = useState(''),
    [writable, own] = useState(false);
  const lease = useRef(false),
    mounted = useRef(false),
    latest = useRef(fix);
  latest.current = fix;
  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    let release: () => void = () => {},
      ended = false;
    const held = new Promise<void>((r) => {
      release = r;
    });
    async function open() {
      if (!navigator.locks) {
        setIssue('הדפדפן אינו תומך בהקלטה בטוחה. אפשר לשרטט שביל ידנית.');
        return;
      }
      await navigator.locks.request('farm-walk:' + scope, async () => {
        if (ended) return;
        const db = await storage(),
          tx = db.transaction('sessions', 'readwrite');
        let r = await tx.store.get(scope);
        if (r?.state === 'recording') {
          r = stop(r, 'interrupted', r.lastAt || r.started);
          await tx.store.put(r, scope);
        }
        await tx.done;
        if (ended) return;
        const points = r ? await db.getAll('samples', range(r.id)) : [];
        if (ended) return;
        setSession(r);
        setSamples(points);
        lease.current = true;
        own(true);
        await held;
        lease.current = false;
        const end = db.transaction('sessions', 'readwrite'),
          last = await end.store.get(scope);
        if (last?.state === 'recording') await end.store.put(stop(last, 'interrupted', Date.now()), scope);
        await end.done;
      });
    }
    void open().catch(() => {
      if (!ended) setIssue('לא ניתן לפתוח את טיוטת ההקלטה במכשיר');
    });
    const hidden = async () => {
      if (!document.hidden || !lease.current) return;
      const db = await storage(),
        tx = db.transaction('sessions', 'readwrite'),
        r = await tx.store.get(scope);
      if (r?.state === 'recording') {
        const paused = stop(r, 'interrupted', Date.now());
        await tx.store.put(paused, scope);
        await tx.done;
        if (!ended) setSession(paused);
      }
    };
    const onVisibility = () =>
      void hidden().catch(() => {
        if (!ended) setIssue('שמירת ההפסקה נכשלה');
      });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ended = true;
      mounted.current = false;
      lease.current = false;
      release();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scope, enabled]);
  const append = useCallback(
    async (p: Fix) => {
      if (!lease.current || document.hidden) return;
      const db = await storage(),
        tx = db.transaction(['sessions', 'samples'], 'readwrite');
      const r = await tx.objectStore('sessions').get(scope),
        q = quality(p, Date.now());
      if (!r || r.state !== 'recording' || (r.lastAt && p.at <= r.lastAt) || q === 'stale' || q === 'missing')
        return;
      const prior = r.count ? await tx.objectStore('samples').get([r.id, r.count]) : null;
      const gap =
        r.newSegment || !!(r.lastAt && p.at - r.lastAt > 15000) || q === 'weak' || prior?.quality === 'weak';
      const segment = Math.max(1, r.segment + (gap ? 1 : 0));
      const sample: Sample = {
        ...p,
        seq: r.count + 1,
        segment,
        quality: q === 'weak' ? 'weak' : gap && r.count ? 'gap' : 'ok',
        provider: 'browser',
        mock: 0,
      };
      const next: Walk = { ...r, segment, newSegment: false, count: sample.seq, lastAt: p.at };
      await tx.objectStore('samples').add(sample, [r.id, sample.seq]);
      await tx.objectStore('sessions').put(next, scope);
      await tx.done;
      if (mounted.current) {
        setSession(next);
        setSamples((prev) => [...prev, sample]);
      }
    },
    [scope]
  );
  useEffect(() => {
    if (enabled && fix) void append(fix).catch(() => setIssue('שמירת מדידת המיקום נכשלה'));
  }, [enabled, fix, append]);
  async function control(action: Action, expected?: Recording) {
    if (!lease.current) throw Error('ההקלטה אינה זמינה כאן. אם המפה פתוחה בלשונית נוספת, סגרו אותה ונסו שוב.');
    const now = Date.now(),
      p = latest.current;
    if ((action === 'start' || action === 'resume') && (quality(p, now) !== 'fresh' || document.hidden))
      throw Error('נדרשת מדידת מיקום חדשה ומדויקת');
    const db = await storage(),
      tx = db.transaction(['sessions', 'samples'], 'readwrite'),
      sessions = tx.objectStore('sessions');
    const old = await sessions.get(scope);
    let r: Walk | undefined = old;
    if (action === 'start' && !old)
      r = {
        id: crypto.randomUUID(),
        owner: uid,
        state: 'recording',
        started: now,
        count: 0,
        reason: '',
        segment: 1,
        newSegment: false,
        activeSince: now,
        elapsedMs: 0,
      };
    else if (!old || old.id !== expected?.id) throw Error('טיוטת ההקלטה השתנתה');
    else if (action === 'pause' && old.state === 'recording') r = stop(old, 'paused', now);
    else if (action === 'finish' && old.state !== 'review') r = stop(old, 'review', now);
    else if (action === 'resume' && ['paused', 'interrupted'].includes(old.state))
      r = { ...old, state: 'recording', newSegment: true, activeSince: now };
    else if (action === 'saved' && old.state === 'review') {
      await tx.objectStore('samples').delete(range(old.id));
      await sessions.delete(scope);
      r = undefined;
    } else throw Error('הפעולה אינה זמינה במצב ההקלטה הנוכחי');
    if (r) await sessions.put(r, scope);
    await tx.done;
    if (mounted.current) {
      setSession(r);
      if (!r || action === 'start') setSamples([]);
    }
    if (p && (action === 'start' || action === 'resume')) await append(p);
  }
  return { session, samples, control, issue, writable };
}
