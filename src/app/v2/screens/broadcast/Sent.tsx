// B2-Sent: the broadcasts managers sent, newest first, each with its read bar. Row -> B3, "הודעה חדשה" -> B1.
import type { ReactNode } from 'react';
import { AppScreen, go } from '../../core';
import { Bar, Button, Card, EmptyState, PageTitle, Tag, TopBar } from '../../kit';
import type { ScreenProps } from '../../ctx';
import type { Broadcast } from '../../../types';
import { isRead, sentLine, useReceipts, useSentBroadcasts } from '../../data/broadcast';

function SentCard({ b }: { b: Broadcast }) {
  const receipts = useReceipts(b.id);
  const of = b.recipientCount || b.recipients?.length || 0;
  const read = receipts.items.filter((r) => isRead(r) && (!b.recipients || b.recipients.includes(r.uid))).length;
  const href = `/app/manage/broadcasts/${b.id}`;
  return (
    <Card pad="md" layout="col" className="broadcast-sent" href={href} onClick={(e) => { e.preventDefault(); go(`/manage/broadcasts/${b.id}`); }}>
      <span className="broadcast-sent__text">{b.text}{b.urgent && <Tag tone="urgent">דחוף</Tag>}</span>
      <Bar value={of ? read / of : 0} label={`${read} מתוך ${of} קראו`} />
      <div className="broadcast-sent__meta"><span>{sentLine(b)}</span><span className="broadcast-sent__count">קראו {read} מתוך {of}</span></div>
    </Card>
  );
}

export function BroadcastsSent({ ctx }: ScreenProps): ReactNode {
  const list = useSentBroadcasts(ctx.manager);
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', onClick: () => go('/manage') }}
        end={<Button icon="plus" iconSize={18} onClick={() => go('/manage/broadcasts/new')}>הודעה חדשה</Button>} />
      <PageTitle>הודעות לצוות</PageTitle>
      {list.items.map((b) => <SentCard key={b.id} b={b} />)}
      {!list.loading && !list.items.length && (
        <EmptyState variant="card" icon="megaphone" title="עוד לא נשלחו הודעות" text="הודעה לצוות מגיעה לכולם באפליקציה ובטלפון." />
      )}
    </AppScreen>
  );
}
