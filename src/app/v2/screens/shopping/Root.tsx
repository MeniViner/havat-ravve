// S1-Root, S2-Wish, S3-Empty: the four lists as tabs, the trip button, dashed suggestions, to-buy rows and what was bought today.
import { useMemo, useState } from 'react';
import { AppScreen, RootHead, go, useToast } from '../../core';
import { AddChip, Button, CaptureBar, CheckButton, EmptyState, ListCard, Row, Tabs, Tag, TextLink } from '../../kit';
import { hhmm } from '../../format';
import { todayKey } from '../../../clock';
import { useParam } from '../../../router';
import type { ScreenProps } from '../../ctx';
import type { ShoppingCategory, ShoppingItem } from '../../../types';
import {
  LISTS, addPlaceholder, addShopItem, catOfKey, doneThisMonth, doneToday, doneWord, first, g, listLabel, openOf, openOverline,
  openToBuy, startTrip, suggestions, useShopping, useTrips, SUGGESTED, type ListKey,
} from '../../data/shopping';
import { agoLong, link, useMarkBought } from './common';

const TO_BUY: Record<ShoppingCategory, string> = { super: 'לקנות', building: 'לקנות', online: 'להזמין', giveaway: 'מחפשים, בלי לקנות' };
const DONE: Record<ShoppingCategory, string> = { super: 'נקנה היום', building: 'נקנה היום', online: 'הוזמן היום', giveaway: 'נמצא החודש' };
const EMPTY: Record<ShoppingCategory, { title: string; text: string }> = {
  super: { title: 'אין מה לקנות בסופר', text: 'מה שנגמר, מוסיפים כאן למטה.' },
  building: { title: 'אין מה לקנות לבניין', text: 'חומרים וכלים שצריך, מוסיפים כאן למטה.' },
  online: { title: 'אין מה להזמין באינטרנט', text: 'פריט עם קישור נכנס לכאן.' },
  giveaway: { title: 'אין כרגע משהו שמחפשים', text: 'דברים שנשמח לקבל בלי לקנות.' },
};
/** A short note rides on the row ("מהסוג הגס"); a longer one waits in the item (S1 shows the milk without its note). */
const shortNote = (note: string) => ((note || '').trim().length <= 20 ? (note || '').trim() : '');
/** Who did it, as the row says: "נועה קנתה", "דנה מצאה", "רועי הזמין". */
const doneBy = (i: ShoppingItem) => {
  const n = i.boughtBy?.name || '';
  const verb = i.category === 'giveaway' ? g(n, 'מצא', 'מצאה') : i.category === 'online' ? g(n, 'הזמין', 'הזמינה') : g(n, 'קנה', 'קנתה');
  return `${first(n)} ${verb}`;
};

export function ShoppingRoot({ ctx, params }: ScreenProps) {
  // the shell re-resolves params only when the path changes; a tab only changes ?list=, so read it live
  const list = useParam('list') || params.list;
  const key = (LISTS.some((l) => l.key === list) ? list : 'super') as ListKey;
  const cat = catOfKey(key);
  const today = todayKey();
  const { open, history } = useShopping();
  const trips = useTrips();
  const toast = useToast();
  const { leaving, mark, unmark, fail } = useMarkBought(ctx.actor);
  const [text, setText] = useState('');

  const counts = useMemo(() => Object.fromEntries(LISTS.map((l) => [l.key, openOf(open, l.cat).length])) as Record<ListKey, number>, [open]);
  const rows = useMemo(() => openOf(open, cat), [open, cat]);
  const done = useMemo(() => (cat === 'giveaway' ? doneThisMonth(history, cat, today) : doneToday(history, cat, today)), [history, cat, today]);
  // "קונים בדרך כלל": the old five per list, the מחפשים list included
  const chips = useMemo(() => suggestions(history, open, cat, SUGGESTED), [history, open, cat]);
  const anyHistory = history.some((i) => i.category === cat);
  const doneCard = done.length > 0 || (rows.length > 0 && anyHistory);

  const toAdd = (extra = '') => go(`/new?kind=shopping&list=${key}${extra}`);
  const begin = async () => {
    try { await startTrip(ctx.actor, cat, trips.items, ctx.team); go('/shopping/trip'); } catch (e) { fail(e); }
  };
  const quick = (c: { title: string; qty: string; note: string; link: string }) => {
    addShopItem(ctx.actor, { ...c, category: cat }).catch(fail);
    toast.show({ text: `נוסף ל${listLabel(cat)}: ${c.title}`, duration: 2500 });
  };

  return (
    <AppScreen variant="root" capture={
      <CaptureBar value={text} onChange={setText} placeholder={addPlaceholder(cat)}
        onSubmit={(v) => { setText(''); toAdd(`&text=${encodeURIComponent(v)}`); }}
        onCamera={() => toAdd(`${text.trim() ? `&text=${encodeURIComponent(text.trim())}` : ''}&photo=1`)}
        onMic={() => toAdd('&mic=1')} />
    }>
      <RootHead overline={openOverline(openToBuy(open))} title="קניות" />
      <Tabs label="סוג הרשימה" value={key} onChange={(k) => go(k === 'super' ? '/shopping' : `/shopping?list=${k}`, true)}
        options={LISTS.map((l) => ({ value: l.key, label: l.label, count: counts[l.key] }))} />
      {cat === 'super' && <Button size="tall" icon="cart" iconSize={20} block className="shopping-tripbtn" onClick={begin}>אני בסופר, מתחילים</Button>}
      {chips.length > 0 && (
        <div className="shopping-chips" aria-label="קונים בדרך כלל">
          {chips.map((c) => <AddChip key={c.title} onClick={() => quick(c)}>{c.title}</AddChip>)}
        </div>
      )}
      {rows.length > 0 && (
        <ListCard title={TO_BUY[cat]} count={rows.length} tone="quiet">
          {rows.map((i) => {
            const going = leaving.has(i.id);
            return (
              <Row key={i.id} className={going ? 'shopping-leaving' : undefined} done={going}
                check={<CheckButton checked={going} onChange={() => mark(i)} label={`${doneWord(i.category)}: ${i.title}`} />}
                {...link(`/shopping/${i.id}`)} chevron={false}
                title={i.title} tags={i.urgent ? <Tag tone="urgent">דחוף</Tag> : undefined}
                meta={[first(i.createdBy?.name || ''), agoLong(i.createdAt), shortNote(i.note)].filter(Boolean).join(' · ')}
                value={i.qty || undefined} />
            );
          })}
        </ListCard>
      )}
      {doneCard && (
        <ListCard title={DONE[cat]} count={done.length} tone="quiet" end={<TextLink {...link('/shopping/history')}>היסטוריה</TextLink>}>
          {done.map((i) => (
            <Row key={i.id} done
              check={<CheckButton checked onChange={() => unmark(i)} label={`להחזיר לרשימה: ${i.title}`} />}
              {...link(`/shopping/${i.id}`)} chevron={false}
              title={i.title}
              meta={i.category === 'giveaway' ? [doneBy(i), i.foundWhere].filter(Boolean).join(' · ') : `${doneBy(i)} · ${hhmm(i.boughtAt!)}`}
              value={i.qty || undefined} />
          ))}
        </ListCard>
      )}
      {rows.length === 0 && done.length === 0 && <EmptyState icon="cart" title={EMPTY[cat].title} text={EMPTY[cat].text} />}
      {/* the history is always one tap away (the old header link), also when nothing was bought today */}
      {!doneCard && <div className="shopping-histlink"><TextLink {...link('/shopping/history')}>היסטוריה</TextLink></div>}
    </AppScreen>
  );
}
