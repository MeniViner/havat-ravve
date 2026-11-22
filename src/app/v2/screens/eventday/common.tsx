// Shared pieces of the event-day area: SPA links, the event a route is about, the camera with QR decoding, toasts on full-bleed pages.
import { useEffect, useEffectEvent, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import jsQR from 'jsqr';
import { EmptyState, Button } from '../../kit';
import { AppScreen, ToastStack } from '../../core';
import { navigate, href as appHref } from '../../../router';
import { useEventDoc, type EventV2 } from '../../data/eventday';
import type { V2Ctx } from '../../ctx';
import './eventday.css';

/** Props for a kit href/onClick pair that stays inside the app. */
export const to = (path: string) => ({ href: appHref(path), onClick: (e: MouseEvent<HTMLElement>) => { e.preventDefault(); navigate(path); } });

/** The event of an event-day route: ?e=<id>, then the route's :id, then today's event. */
export function useRouteEvent(ctx: V2Ctx, params: Record<string, string>) {
  const id = params.e || params.id || ctx.eventToday?.id || '';
  const r = useEventDoc(id);
  return { id, event: r.item as EventV2 | null, loading: r.loading };
}

/** Loading and "no event" states shared by the event-day screens (not designed: follows the tone of E1).
 *  `off`: the event is on, only this module is switched off for it (the old app's messages). */
export function NoEvent({ loading, closed, off, back = '/tasks', backLabel = 'משימות' }: { loading?: boolean; closed?: boolean; off?: 'entry' | 'stall'; back?: string; backLabel?: string }) {
  const action = <Button variant="outline" {...to(back)}>{backLabel}</Button>;
  return (
    <AppScreen variant="root">
      {loading ? null : off && !closed ? (
        <EmptyState icon={off === 'entry' ? 'qr' : 'cart'} title={off === 'entry' ? 'סריקת כניסה כבויה באירוע הזה' : 'דוכן המכירות כבוי באירוע הזה'} action={action} />
      ) : (
        <EmptyState icon="calendar" title={closed ? 'האירוע נסגר' : 'אין אירוע היום'} text={closed ? 'הסריקה בשער והמכירה בדוכן נסגרו.' : 'ביום אירוע יופיעו כאן השער והדוכן.'}
          action={action} />
      )}
    </AppScreen>
  );
}
/** Which module the screen needs, when the event exists and is open but that module is off. */
export const moduleOff = (event: EventV2 | null, module: 'entry' | 'stall') => (event && !event.closed && event[module] === false ? module : undefined);

/** Toasts (X1 and confirmations) on the full-bleed gate pages, which have no AppScreen bottom area. */
export function GateToasts() {
  return <div className="v2 eventday-gatetoasts" dir="rtl"><ToastStack /></div>;
}

/** Live camera that decodes QR codes with jsQR (logic kept from the old ScanScreen). Fills the kit viewfinder. */
export function QrCamera({ onCode, onError }: { onCode: (s: string) => void; onError: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const decode = useEffectEvent(onCode);
  const fail = useEffectEvent(onError);
  useEffect(() => {
    const preview = video.current!;
    const canvas = document.createElement('canvas');
    const c2d = canvas.getContext('2d', { willReadFrequently: true })!;
    let stream: MediaStream | null = null;
    let raf = 0, last = 0, stopped = false;
    const tick = () => {
      if (stopped) return;
      const t = performance.now();
      if (!preview.paused && preview.readyState >= 2 && t - last > 140) {
        last = t;
        const w = 480;
        const h = Math.round(w * preview.videoHeight / Math.max(1, preview.videoWidth)) || 360;
        canvas.width = w; canvas.height = h;
        c2d.drawImage(preview, 0, 0, w, h);
        const code = jsQR(c2d.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) decode(code.data);
      }
      raf = requestAnimationFrame(tick);
    };
    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
      if (caps?.focusMode?.includes('continuous')) {
        const cons = track.getConstraints?.() || {};
        void track.applyConstraints({ ...cons, advanced: [...(cons.advanced || []), { focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
      }
      preview.srcObject = stream;
      await preview.play();
      if (!stopped) raf = requestAnimationFrame(tick);
    };
    void open().catch(() => { if (stopped) return; stream?.getTracks().forEach((tr) => tr.stop()); fail('אין גישה למצלמה.\nאפשרו מצלמה לאתר, או חפשו לפי שם.'); });
    return () => { stopped = true; cancelAnimationFrame(raf); preview.srcObject = null; stream?.getTracks().forEach((tr) => tr.stop()); };
  }, []);
  return <video ref={video} className="k-viewfinder__media" muted playsInline />;
}

/** The camera, or nothing in demo (no camera there; the demo helper row stands in). Returns the error text to show as the hint. */
export function useCamera(demo: boolean) {
  const [error, setError] = useState('');
  const render = (onCode: (s: string) => void): ReactNode => (demo || error ? null : <QrCamera onCode={onCode} onError={setError} />);
  return { error, render };
}

/** Same code within a few seconds counts once (the camera sees it on many frames). */
export function useDebounce() {
  const recent = useRef({ code: '', at: 0 });
  return (code: string) => {
    const t = performance.now();
    if (recent.current.code === code && t - recent.current.at < 4000) return false;
    recent.current = { code, at: t };
    return true;
  };
}
