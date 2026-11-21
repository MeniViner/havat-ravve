// C1-Notifs: my notifications, new and earlier. Each row opens its subject; some carry an inline action
// (a shopping trip that just started: "הוספה" adds an item to it). Opening the screen marks the new ones read
// (they stay under "חדש" until the screen is left). "מה לקבל" opens the phone-push choices (PushSheet).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppScreen, go } from '../../core';
import { Button, EmptyState, IconTile, ListCard, PageTitle, Row, TextLink, TopBar, type IconName } from '../../kit';
import { ago } from '../../format';
import { back } from '../../../router';
import type { ScreenProps } from '../../ctx';
import type { UserNotification } from '../../../types';
import { firstName, useNotifications } from '../../data/broadcast';
import { markNotificationsRead } from '../../data/notify';
import { PushSheet } from './PushSheet';

const ICON: Record<string, IconName> = { task: 'tasks', urgent: 'tasks', trip: 'cart', event: 'qr', broadcast: 'megaphone', vendor: 'stall', system: 'bell' };
/** The subject line; a task put on me also says who and when ("לתקן את הברז ליד החממה · בני, לפני 20 דק׳"). */
const metaOf = (n: UserNotification, fresh: boolean) => (n.kind === 'task' && fresh && n.by ? `${n.sub ? n.sub + ' · ' : ''}${firstName(n.by.name)}, ${ago(n.createdAt)}` : n.sub);

export function NotificationsScreen({ ctx, params }: ScreenProps): ReactNode {
  const list = useNotifications(ctx.user.uid);
  const [sheet, setSheet] = useState(params.prefs === '1');
  // the ones that were new when the screen opened stay under "חדש" while it is open
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null && !list.loading) fresh.current = new Set(list.items.filter((n) => !n.readAt).map((n) => n.id));
  useEffect(() => {
    if (!fresh.current?.size || ctx.viewAsStaff) return;
    const ids = list.items.filter((n) => !n.readAt && fresh.current!.has(n.id)).map((n) => n.id);
    if (ids.length) markNotificationsRead(ctx.user.uid, ids).catch(() => {});
  }, [list.loading]);

  const isNew = (n: UserNotification) => !n.readAt || !!fresh.current?.has(n.id);
  const now = list.items.filter(isNew);
  const before = list.items.filter((n) => !isNew(n));
  const open = (n: UserNotification) => go(n.link || '/tasks');
  const act = (n: UserNotification) => (n.action?.kind === 'addToTrip' ? go('/new?kind=shopping') : open(n));
  const row = (n: UserNotification, fresh: boolean) => (
    <Row key={n.id} minHeight={fresh ? 64 : 60} onClick={() => open(n)} chevron={!(fresh && n.action)}
      leading={<IconTile icon={ICON[n.kind] || 'bell'} tone={n.kind === 'urgent' ? 'red' : undefined} />}
      title={n.title} meta={metaOf(n, fresh)} unread={fresh && !n.action}
      actions={fresh && n.action ? <Button onClick={() => act(n)}>{n.action.label}</Button> : undefined} />
  );

  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: 'חזרה', onClick: () => back('/tasks') }} end={<TextLink onClick={() => setSheet(true)}>מה לקבל</TextLink>} />
      <PageTitle>התראות</PageTitle>
      {now.length > 0 && <ListCard title="חדש" count={now.length}>{now.map((n) => row(n, true))}</ListCard>}
      {before.length > 0 && <ListCard title="קודם">{before.map((n) => row(n, false))}</ListCard>}
      {!list.loading && !list.items.length && <EmptyState variant="card" icon="bell" title="אין התראות" text="כשמשהו יקרה בשבילך, הוא יופיע כאן." />}
      <PushSheet ctx={ctx} open={sheet} onClose={() => setSheet(false)} />
    </AppScreen>
  );
}
