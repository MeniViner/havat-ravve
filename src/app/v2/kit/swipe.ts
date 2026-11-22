// Swipe-to-reveal for list rows (Row `swipe`). A sideways drag slides the row part of the way and it stays there,
// showing one or more action buttons underneath; nothing happens until a button is pressed. A drag that starts mostly up or
// down is left to the page scroll. One row is open at a time; a tap anywhere else, or on the row itself, closes it.
// Directions are physical (the finger's direction), not start/end: `right` is what dragging right reveals. With several
// buttons on a side, the first one sits at the screen's edge (the far end of the drag), the next ones toward the row.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react';
import type { IconName } from './icons';

/** done: warm (bought, done). action: pine (take). neutral: soft ink (move on). danger: red (delete). */
export type SwipeAction = { label: string; icon?: IconName; tone: 'done' | 'action' | 'neutral' | 'danger'; onAction: () => void };
export type SwipeActions = { right?: SwipeAction | SwipeAction[]; left?: SwipeAction | SwipeAction[] };
export const swipeList = (a: SwipeAction | SwipeAction[] | undefined): SwipeAction[] => (!a ? [] : Array.isArray(a) ? a : [a]);

const LOCK = 8;          // px of movement before deciding sideways or scroll
const OPEN_AT = 0.45;    // share of the reveal width past which a release opens
const FLICK = 0.45;      // px per ms: a quick flick opens even when short
let closeOpen: (() => void) | null = null;

/** The reveal width: one button is about a third of the row (never under a comfortable 104); several share about
 *  a fifth of the row each (76 to 92), so two buttons open a little under half the row. */
const widthOf = (el: HTMLElement | null, n: number) => {
  const row = el?.offsetWidth || 320;
  return n <= 1 ? Math.round(Math.min(150, Math.max(104, row * 0.32))) : Math.round(n * Math.min(92, Math.max(76, row * 0.22)));
};

export function useSwipe(actions: SwipeActions | undefined) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const front = useRef<HTMLDivElement>(null);
  const g = useRef<{ id: number; x: number; y: number; t: number; base: number; lock: 'x' | 'y' | null; lastX: number; lastT: number } | null>(null);
  const moved = useRef(false);
  const offsetRef = useRef(0);
  const set = (v: number) => { offsetRef.current = v; setOffset(v); };
  const close = useCallback(() => { set(0); if (closeOpen === closeSelf.current) closeOpen = null; }, []);
  const closeSelf = useRef(close);
  closeSelf.current = close;
  const opened = (v: number) => {
    set(v);
    if (v !== 0) { if (closeOpen && closeOpen !== closeSelf.current) closeOpen(); closeOpen = closeSelf.current; try { navigator.vibrate?.(8); } catch { /* no vibration */ } }
    else if (closeOpen === closeSelf.current) closeOpen = null;
  };

  // an open row closes on a tap anywhere outside it
  useEffect(() => {
    if (!offset || dragging) return;
    const away = (e: PointerEvent) => { if (!front.current?.parentElement?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [offset, dragging, close]);
  useEffect(() => () => { if (closeOpen === closeSelf.current) closeOpen = null; }, []);

  const nRight = swipeList(actions?.right).length, nLeft = swipeList(actions?.left).length;
  if (!actions || (!nLeft && !nRight)) return null;

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, base: offsetRef.current, lock: null, lastX: e.clientX, lastT: e.timeStamp };
    moved.current = false;
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dx) > LOCK && Math.abs(dx) > Math.abs(dy) * 1.2) { s.lock = 'x'; setDragging(true); moved.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } }
      else if (Math.abs(dy) > LOCK) { s.lock = 'y'; return; }
      else return;
    }
    if (s.lock !== 'x') return;
    let v = s.base + dx;
    const w = widthOf(front.current, v >= 0 ? nRight : nLeft);
    // no button on that side: the row barely gives; past the buttons: it pulls with resistance
    if (v > 0 && !nRight) v = Math.min(v * 0.15, 16);
    if (v < 0 && !nLeft) v = Math.max(v * 0.15, -16);
    if (v > w) v = w + (v - w) * 0.25;
    if (v < -w) v = -w + (v + w) * 0.25;
    s.lastX = e.clientX; s.lastT = e.timeStamp;
    set(v);
  };
  const end = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.lock !== 'x') {
      // a plain tap on an open row closes it instead of opening the item
      if (offsetRef.current !== 0 && !s.lock) { moved.current = true; close(); }
      return;
    }
    setDragging(false);
    const v = offsetRef.current;
    const wr = widthOf(front.current, nRight), wl = widthOf(front.current, nLeft);
    const speed = (e.clientX - s.x) / Math.max(1, e.timeStamp - s.t);
    if (nRight && (v > wr * OPEN_AT || (speed > FLICK && v > 0 && s.base <= 0))) opened(wr);
    else if (nLeft && (v < -wl * OPEN_AT || (speed < -FLICK && v < 0 && s.base >= 0))) opened(-wl);
    else opened(0);
  };
  const onPointerCancel = (e: RPointerEvent<HTMLDivElement>) => { if (g.current?.id === e.pointerId) { g.current = null; setDragging(false); opened(0); } };
  // a drag (or the tap that closed the row) must not also follow the row's link
  const onClickCapture = (e: RMouseEvent<HTMLDivElement>) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } };
  const run = (a: SwipeAction) => { close(); a.onAction(); };

  return {
    offset, dragging, front, run, close,
    width: widthOf(front.current, offset >= 0 ? nRight : nLeft),
    // a link inside the row would otherwise start the browser's own drag (and cancel the swipe) on a desktop
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel, onClickCapture, onDragStart: (e: { preventDefault: () => void }) => e.preventDefault() },
  };
}
