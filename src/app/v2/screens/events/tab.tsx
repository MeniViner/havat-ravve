// N12 one stall tab: what is owed, what was recorded and by whom; approve the payment or let it go.
import { useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useRemove, useToast, useExternal, waUrl, telUrl } from '../../core';
import { TopBar, Hero, ListCard, SectionHeader, Tag, Button, BottomBar, Sheet, Field, ConfirmSheet } from '../../kit';
import { useEvent, useTab, useNotifications, setTabStatus, removeTabItem } from '../../../data';
import { useClockVersion } from '../../../clock';
import { money, ddmm, ago } from '../../format';
import { approveTab, stampReminder, tabClaimedAt, deleteTab } from '../../data/events';
import { tabLines, tabUnits, itemsWord, recordedLine, fillDebtTemplate } from './logic';
import { Loading, Missing, TitleBlock, ButtonRow, backTo, useRun } from './shared';
import { TAB_LABELS, type Tab, type TabStatus } from '../../../types';

export function TabScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const parent = `/manage/events/${params.id}/tabs`;
  const { item: t, loading } = useTab(params.tid, ctx.manager);
  if (loading && !t) return <Loading backLabel="חשבונות" parent={parent} />;
  if (!t) return <Missing backLabel="חשבונות" parent={parent} title="החשבון לא נמצא" />;
  return <TabBody ctx={ctx} t={t} parent={parent} />;
}

function TabBody({ ctx, t, parent }: { ctx: V2Ctx; t: Tab; parent: string }) {
  const toast = useToast(); const open = useExternal(); const run = useRun();
  const { item: e } = useEvent(t.eventId, ctx.manager);
  const notes = useNotifications(ctx.manager);
  const [waiving, setWaiving] = useState(false); const [reason, setReason] = useState('');
  const [line, setLine] = useState<number | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();
  const lines = tabLines(t.items);
  const owing = t.status === 'open' || t.status === 'claimed';
  const undo = (prev: TabStatus) => [{ label: 'ביטול', onClick: () => { setTabStatus(ctx.actor, t, prev); } }];

  const approve = async () => {
    const ok = await run(async () => { await approveTab(ctx.actor, t, notes.items); return true; });
    if (ok) toast.show({ text: `${t.guestName} · ${TAB_LABELS.paid}`, check: true, actions: undo(t.status) });
  };
  const waive = async () => {
    const ok = await run(async () => { await setTabStatus(ctx.actor, t, 'waived', reason.trim()); return true; });
    if (ok) { setWaiving(false); setReason(''); toast.show({ text: `${t.guestName} · ${TAB_LABELS.waived}`, check: true, actions: undo(t.status) }); }
  };
  const reopen = () => run(() => setTabStatus(ctx.actor, t, 'open', 'הוחזר לפתוח'));
  const remind = async () => {
    const text = fillDebtTemplate(ctx.settings.templates.debtReminder, { name: t.guestName, event: t.eventTitle, amount: t.total, bit: ctx.settings.payment.bit });
    open(waUrl(t.guestPhone, text));
    await run(() => stampReminder('tab', [t.id]));
  };
  const removeLine = async (index: number) => {
    const item = t.items[index]; if (!item) return;
    const ok = await run(async () => { await removeTabItem(ctx.actor, t, index, reason.trim()); return true; });
    if (ok) { setLine(null); setReason(''); toast.show({ text: `${item.name} הוסר מהחשבון`, check: true }); }
  };

  const statusTag = t.status === 'claimed' ? <Tag tone="waiting">סימן שהעביר {ago(tabClaimedAt(t))}</Tag>
    : t.status === 'paid' ? <Tag tone="onhero">{TAB_LABELS.paid}</Tag>
    : t.status === 'waived' ? <Tag tone="onhero">{TAB_LABELS.waived}</Tag> : null;
  const bar = owing ? (
    <BottomBar>
      <Button size="bar" grow icon="check" onClick={approve}>אישור תשלום</Button>
      <Button size="bar" variant="secondary" onClick={() => setWaiving(true)}>מחילה</Button>
    </BottomBar>
  ) : (
    <BottomBar><Button size="bar" variant="secondary" grow onClick={reopen}>להחזיר לפתוח</Button></BottomBar>
  );
  const chosen = line !== null ? t.items[line] : null;
  return (
    <AppScreen variant="detail" bar={bar}>
      <TopBar back={backTo('חשבונות', parent)} end={<Button variant="quiet" onClick={() => setAskDelete(true)}>מחיקה</Button>} />
      <TitleBlock over={`${t.eventTitle} · ${ddmm(e?.start || t.createdAt)}`} title={t.guestName} />
      <Hero className="events-tabhero">
        <span className="events-tabhero__amount">
          <span className="events-tabhero__label">{owing ? 'לתשלום' : TAB_LABELS[t.status]}</span>
          <b className="events-tabhero__num">{money(t.total)}</b>
        </span>
        {statusTag}
      </Hero>
      <ListCard header={<SectionHeader title={`מה נרשם · ${itemsWord(tabUnits(t))}`} />}>
        {lines.map((l) => (
          <li key={l.key} className="events-itemrow">
            {owing ? (
              <button type="button" className="events-itemrow__hit" onClick={() => setLine(l.index)}>
                <span className="events-itemrow__name">{l.name}{l.qty > 1 ? ` ×${l.qty}` : ''}</span>
                <b className="events-value">{money(l.amount)}</b>
              </button>
            ) : (
              <>
                <span className="events-itemrow__name">{l.name}{l.qty > 1 ? ` ×${l.qty}` : ''}</span>
                <b className="events-value">{money(l.amount)}</b>
              </>
            )}
          </li>
        ))}
        {t.items.length > 0 && <li className="events-itemfoot">{recordedLine(t.items)}</li>}
        {!t.items.length && <li className="events-itemfoot">עוד לא נרשם כלום</li>}
      </ListCard>
      {t.guestPhone && (
        <ButtonRow>
          {owing && <Button variant="outline" size="tall" icon="message" onClick={remind}>תזכורת בוואטסאפ</Button>}
          <Button variant="outline" size="tall" icon="phone" onClick={() => open(telUrl(t.guestPhone))}>התקשרות</Button>
        </ButtonRow>
      )}
      <Sheet open={waiving} onClose={() => setWaiving(false)} title={`מחילה · ${money(t.total)}`}>
        <div className="events-sheet">
          <Field label="למה? (תירשם בהיסטוריה)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          <Button size="bar" block variant="secondary" onClick={waive}>מחילה</Button>
        </div>
      </Sheet>
      <Sheet open={!!chosen} onClose={() => setLine(null)} title={chosen ? chosen.name : ''} aside={chosen ? money(chosen.price * chosen.qty) : undefined}>
        <div className="events-sheet">
          <Field label="למה להסיר? (תירשם בהיסטוריה)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          <Button size="bar" block variant="danger" onClick={() => line !== null && removeLine(line)}>הסרה מהחשבון</Button>
        </div>
      </Sheet>
      <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את החשבון?"
        text={`החשבון של ${t.guestName} על ${money(t.total)} יימחק לגמרי, גם מהדוחות. כדי לוותר על התשלום ולהשאיר תיעוד, יש מחילה.`} confirmLabel="מחיקה"
        onConfirm={() => remove(() => deleteTab(ctx.actor, t, notes.items), { text: 'החשבון נמחק', after: () => go(parent, true) })} />
    </AppScreen>
  );
}
