// Q12 the stall accounts of one event, for managers: three stats, filter chips, one row per account (avatar, name + tag, items and
// when, amount, chevron). Approve and reminder live inside the account (N12); table view and export in ⋯ (Q9, rule 5).
// The crew's list stays in eventday/stall.tsx.
import { useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen } from '../../core';
import { TopBar, PageTitle, StatRow, StatTile, ChipRow, Chip, ListCard, Row, Avatar, Tag, EmptyState, MoreMenu } from '../../kit';
import { useEvent, useEventTabs, hasTabPurchases } from '../../../data';
import { gw } from '../../gender';
import { money, relDay } from '../../format';
import { tableCell, useTableView } from '../../patterns';
import { tabUnits, itemsWord } from './logic';
import { Loading, Missing, backTo, link } from './shared';
import { TAB_LABELS, type FarmEvent, type Tab } from '../../../types';

export function TabsScreen({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Tabs ctx={ctx} e={e} />;
}

/** open: everything still owed (open and "העברתי"), as the design's "פתוחים" chip and stat. */
type F = 'open' | 'claimed' | 'all' | 'paid' | 'waived';
const total = (rows: Tab[]) => rows.reduce((s, t) => s + t.total, 0);
const owes = (t: Tab) => t.status === 'open' || t.status === 'claimed';

function Tabs({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const tabs = useEventTabs(e.id, ctx.manager).items.filter((t) => hasTabPurchases(t) || t.status !== 'open');
  const claimed = tabs.filter((t) => t.status === 'claimed');
  const paid = tabs.filter((t) => t.status === 'paid'), waived = tabs.filter((t) => t.status === 'waived');
  const owing = tabs.filter(owes);
  const [filter, setFilter] = useState<F | null>(null);
  const f: F = filter ?? (owing.length ? 'open' : 'all');
  const list = tabs.filter((t) => f === 'all' || (f === 'open' ? owes(t) : t.status === f))
    .sort((a, b) => Number(!owes(a)) - Number(!owes(b)) || b.updatedAt.localeCompare(a.updatedAt));
  const table = useTableView({
    title: 'חשבונות הדוכן', filter: e.title, filename: `${e.title} - חשבונות.csv`, headers: ['מי', 'טלפון', 'פריטים', 'סכום', 'מצב', 'עדכון'],
    rows: () => tabs.map((t) => [t.guestName, t.guestPhone, t.items.map((i) => `${i.name}×${i.qty}`).join(' '), tableCell.money(t.total), TAB_LABELS[t.status], tableCell.date(t.updatedAt)]),
  });
  if (table.active) return table.screen;
  const chip = (v: F, label: string, n: number) => <Chip key={v} selected={f === v} onClick={() => setFilter(v)}>{`${label} · ${n}`}</Chip>;
  const tag = (t: Tab) => (t.status === 'claimed' ? <Tag tone="waiting">{gw(t.guestName, 'סימן שהעביר', 'סימנה שהעבירה')}</Tag> : t.status === 'paid' ? <Tag tone="paid">{TAB_LABELS.paid}</Tag>
    : t.status === 'waived' ? <Tag tone="neutral">{TAB_LABELS.waived}</Tag> : undefined);
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} end={<MoreMenu title="חשבונות הדוכן" items={table.items} />} />
      <PageTitle>חשבונות הדוכן</PageTitle>
      <StatRow>
        <StatTile value={tabs.length} label="חשבונות" />
        <StatTile value={money(total(paid))} label="שולמו" />
        <StatTile value={money(total(owing))} label="פתוחים" />
      </StatRow>
      <ChipRow label="סינון חשבונות">
        {chip('open', 'פתוחים', owing.length)}
        {chip('claimed', 'סימנו שהעבירו', claimed.length)}
        {chip('all', 'הכל', tabs.length)}
        {paid.length > 0 && chip('paid', 'שולמו', paid.length)}
        {waived.length > 0 && chip('waived', 'נמחלו', waived.length)}
      </ChipRow>
      {list.length ? (
        <ListCard aria-label="חשבונות">
          {list.map((t) => (
            <Row key={t.id} minHeight={58} leading={<Avatar name={t.guestName} />} title={t.guestName} tags={tag(t)}
              meta={`${itemsWord(tabUnits(t))} · ${relDay(t.updatedAt)}`} value={money(t.total)} {...link(`/manage/events/${e.id}/tabs/${t.id}`)} />
          ))}
        </ListCard>
      ) : <EmptyState variant="card" icon="cart" title="אין חשבונות" text="חשבונות נפתחים בדוכן ביום האירוע." />}
      <span className="events-softline">אישור תשלום ותזכורת נמצאים בתוך החשבון.</span>
    </AppScreen>
  );
}
