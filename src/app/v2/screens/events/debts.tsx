// V5 debt reminders after the event: one WhatsApp message per person from the saved wording; each send is stamped.
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go, useExternal, waUrl } from '../../core';
import { TopBar, PageTitle, Card, TextLink, Tag, Button, EmptyState } from '../../kit';
import { useEvent, useEventTickets, useEventTabs } from '../../../data';
import { useClockVersion } from '../../../clock';
import { money, relDay, daysFromToday } from '../../format';
import { stampReminder } from '../../data/events';
import { debtsOf, debtTotals, fillDebtTemplate, type EventDebt } from './logic';
import { Loading, Missing, backTo, useRun } from './shared';
import type { FarmEvent } from '../../../types';

export function DebtsScreen({ ctx, params }: ScreenProps) {
  useClockVersion();
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <Debts ctx={ctx} e={e} />;
}

function Debts({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const open = useExternal(); const run = useRun();
  const tickets = useEventTickets(e.id, ctx.manager);
  const tabs = useEventTabs(e.id, ctx.manager);
  const debts = debtsOf(e.id, tickets.items, tabs.items);
  const T = debtTotals(debts);
  const template = ctx.settings.templates.debtReminder;
  const textFor = (d: EventDebt) => fillDebtTemplate(template, { name: d.name, event: e.title, amount: d.amount, bit: ctx.settings.payment.bit });
  const send = async (d: EventDebt) => {
    open(waUrl(d.phone, textFor(d)));
    await run(() => stampReminder(d.kind, d.ids));
  };
  const source = (d: EventDebt) => go(d.kind === 'tab' ? `/manage/events/${e.id}/tabs/${d.refId}` : `/manage/events/${e.id}?tab=guests`);
  const loading = tickets.loading || tabs.loading;
  return (
    <AppScreen variant="detail">
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} />
      <PageTitle>תזכורות חוב · {T.count}</PageTitle>
      {debts.length > 0 && (
        <Card pad="md" as="section" className="events-template" aria-label="הנוסח שיישלח">
          <div className="events-template__head">
            <h2 className="k-sectiontitle">הנוסח שיישלח</h2>
            <TextLink onClick={() => go('/manage/settings/messages')}>עריכה</TextLink>
          </div>
          <p className="events-template__text">{textFor(debts[0])}</p>
        </Card>
      )}
      {debts.length > 0 ? (
        <section className="k-card k-card--list" aria-label="חובות">
          <ul className="k-list k-list--flush">
            {debts.map((d) => {
              const sent = d.reminderSentAt;
              return (
                <li key={d.id} className="events-debtrow">
                  <button type="button" className="events-debtrow__hit" onClick={() => source(d)}>
                    <span className="k-row__body">
                      <span className="k-row__title">{d.name}{sent && <Tag>{daysFromToday(sent) === 0 ? 'נשלחה היום' : `נשלחה ${relDay(sent)}`}</Tag>}</span>
                      <span className="k-row__meta">{d.what}</span>
                    </span>
                    <b className="events-value">{money(d.amount)}</b>
                  </button>
                  {sent
                    ? <Button variant="outline" disabled={!d.phone} onClick={() => send(d)}>שוב</Button>
                    : <Button icon="message" iconSize={16} disabled={!d.phone} onClick={() => send(d)}>שליחה</Button>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : !loading && <EmptyState variant="card" icon="check" title="אין חובות פתוחים" />}
      {debts.length > 0 && (
        <div className="events-totalline"><span>סך הכל פתוח</span><b>{money(T.amount)}</b></div>
      )}
    </AppScreen>
  );
}
