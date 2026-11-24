// B4-Receive: the dark broadcast card at the top of the first root (TasksRoot, VendorHome).
// It shows the newest broadcast addressed to this person that they have not read: a normal one on the day it was sent,
// an urgent one until it is read. "קראתי" writes the person's own receipt (B3) and clears the C1 notification.
// Every recent broadcast that reaches this phone also gets a "seen" receipt, so B3 can tell "not in the app yet" apart.
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Icon } from '../../kit';
import type { V2Ctx } from '../../ctx';
import type { Broadcast } from '../../../types';
import { daysFromToday } from '../../format';
import { cardEligible, cardWhen, firstName, isRead, markRead, markSeen, useBroadcastNotification, useMyBroadcasts, useReceipt } from '../../data/broadcast';

/** How far back a broadcast still counts as "reached this phone" (seen receipts). */
const SEEN_DAYS = 14;
type Verdict = 'loading' | 'read' | 'unread';

/** Loads my receipt for one broadcast, writes "seen" once, and reports whether it is still unread. */
function Probe({ ctx, b, onVerdict }: { ctx: V2Ctx; b: Broadcast; onVerdict: (id: string, v: Verdict) => void }) {
  const { item, loading } = useReceipt(b.id, ctx.user.uid);
  const verdict: Verdict = loading ? 'loading' : isRead(item) ? 'read' : 'unread';
  useEffect(() => { onVerdict(b.id, verdict); }, [b.id, verdict]);
  useEffect(() => { if (!loading && !item && !ctx.viewAsStaff) markSeen(ctx.actor, b.id).catch(() => {}); }, [loading, !!item, b.id]);
  return null;
}

function TheCard({ ctx, b, onDone }: { ctx: V2Ctx; b: Broadcast; onDone: () => void }) {
  const { item } = useReceipt(b.id, ctx.user.uid);
  const note = useBroadcastNotification(ctx.user.uid, b.id);
  const [out, setOut] = useState(false);
  function read() {
    if (ctx.viewAsStaff) return; // "view as volunteer" is a read-only preview
    setOut(true);
    // the receipt is local at once (offline too); the card leaves after its short fade
    markRead(ctx.actor, b.id, item, note.item).catch(() => {});
    setTimeout(onDone, 220);
  }
  return (
    <section role="status" className={'k-hero k-hero--tight broadcast-card' + (out ? ' broadcast-card--out' : '')}>
      <div className="broadcast-card__head"><Icon name="megaphone" size={18} /><span>הודעה מ{firstName(b.by.name)} · {cardWhen(b.createdAt)}</span></div>
      <span className="broadcast-card__text">{b.text}</span>
      <Button variant="onhero-solid" onClick={read}>קראתי</Button>
    </section>
  );
}

export function BroadcastCard({ ctx }: { ctx: V2Ctx }): ReactNode {
  const mine = useMyBroadcasts(ctx.user.uid, 10);
  const recent = mine.items.filter((b) => daysFromToday(b.createdAt) >= -SEEN_DAYS);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [gone, setGone] = useState<string[]>([]);
  const onVerdict = (id: string, v: Verdict) => setVerdicts((s) => (s[id] === v ? s : { ...s, [id]: v }));
  // newest first: the first eligible broadcast decides; wait while a newer one is still loading so the card never jumps
  let pick: Broadcast | null = null;
  for (const b of recent) {
    if (!cardEligible(b) || gone.includes(b.id)) continue;
    const v = verdicts[b.id];
    if (v === 'loading' || v === undefined) break;
    if (v === 'unread') { pick = b; break; }
  }
  return (
    <>
      {recent.map((b) => <Probe key={b.id} ctx={ctx} b={b} onVerdict={onVerdict} />)}
      {pick && <TheCard key={pick.id} ctx={ctx} b={pick} onDone={() => setGone((g) => [...g, pick!.id])} />}
    </>
  );
}
