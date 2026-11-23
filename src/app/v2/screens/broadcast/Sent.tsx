// Q25-Messages (was B2-Sent): the "הודעות" segment of People (/manage/people?tab=messages). Sent messages, newest first, each
// with its audience tag (the team warm, outside the team neutral), "דחוף", a read bar and the count. Filter chips:
// הכל / לצוות / לאורחים ולכולם. A card opens B3 (/manage/people/messages/:id). "הודעה חדשה" sits in People's top bar.
import { useMemo, useState, type ReactNode } from 'react';
import { go } from '../../core';
import { Bar, Card, Chip, ChipRow, EmptyState, Tag } from '../../kit';
import { useAllEvents } from '../../../data';
import type { V2Ctx } from '../../ctx';
import type { Broadcast } from '../../../types';
import { audienceLabel, isOutside, isRead, sentBy, useReceipts, useSentBroadcasts } from '../../data/broadcast';

/** B3 under People. */
export const messagePath = (id: string) => `/manage/people/messages/${id}`;
type MFilter = 'all' | 'team' | 'outside';

function SentCard({ b, eventTitle }: { b: Broadcast; eventTitle?: string }) {
  const receipts = useReceipts(b.id);
  const of = b.recipientCount || b.recipients?.length || 0;
  const read = receipts.items.filter((r) => isRead(r) && (!b.recipients || b.recipients.includes(r.uid))).length;
  const outside = isOutside(b.audience);
  // guests answer "ראיתי": outside the team the count says who saw it
  const count = `${outside ? 'ראו' : 'קראו'} ${read} מתוך ${of}`;
  return (
    <Card pad="md" layout="col" className="broadcast-sent" href={'/app' + messagePath(b.id)} onClick={(e) => { e.preventDefault(); go(messagePath(b.id)); }}>
      <span className="broadcast-tags">
        <Tag tone={outside ? 'neutral' : 'warm'}>{audienceLabel(b.audience, eventTitle)}</Tag>
        {b.urgent && <Tag tone="urgent">דחוף</Tag>}
      </span>
      <span className="broadcast-sent__text">{b.text}</span>
      <Bar value={of ? read / of : 0} label={`${read} מתוך ${of}`} />
      <div className="broadcast-sent__meta"><span>{sentBy(b)}</span><span className="broadcast-sent__count">{count}</span></div>
    </Card>
  );
}

export function MessagesSegment({ ctx }: { ctx: V2Ctx }): ReactNode {
  const list = useSentBroadcasts(ctx.manager);
  const events = useAllEvents(ctx.manager);
  const titles = useMemo(() => new Map(events.items.map((e) => [e.id, e.title])), [events.items]);
  const [filter, setFilter] = useState<MFilter>('all');
  const shown = list.items.filter((b) => (filter === 'team' ? !isOutside(b.audience) : filter === 'outside' ? isOutside(b.audience) : true));
  return (
    <>
      <ChipRow label="סינון">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>הכל</Chip>
        <Chip selected={filter === 'team'} onClick={() => setFilter('team')}>לצוות</Chip>
        <Chip selected={filter === 'outside'} onClick={() => setFilter('outside')}>לאורחים ולכולם</Chip>
      </ChipRow>
      {shown.map((b) => <SentCard key={b.id} b={b} eventTitle={b.eventId ? titles.get(b.eventId) : undefined} />)}
      {!list.loading && !list.items.length && (
        <EmptyState variant="card" icon="megaphone" title="עוד לא נשלחו הודעות" text="הודעה מגיעה לכולם באפליקציה ובטלפון." />
      )}
      {!list.loading && list.items.length > 0 && !shown.length && (
        <EmptyState variant="card" icon="megaphone" title="אין הודעות בסינון הזה" />
      )}
    </>
  );
}
