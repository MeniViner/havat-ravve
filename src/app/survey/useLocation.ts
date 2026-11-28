import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { demoOnly } from '../demo/store';
import { connectSurvey, hasSurveyRecorder, recorder, type Level, type Status } from './native';
import type { Fix, Recording, Sample } from './model';

const blank: Status = { level: 'prompt', enabled: true, notifications: true };
export function useSurveyLocation(uid: string) {
  const native = hasSurveyRecorder && !demoOnly();
  const [grant, setGrant] = useState<{ key: string } | null>(null);
  const [status, setStatus] = useState<Status>(blank);
  const [statusReady, setStatusReady] = useState(!native);
  const [fix, setFix] = useState<Fix | null>(null);
  const [issue, setIssue] = useState('');
  const [raw, setRaw] = useState<Sample[]>([]);
  const [epoch, refresh] = useState(0);
  const [retry, setRetry] = useState(0);
  const [requested, setRequested] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const position = useRef<{ id: string; items: Sample[] }>({ id: '', items: [] });
  const wake = useCallback(() => refresh((x) => x + 1), []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 2000);
    const visible = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', wake);
    const listener = native
      ? App.addListener('appStateChange', (v) => {
          if (v.isActive) wake();
        })
      : null;
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', wake);
      void listener?.then((l) => l.remove());
    };
  }, [native, wake]);
  useEffect(() => {
    let live = true;
    if (native)
      void connectSurvey(uid)
        .then((k) => {
          if (live) {
            setGrant(k);
            setIssue('');
          }
        })
        .catch((e) => {
          if (live) {
            setGrant(null);
            setIssue(e.message);
          }
        });
    return () => {
      live = false;
    };
  }, [uid, native, epoch]);
  useEffect(() => {
    if (!native || !grant) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const current = await recorder.status(grant!);
        if (!live) return;
        setStatus(current);
        setStatusReady(true);
        const session = current.session;
        const cache = position.current;
        if (cache.id !== (session?.id || '')) {
          cache.id = session?.id || '';
          cache.items = [];
          setRaw([]);
        }
        while (session && cache.items.length < session.count && live) {
          const { items } = await recorder.samples({
            ...grant!,
            id: session.id,
            after: cache.items.at(-1)?.seq || 0,
          });
          if (!items.length || !live) break;
          cache.items = cache.items.concat(items);
        }
        if (live) setRaw(cache.items);
      } catch (e) {
        if (live) setIssue((e as Error).message);
      }
      if (live) timer = setTimeout(read, 2500);
    }
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [grant, native, retry]);
  useEffect(() => {
    if (!native || !grant || !status.enabled || !['precise', 'approximate'].includes(status.level)) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const p = await recorder.readFix(grant);
        if (live) {
          setFix(p);
          setIssue('');
        }
      } catch (e) {
        if (live) setIssue((e as { code?: string }).code === 'timeout' ? 'timeout' : 'unavailable');
      }
      if (live) timer = setTimeout(read, 4000);
    };
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [grant, native, status.enabled, status.level, retry]);
  useEffect(() => {
    if (native) return;
    let live = true,
      watch: number | undefined,
      perm: PermissionStatus | undefined;
    const start = (level: Level) => {
      setStatus({ ...blank, level: level === 'prompt' && requested ? 'browser' : level });
      if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
      if (!navigator.geolocation) {
        setIssue('unavailable');
        return;
      }
      if (level === 'blocked' || (level === 'prompt' && !requested)) return;
      watch = navigator.geolocation.watchPosition(
        (p) => {
          if (live) {
            setFix({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy,
              at: p.timestamp,
            });
            setStatus({ ...blank, level: 'browser' });
            setIssue('');
          }
        },
        (e) => {
          if (!live) return;
          if (e.code === 1) {
            setStatus({ ...blank, level: 'blocked' });
            setIssue('');
          } else setIssue(e.code === 3 ? 'timeout' : 'unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );
    };
    void (async () => {
      try {
        perm = await navigator.permissions.query({ name: 'geolocation' });
      } catch {}
      if (!live) return;
      const check = () => {
        if (live) start(perm?.state === 'denied' ? 'blocked' : perm?.state === 'granted' ? 'browser' : 'prompt');
      };
      if (perm) perm.onchange = check;
      check();
    })();
    return () => {
      live = false;
      if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
      if (perm) perm.onchange = null;
    };
  }, [native, requested, epoch, retry]);
  async function ask() {
    setIssue('');
    if (native && grant) {
      setStatus(await recorder.ask(grant));
      setRetry((v) => v + 1);
    } else if (native) wake();
    else {
      setRequested(true);
      setRetry((v) => v + 1);
    }
  }
  async function control(action: 'start' | 'resume' | 'pause' | 'finish' | 'saved', session?: Recording) {
    if (!grant) throw new Error('הקלטת שביל זמינה באפליקציית Android בחשבון בעלים');
    if ((action === 'start' || action === 'resume') && !status.notifications) {
      const s = await recorder.askNotifications(grant);
      setStatus({ ...s, session: status.session });
      if (!s.notifications) throw new Error('כדי לראות את ההקלטה במסך הנעילה, הפעילו התראות בהגדרות האפליקציה');
    }
    const r = await recorder.control({ ...grant, action, id: session?.id || '' });
    setStatus((s) => ({ ...s, session: r.session }));
    setRetry((v) => v + 1);
  }
  return {
    native,
    grant,
    status,
    statusReady,
    fix,
    raw,
    clock,
    issue,
    ask,
    control,
    refresh: () => {
      setRetry((v) => v + 1);
      wake();
    },
    settings: async (target: 'device' | 'app' | 'notifications') => {
      if (grant) await recorder.settings({ ...grant, target });
    },
  };
}
