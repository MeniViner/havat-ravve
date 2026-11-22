// The stall accounts of one event, for managers (the old "חשבונות וחובות"): totals sold / paid / open, paid and waived as separate
// filters, export, and the quick actions per row (approve a "paid" mark, remind, mark paid). The crew's list stays in eventday/stall.tsx.
import { useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, useExternal, useToast, waUrl } from '../../core';
import { TopBar, PageTitle, StatRow, StatTile, ChipRow, Chip, ListCard, Row, Avatar, Button, IconButton, EmptyState } from '../../kit';
import { useEvent, useEventTabs, useNotifications, setTabStatus, hasTabPurchases } from '../../../data';
import { money, ddmm, firstName, relDay } from '../../format';
import { approveTab, stampReminder } from '../../data/events';
import { tabUnits, itemsWord, fillDebtTemplate } from './logic';
import { Loading, Missing, backTo, link, useRun } from './shared';
import { ExcelButton } from '../manage/shared';
import { TAB_LABELS, type FarmEvent, type Tab } from '../../../types';

export function TabsScreen({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Tabs ctx={ctx} e={e} />;
}

type F = 'all' | 'open' | 'claimed' | 'paid' | 'waived';
const total = (rows: Tab[]) => rows.reduce((s, t) => s + t.total, 0);

function Tabs({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const toast = useToast(); const run = useRun(); const ext = useExternal();
  const tabs = useEventTabs(e.id, ctx.manager).items.filter((t) => hasTabPurchases(t) || t.status !== 'open');
  const notes = useNotifications(ctx.manager).items;
  const open = tabs.filter((t) => t.status === 'open'), claimed = tabs.filter((t) => t.status === 'claimed');
  const paid = tabs.filter((t) => t.status === 'paid'), waived = tabs.filter((t) => t.status === 'waived');
  const owing = [...open, ...claimed];
  const [filter, setFilter] = useState<F>(owing.length ? 'open' : 'all');
  const list = tabs.filter((t) => filter === 'all' || t.status === filter)
    .sort((a, b) => Number(a.status !== 'open' && a.status !== 'claimed') - Number(b.status !== 'open' && b.status !== 'claimed') || b.updatedAt.localeCompare(a.updatedAt));
  const undo = (t: Tab) => [{ label: 'ביטול', onClick: () => { setTabStatus(ctx.actor, t, t.status); } }];
  const approve = async (t: Tab) => {
    const ok = await run(async () => { await approveTab(ctx.actor, t, notes); return true; });
    if (ok) toast.show({ text: `${t.guestName} · ${TAB_LABELS.paid}`, check: true, actions: undo(t) });
  };
  const remind = async (t: Tab) => {
    ext(waUrl(t.guestPhone, fillDebtTemplate(ctx.settings.templates.debtReminder, { name: t.guestName, event: e.title, amount: t.total, bit: ctx.settings.payment.bit })));
    await run(() => stampReminder('tab', [t.id]));
  };
  const chip = (f: F, label: string, n: number) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{n ? `${label} · ${n}` : label}</Chip>;
  const tag = (t: Tab) => (t.status === 'claimed' ? 'סימן "העברתי"' : t.status === 'open' ? 'לא שולם' : TAB_LABELS[t.status]);
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} end={
        <ExcelButton filename={`${e.title} - חשבונות.csv`} headers={['מי', 'טלפון', 'פריטים', 'סכום', 'מצב', 'עדכון']}
          rows={() => tabs.map((t) => [t.guestName, t.guestPhone, t.items.map((i) => `${i.name}×${i.qty}`).join(' '), t.total, TAB_LABELS[t.status], ddmm(t.updatedAt)])} />
      } />
      <PageTitle>חשבונות הדוכן</PageTitle>
      <StatRow grid>
        <StatTile value={tabs.length} label="חשבונות" />
        <StatTile small value={money(total(tabs.filter((t) => t.status !== 'waived')))} label="נמכרו" />
        <StatTile small value={money(total(paid))} label="שולמו" />
        <StatTile small value={money(total(owing))} label={`פתוחים · ${owing.length}`} />
      </StatRow>
      <ChipRow label="סינון חשבונות">
        {chip('all', 'הכל', tabs.length)}
        {chip('open', 'פתוחים', open.length)}
        {chip('claimed', 'סימנו "העברתי"', claimed.length)}
        {chip('paid', 'שולמו', paid.length)}
        {chip('waived', 'נמחלו', waived.length)}
      </ChipRow>
      {list.length ? (
        <ListCard aria-label="חשבונות">
          {list.map((t) => (
            <Row key={t.id} minHeight={58} leading={<Avatar name={t.guestName} />} title={t.guestName}
              meta={`${tag(t)} · ${itemsWord(tabUnits(t))} · ${relDay(t.updatedAt)}`} value={money(t.total)} {...link(`/manage/events/${e.id}/tabs/${t.id}`)}
              actions={t.status === 'claimed' ? <Button onClick={() => approve(t)}>אישור</Button>
                : t.status === 'open' ? <>
                  {t.guestPhone && <IconButton variant="quiet" icon="message" label={`תזכורת ל${firstName(t.guestName)}`} onClick={() => remind(t)} />}
                  <Button variant="outline" onClick={() => approve(t)}>שולם</Button>
                </> : undefined} />
          ))}
        </ListCard>
      ) : <EmptyState variant="card" icon="cart" title="אין חשבונות" text="חשבונות נפתחים בדוכן ביום האירוע." />}
    </AppScreen>
  );
}
