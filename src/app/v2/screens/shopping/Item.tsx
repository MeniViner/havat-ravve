// S4-Item: one item. Quantity stepper, list, who added it, note, photo / link, what happened so far. "נקנה" in the bottom bar;
// edit and delete in ⋯ (rules 5 and 6: one control in the top bar, delete only through ⋯ and the confirmation).
import { useEffect, useMemo, useRef } from 'react';
import { AppScreen, go, useExternal, useToast } from '../../core';
import { BottomBar, Button, DetailList, DetailRow, EmptyState, History, PageTitle, SectionTitle, Stepper, TopBar } from '../../kit';
import { dayTime, ddmm } from '../../format';
import { back } from '../../../router';
import { compressPhoto } from '../../../store';
import { storePhoto } from '../../../upload';
import type { ScreenProps } from '../../ctx';
import type { ShoppingItem } from '../../../types';
import {
  doneWord, g, keyOfCat, listLabel, logQtyChange, parseQty, qtyText, setItemBought, setItemPhoto, setItemQty,
  stepQty, timeline, useItemActivity, useShopItem, useShopping,
} from '../../data/shopping';
import { agoLong, UrgencyTag } from './common';

export function ShopItemScreen({ ctx, params }: ScreenProps) {
  const { item, loading } = useShopItem(params.id);
  const backTo = () => back(item ? (keyOfCat(item.category) === 'super' ? '/shopping' : `/shopping?list=${keyOfCat(item.category)}`) : '/shopping');
  if (!item) {
    return (
      <AppScreen variant="detail">
        <TopBar back={{ label: 'קניות', onClick: backTo }} />
        {!loading && <EmptyState icon="cart" title="הפריט לא נמצא" text="אולי כבר נמחק. אפשר לחפש אותו בהיסטוריה." />}
      </AppScreen>
    );
  }
  return <ItemView key={item.id} item={item} ctx={ctx} onBack={backTo} />;
}

function ItemView({ item, ctx, onBack }: { item: ShoppingItem; ctx: ScreenProps['ctx']; onBack: () => void }) {
  const toast = useToast(); const open = useExternal();
  const acts = useItemActivity(item.id);
  const { history } = useShopping();
  const photoInput = useRef<HTMLInputElement>(null);
  const qtyLog = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(qtyLog.current), []);
  const fail = (e: unknown) => toast.show({ text: `לא נשמר. ${(e as Error)?.message || ''}`.trim(), tone: 'error', actions: [{ label: 'הבנתי', onClick: () => {} }] });
  const lines = useMemo(() => timeline(item, acts.items, history, { dayTime, ddmm }), [item, acts.items, history]);
  const by = item.createdBy?.name || '';
  const person = ctx.peopleByUid.get(item.createdBy?.uid) as { gender?: string } | undefined;

  const step = (delta: number) => {
    const qty = stepQty(item.qty, delta);
    setItemQty(item, qty).catch(fail);
    window.clearTimeout(qtyLog.current);
    qtyLog.current = window.setTimeout(() => logQtyChange(ctx.actor, item, qty), 1500);
  };
  const mark = () => {
    const bought = !item.bought;
    setItemBought(ctx.actor, item, bought, null).catch(fail);
    if (bought) toast.show({ text: `${doneWord(item.category)}: ${item.title}`, actions: [{ label: 'ביטול', onClick: () => { setItemBought(ctx.actor, { ...item, bought: true }, false, null).catch(fail); } }] });
    onBack();
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try { await setItemPhoto(ctx.actor, item, await storePhoto(await compressPhoto(file), 'shopping')); } catch (e) { fail(e); }
  };

  return (
    <AppScreen variant="detail" bar={
      <BottomBar>
        <Button size="bar" grow icon={item.bought ? undefined : 'check'} onClick={mark}>{item.bought ? 'להחזיר לרשימה' : doneWord(item.category)}</Button>
      </BottomBar>
    }>
      <TopBar back={{ label: 'קניות', onClick: onBack }}
        end={<Button variant="outline" icon="edit" iconSize={16} onClick={() => go(`/shopping/${item.id}/edit`)}>עריכה</Button>} />
      <PageTitle size="detail" className="shopping-title">{item.title}<UrgencyTag item={item} /></PageTitle>
      <DetailList>
        <DetailRow term="כמות" action={<Stepper value={parseQty(item.qty).n} min={1} onChange={(n) => step(n - parseQty(item.qty).n)} />}>{qtyText(item.qty)}</DetailRow>
        <DetailRow term="רשימה">{listLabel(item.category)}</DetailRow>
        <DetailRow term={g(by, 'הוסיף', 'הוסיפה', person)}>{by}{item.createdAt ? ` · ${agoLong(item.createdAt)}` : ''}</DetailRow>
        {item.note && <DetailRow term="הערה" plain>{item.note}</DetailRow>}
        {item.foundWhere && <DetailRow term="איפה">{item.foundWhere}</DetailRow>}
      </DetailList>
      {item.photo && <img className="shopping-photo" src={item.photo} alt={`תמונה: ${item.title}`} />}
      <div className="shopping-attach">
        <Button variant="dashed" size="tall" grow icon="camera" onClick={() => photoInput.current?.click()}>תמונה</Button>
        <Button variant="dashed" size="tall" grow icon="link" onClick={() => (item.link ? open(item.link) : go(`/shopping/${item.id}/edit`))}>קישור</Button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {lines.length > 0 && (
        <section className="shopping-history">
          <SectionTitle>מה קרה עד עכשיו</SectionTitle>
          <History items={lines} />
        </section>
      )}
    </AppScreen>
  );
}
