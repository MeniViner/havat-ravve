// S6-Trip (I am at the store) and S7-TripEnd (the trip closed).
import { useEffect, useMemo } from 'react';
import { AppScreen, go, useRemove, useToast } from '../../core';
import { BottomBar, Button, Icon, IconButton, ListCard, MoreMenu, PageTitle, ProgressSegments, Row, Tag } from '../../kit';
import type { ScreenProps } from '../../ctx';
import type { ShoppingItem, ShoppingTrip } from '../../../types';
import {
  activeTripOf, addedLive, byListOrder, closeTrip, deleteTrip, first, g, keyOfCat, lastClosedTripOf, listLabel, mergeItems, reopenTrip, setItemBought,
  setItemMissing, tripView, useShopping, useTrip, useMyTrips,
} from '../../data/shopping';

const useFail = () => {
  const toast = useToast();
  return (e: unknown) => toast.show({ text: `לא נשמר. ${(e as Error)?.message || ''}`.trim(), tone: 'error', actions: [{ label: 'הבנתי', onClick: () => {} }] });
};

// ---------- S6 ----------
export function TripScreen({ ctx }: ScreenProps) {
  const trips = useMyTrips(ctx.user.uid);
  const { open, history, loading } = useShopping();
  const trip = activeTripOf(trips.items, ctx.user.uid);
  // nobody opens this screen without a trip: "אני בסופר, מתחילים" starts one
  useEffect(() => { if (!trips.loading && !trip) go('/shopping', true); }, [trips.loading, !!trip]);
  if (!trip) return <AppScreen variant="plain" noNav>{null}</AppScreen>;
  return <TripView trip={trip} items={mergeItems(open, history)} loading={loading} ctx={ctx} />;
}

function TripView({ trip, items, ctx }: { trip: ShoppingTrip; items: ShoppingItem[]; loading: boolean; ctx: ScreenProps['ctx'] }) {
  const fail = useFail();
  const view = useMemo(() => tripView(trip, items), [trip, items]);
  const finish = async () => {
    try { await closeTrip(ctx.actor, trip, view, ctx.team); go(`/shopping/trip/done?id=${trip.id}`, true); } catch (e) { fail(e); }
  };
  const meta = (i: ShoppingItem, state: 'open' | 'missing' | 'bought') => {
    const parts = [i.qty];
    if (state === 'missing') parts.push('לא היה במדף');
    else if (state === 'open') { if (i.urgent) parts.push('דחוף'); if (addedLive(i, trip)) parts.push(first(i.createdBy?.name || '')); }
    return parts.filter(Boolean).join(' · ');
  };
  const row = (i: ShoppingItem, state: 'open' | 'missing' | 'bought') => (
    <TripRow key={i.id} item={i} state={state} meta={meta(i, state)} live={state === 'open' && addedLive(i, trip)}
      onCheck={() => setItemBought(ctx.actor, i, state !== 'bought', trip).catch(fail)}
      onMissing={() => setItemMissing(ctx.actor, i, trip, state !== 'missing').catch(fail)} />
  );
  const left = view.open.length;
  return (
    <AppScreen variant="plain" className="shopping-trip" bar={
      <BottomBar>
        <Button size="bar" grow onClick={finish}>סיימתי לקנות</Button>
        <IconButton variant="secondary" size="lg" icon="plus" label="הוספת פריט" onClick={() => go(`/new?kind=shopping&list=${keyOfCat(trip.list)}`)} />
      </BottomBar>
    }>
      <div className="shopping-trip__top">
        <span>{`${first(trip.by.name)} ב${listLabel(trip.list)} עכשיו`}</span>
        <Button variant="link" onClick={() => go(trip.list === 'super' ? '/shopping' : `/shopping?list=${keyOfCat(trip.list)}`)}>הפסקה</Button>
      </div>
      <div className="shopping-trip__head">
        <h1>{left ? `נשארו ${left}` : 'הכל טופל'}</h1>
        <span>{`${view.bought.length} בעגלה · ${view.missing.length} לא היה`}</span>
      </div>
      {view.total > 0 && <ProgressSegments total={view.total} done={view.handled} label={`${view.handled} מתוך ${view.total} טופלו`} />}
      {view.total > 0 && (
        <ListCard>
          {view.open.map((i) => row(i, 'open'))}
          {view.missing.map((i) => row(i, 'missing'))}
          {view.bought.map((i) => row(i, 'bought'))}
        </ListCard>
      )}
    </AppScreen>
  );
}

/** A trip row: a big 32px box in a 52px target, the name at 19/600, and "אין" (not on the shelf) at the end. */
function TripRow({ item, state, meta, live, onCheck, onMissing }: { item: ShoppingItem; state: 'open' | 'missing' | 'bought'; meta: string; live: boolean; onCheck: () => void; onMissing: () => void }) {
  const checked = state === 'bought';
  return (
    <li className={`shopping-trip-row${state !== 'open' ? ' shopping-trip-row--done' : ''}`}>
      <button type="button" role="checkbox" aria-checked={checked} aria-label={`נקנה: ${item.title}`} className="shopping-trip-row__check" onClick={onCheck}>
        <span className={`shopping-trip-row__box${checked ? ' shopping-trip-row__box--on' : ''}`} aria-hidden="true">{checked && <Icon name="check" size={20} />}</span>
      </button>
      <div className="shopping-trip-row__body">
        <span className="shopping-trip-row__title">{item.title}{live && <Tag className="shopping-live">נוסף עכשיו</Tag>}</span>
        <span className="shopping-trip-row__meta">{meta}</span>
      </div>
      {state !== 'bought' && (
        <button type="button" aria-pressed={state === 'missing'} aria-label={`אין במלאי: ${item.title}`} className="shopping-trip-row__none" onClick={onMissing}>אין</button>
      )}
    </li>
  );
}

// ---------- S7 ----------
export function TripDoneScreen({ ctx, params }: ScreenProps) {
  const trips = useMyTrips(ctx.user.uid);
  const byId = useTrip(params.id || '');
  const trip = (params.id ? byId.item : null) || lastClosedTripOf(trips.items, ctx.user.uid);
  const waiting = params.id ? byId.loading : trips.loading;
  useEffect(() => { if (!waiting && !trip) go('/shopping', true); }, [waiting, !!trip]);
  if (!trip) return <AppScreen variant="plain" noNav>{null}</AppScreen>;
  return <TripDone trip={trip} ctx={ctx} />;
}

function TripDone({ trip, ctx }: { trip: ShoppingTrip; ctx: ScreenProps['ctx'] }) {
  const fail = useFail();
  const { open, history } = useShopping();
  const all = useMemo(() => mergeItems(open, history), [open, history]);
  const { bought, missing } = useMemo(() => {
    const live = tripView(trip, all);
    const pick = (ids: string[], fallback: ShoppingItem[]) => (ids?.length ? ids.map((id) => all.find((i) => i.id === id)).filter((i): i is ShoppingItem => !!i) : fallback);
    return { bought: pick(trip.bought, live.bought).sort(byListOrder), missing: pick(trip.missing, live.missing).sort(byListOrder) };
  }, [trip, all]);
  const back = async () => {
    try { await reopenTrip(ctx.actor, trip); go('/shopping/trip', true); } catch (e) { fail(e); }
  };
  const done = (i: ShoppingItem) => {
    const parts = [i.qty];
    if (addedLive(i, trip)) { const n = i.createdBy?.name || ''; parts.push(`${first(n)} ${g(n, 'הוסיף', 'הוסיפה')} בזמן הקנייה`); }
    return parts.filter(Boolean).join(' · ');
  };
  const mine = trip.by.uid === ctx.user.uid;
  const remove = useRemove();
  return (
    <AppScreen variant="root" bar={
      <BottomBar column>
        <Button size="bar" block onClick={() => go(trip.list === 'super' ? '/shopping' : `/shopping?list=${keyOfCat(trip.list)}`)}>חזרה לקניות</Button>
        {mine && <Button variant="link" onClick={back}>טעות? לחזור לקנייה</Button>}
      </BottomBar>
    }>
      {/* managers delete a trip through ⋯ (rule 6); S7 has no top bar, so ⋯ stands alone at its end */}
      {ctx.manager && (
        <div className="k-topbar shopping-done-top">
          <MoreMenu title="הקנייה" items={[{
            label: 'מחיקה', icon: 'trash', tone: 'danger',
            confirm: {
              title: 'למחוק את הקנייה?', text: 'הקנייה תימחק. מה שנקנה נשאר מסומן כנקנה, ומה שלא היה נשאר ברשימה.', confirmLabel: 'מחיקה',
              onConfirm: () => remove(() => deleteTrip(ctx.actor, trip), { text: 'הקנייה נמחקה', after: () => go('/shopping', true) }),
            },
          }]} />
        </div>
      )}
      <PageTitle className={ctx.manager ? undefined : 'shopping-done-title'}>{`הקנייה ב${listLabel(trip.list)} נסגרה`}</PageTitle>
      <div className="shopping-stats">
        <div className="shopping-stat"><b className="k-num">{bought.length}</b><span>נקנו</span></div>
        <div className="shopping-stat"><b className="k-num">{missing.length}</b><span>לא היה</span></div>
      </div>
      {missing.length > 0 && (
        <ListCard className="shopping-plain" title="לא היה, נשאר ברשימה" count={missing.length} tone="quiet">
          {missing.map((i) => <Row key={i.id} title={i.title} meta={[i.qty, i.note].filter(Boolean).join(' · ')} />)}
        </ListCard>
      )}
      {bought.length > 0 && (
        <ListCard className="shopping-plain" title="נקנה" count={bought.length} tone="quiet">
          {bought.map((i) => <Row key={i.id} leading={<span className="shopping-done-mark" aria-hidden="true"><Icon name="check" size={20} /></span>} title={i.title} meta={done(i)} />)}
        </ListCard>
      )}
    </AppScreen>
  );
}
