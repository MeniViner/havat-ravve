// S1-Root / Q22-ShopSuggest, S2-Wish, S3-Empty: the four lists as tabs, the trip button, dashed suggestions in one scrolling
// row, to-buy rows, and what was bought today folded into one row that opens the history (where it can be put back).
import { useMemo, useState } from 'react';
import { AppScreen, RootHead, go, useToast } from '../../core';
import { AddChip, Button, CaptureBar, CheckButton, EmptyState, ListCard, Row, Tabs, Sheet } from '../../kit';
import { todayKey } from '../../../clock';
import { useParam } from '../../../router';
import type { ScreenProps } from '../../ctx';
import type { ShoppingCategory, ShoppingItem } from '../../../types';
import {
  activeTripOf, tripRecipients, useShoppingCategories, addPlaceholder, addShopItem, catOfKey, deleteShopItem, doneThisMonth, doneToday, doneWord, first, listLabel, openOf, openOverline,
  openToBuy, startTrip, suggestions, useShopping, useMyTrips, SUGGESTED, type ListKey,
} from '../../data/shopping';
import { TripRecipients } from './TripRecipients';
import { agoLong, link, useMarkBought, UrgencyTag } from './common';
import { ddmm, hhmm } from '../../format';

const TO_BUY: Record<ShoppingCategory, string> = { super: 'לקנות', building: 'לקנות', online: 'להזמין', giveaway: 'מחפשים, בלי לקנות' };
const DONE: Record<ShoppingCategory, string> = { super: 'נקנה היום', building: 'נקנה היום', online: 'הוזמן היום', giveaway: 'נמצא החודש' };
const EMPTY: Record<ShoppingCategory, { title: string; text: string }> = {
  super: { title: 'אין מה לקנות בסופר', text: 'מה שנגמר, מוסיפים כאן למטה.' },
  building: { title: 'אין מה לקנות לבניין', text: 'חומרים וכלים שצריך, מוסיפים כאן למטה.' },
  online: { title: 'אין מה להזמין באינטרנט', text: 'פריט עם קישור נכנס לכאן.' },
  giveaway: { title: 'אין כרגע משהו שמחפשים', text: 'דברים שנשמח לקבל בלי לקנות.' },
};
export function ShoppingRoot({ ctx, params }: ScreenProps) {
  // the shell re-resolves params only when the path changes; a tab only changes ?list=, so read it live
  const list = useParam('list') || params.list;
  const lists = useShoppingCategories();
  const key = (lists.some((l) => l.key === list) ? list : 'super') as ListKey;
  const cat = catOfKey(key);
  const today = todayKey();
  const { open, history } = useShopping();
  const trips = useMyTrips(ctx.user.uid);
  const toast = useToast();
  const { leaving, mark, fail } = useMarkBought(ctx.actor);
  const [starting, setStarting] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<ShoppingItem | null>(null);
  const [selection, setSelection] = useState<string[]>();
  const ids = tripRecipients(ctx.team, selection);
  const running = activeTripOf(trips.items, ctx.user.uid);
  const rosterReady = ctx.team.some(p => p.uid === ctx.user.uid && p.status === 'active');

  const counts = useMemo(() => Object.fromEntries(lists.map((l) => [l.key, openOf(open, l.cat).length])) as Record<ListKey, number>, [open, lists]);
  const rows = useMemo(() => openOf(open, cat), [open, cat]);
  const done = useMemo(() => (cat === 'giveaway' ? doneThisMonth(history, cat, today) : doneToday(history, cat, today)), [history, cat, today]);
  // "קונים בדרך כלל": the old five per list, the מחפשים list included
  const chips = useMemo(() => suggestions(history, open, cat, SUGGESTED), [history, open, cat]);

  const toAdd = (extra = '') => go(`/new?kind=shopping&list=${key}${extra}`);
  const begin = async () => {
    if (starting || trips.loading || trips.error || (!running && !rosterReady)) return;
    setStarting(true);
    try { await startTrip(ctx.actor, cat, trips.items, ctx.team, ids); go('/shopping/trip'); } catch (e) { fail(e); } finally { setStarting(false); }
  };
  // swiping a row left and pressing "מחיקה": gone at once, with six seconds to take it back (the delete waits for them)
  const remove = (i: ShoppingItem) => {
    const undo = deleteShopItem(ctx.actor, i);
    toast.show({ text: `נמחק: ${i.title}`, check: false, duration: 6000, actions: [{ label: 'ביטול', onClick: undo }] });
  };
  const quick = (c: { title: string; qty: string; note: string; link: string }) => {
    addShopItem(ctx.actor, { ...c, category: cat }).catch(fail);
    toast.show({ text: `נוסף ל${listLabel(cat)}: ${c.title}`, duration: 2500 });
  };
  const depart = <Button size="bar" icon="cart" block onClick={begin} disabled={starting || trips.loading || !!trips.error || (!running && !rosterReady)}>{running ? 'המשך קנייה' : 'יצאתי לקניות'}</Button>;

  return (
    <AppScreen variant="root" capture={
      <CaptureBar value={text} onChange={setText} placeholder={addPlaceholder(cat)}
        onSubmit={(v) => { setText(''); toAdd(`&text=${encodeURIComponent(v)}`); }}
        onCamera={() => toAdd(`${text.trim() ? `&text=${encodeURIComponent(text.trim())}` : ''}&photo=1`)}
        onMic={() => toAdd('&mic=1')} />
    }>
      <RootHead overline={openOverline(openToBuy(open))} title="קניות" />
      <Tabs className="shopping-categories" label="סוג הרשימה" value={key} onChange={(k) => go(k === 'super' ? '/shopping' : `/shopping?list=${k}`, true)}
        options={lists.map((l) => ({ value: l.key, label: l.label, count: counts[l.key] }))} />
      {cat === 'super' && (running ? depart : <TripRecipients team={ctx.team} ids={ids} setIds={setSelection}>{depart}</TripRecipients>)}
      {chips.length > 0 && (
        <div className="k-chips shopping-chips" role="group" aria-label="קונים בדרך כלל">
          {chips.map((c) => <AddChip key={c.title} onClick={() => quick(c)}>{c.title}</AddChip>)}
        </div>
      )}
      {rows.length > 0 && (
        <ListCard title={TO_BUY[cat] || 'לקנות'} count={rows.length}>
          {rows.map((i) => {
            const going = leaving.has(i.id);
            const due = i.urgent && i.urgentDueAt && Number.isFinite(Date.parse(i.urgentDueAt)) ? i.urgentDueAt : '';
            return (
              <Row key={i.id} className={`shopping-list-row${going ? ' shopping-leaving' : ''}`} minHeight={48} done={going}
                check={<><CheckButton checked={going} onChange={() => mark(i)} label={`${doneWord(i.category)}: ${i.title}`} />
                  {i.photo && <button type="button" className="shopping-thumbnail" aria-label={`הגדלת תמונה של ${i.title}`} onClick={() => setPhoto(i)}><img loading="lazy" alt="" src={i.photo} /></button>}</>}
                {...link(`/shopping/${i.id}`)} chevron={false}
                swipe={going ? undefined : {
                  right: { label: doneWord(i.category), icon: 'check', tone: 'done', onAction: () => mark(i) },
                  left: { label: 'מחיקה', icon: 'close', tone: 'danger', onAction: () => remove(i) },
                }}>
                <span className="shopping-line-head"><span className="k-row__title">{i.title}</span>{i.urgent && <UrgencyTag item={i} compact />}</span>
                {i.note?.trim() && <span className="shopping-note">{i.note}</span>}
                <span className="shopping-line-meta">
                  {i.qty && <strong>{i.qty}</strong>}
                  <span>{[first(i.createdBy?.name || ''), agoLong(i.createdAt)].filter(Boolean).join(' · ')}</span>
                  {due && <time dateTime={due} aria-label={`מועד יעד ${ddmm(due)} ${hhmm(due)}`}><bdi>{ddmm(due)} {hhmm(due)}</bdi></time>}
                </span>
              </Row>
            );
          })}
        </ListCard>
      )}
      {rows.length === 0 && done.length === 0 && <EmptyState icon="cart" title={EMPTY[cat]?.title || `אין פריטים ב${listLabel(cat)}`} text={EMPTY[cat]?.text || 'אפשר להוסיף פריט למטה.'} />}
      {/* Q22: what was bought today is one row that opens the history; there it can be put back (swipe right). The row stays
          when nothing was bought today, so the history is always one tap away. */}
      <ListCard>
        <Row {...link('/shopping/history')} minHeight={52}
          title={done.length ? `${DONE[cat] || 'נקנה היום'} · ${done.length}` : 'מה נקנה'}
          meta={[done.map((i) => i.title).join(', '), 'להיסטוריה'].filter(Boolean).join(' · ')} />
      </ListCard>
      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={photo?.title || 'תמונה'}>
        {photo && <img className="shopping-photo" src={photo.photo} alt={photo.title} />}
      </Sheet>
    </AppScreen>
  );
}
