// Shared bits of the shopping screens: in-app links, relative times in weeks and months, the bought action with its toast.
import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { href } from '../../../router';
import { go, useToast } from '../../core';
import { Tag } from '../../kit';
import { nowMs } from '../../../clock';
import { useNowMin } from '../farm/parts';
import { ago, daysFromToday, ddmm, hhmm } from '../../format';
import { setItemBought, doneWord } from '../../data/shopping';
import type { Actor, ShoppingItem, ShoppingTrip } from '../../../types';

/** Props for an <a> (or Row) that opens a screen inside the app. */
export const link = (path: string) => ({ href: href(path), onClick: (e: MouseEvent<HTMLElement>) => { e.preventDefault(); go(path); } });

/** format.ago, continued past a week: "לפני שבוע", "לפני שבועיים", "לפני חודש" (S2). */
export function agoLong(iso: string): string {
  const d = -daysFromToday(iso);
  if (d < 7) return ago(iso);
  if (d < 14) return 'לפני שבוע';
  if (d < 21) return 'לפני שבועיים';
  if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
  if (d < 60) return 'לפני חודש';
  if (d < 90) return 'לפני חודשיים';
  if (d < 365) return `לפני ${Math.floor(d / 30)} חודשים`;
  return d < 730 ? 'לפני שנה' : `לפני ${Math.floor(d / 365)} שנים`;
}

/** Ticking a row answers before the list changes: the box draws its check and the line is struck, the row folds away
 *  (about 0.4 s), then the write lands and a toast offers "ביטול". */
export function useMarkBought(actor: Actor, trip?: ShoppingTrip | null) {
  const toast = useToast();
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  const fail = (e: unknown) => toast.show({ text: `לא נשמר. ${(e as Error)?.message || ''}`.trim(), tone: 'error', actions: [{ label: 'הבנתי', onClick: () => {} }] });
  const mark = useCallback((i: ShoppingItem) => {
    if (timers.current.has(i.id)) return;
    setLeaving((s) => new Set(s).add(i.id));
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    timers.current.set(i.id, window.setTimeout(() => {
      timers.current.delete(i.id);
      setLeaving((s) => { const n = new Set(s); n.delete(i.id); return n; });
      setItemBought(actor, i, true, trip).catch(fail);
      toast.show({ text: `${doneWord(i.category)}: ${i.title}`, actions: [{ label: 'ביטול', onClick: () => { setItemBought(actor, { ...i, bought: true }, false, null).catch(fail); } }] });
    }, reduce ? 0 : 420));
  }, [actor.uid, trip?.id]);
  const unmark = useCallback((i: ShoppingItem) => { setItemBought(actor, i, false, null).catch(fail); }, [actor.uid]);
  return { leaving, mark, unmark, fail };
}

export function UrgencyTag({ item, compact = false }: { item: ShoppingItem; compact?: boolean }) {
  useNowMin();
  if (!item.urgent || item.bought) return null;
  const due = item.urgentDueAt;
  const valid = due && Number.isFinite(Date.parse(due));
  return <Tag tone="urgent">{valid && Date.parse(due) < nowMs() ? 'דחוף · באיחור' : 'דחוף'}{valid && !compact && ` · ${ddmm(due)} ${hhmm(due)}`}</Tag>;
}
