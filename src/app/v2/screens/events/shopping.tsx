import { useCallback, useState } from 'react';
import { useOpenShopping } from '../../../store';
import { type FarmEvent, type ShoppingCategory } from '../../../types';
import type { V2Ctx } from '../../ctx';
import { Button, CheckButton, Field, ListCard, RadioList, RadioRow, Row, Sheet, Tag } from '../../kit';
import { go, useToast } from '../../core';
import { addEventShopping, changeEventPurchase, exactOptions, useEventShopping, type EventShoppingItem } from '../../data/eventShopping';
import { useShoppingCategories, listLabel } from '../../data/shopping';
import { useRun } from './shared';

export function EventShoppingLink({ event }: { event: FarmEvent }) {
  const items = useEventShopping(event.id);
  const remaining = items.items.filter(item => !item.bought).length;
  return <ListCard><Row minHeight={58} title="קניות לאירוע" meta={items.loading ? undefined : remaining + ' פריטים לקנייה'} onClick={() => go('/farm/events/' + encodeURIComponent(event.id) + '?section=shopping')} /></ListCard>;
}

export function EventShopping({ctx,event}:{ctx:V2Ctx;event:FarmEvent}) {
  const categories=useShoppingCategories();
  const items=useEventShopping(event.id), regular=useOpenShopping(true), run=useRun(), toast=useToast();
  const [adding,setAdding]=useState(false), [choosing,setChoosing]=useState<EventShoppingItem|null>(null), [pick,setPick]=useState('');
  const [title,setTitle]=useState(''), [qty,setQty]=useState(''), [category,setCategory]=useState<ShoppingCategory>('super');
  const closeAdd=useCallback(()=>setAdding(false),[]), closeChoice=useCallback(()=>setChoosing(null),[]);
  const [busy,setBusy]=useState(false);
  const set = async (item:EventShoppingItem, ordinary?:string) => {
    if (busy) return; setBusy(true);
    const ok=await run(async()=>{ await changeEventPurchase(event.id,ctx.actor,item,ordinary); return true; });
    setBusy(false);
    if (ok) { setChoosing(null); toast.show({text:item.bought ? 'הקנייה חזרה לרשימה' : 'סומן כנקנה',check:true}); }
  };
  const start=(item:EventShoppingItem)=>{
    if (item.bought) { void set(item); return; }
    if (regular.loading || regular.error) {toast.show({text:'מחכים לרשימת הקניות הרגילה כדי לבדוק התאמה'});return;}
    const matches=exactOptions(item,regular.items);
    if (matches.length===0 || matches.length===1 && matches[0].qty===item.qty) { void set(item,matches[0]?.id);return; }
    setPick('');setChoosing(item);
  };
  const options=choosing ? exactOptions(choosing,regular.items) : [];
  return <>
    <ListCard title="נשאר לקנות" count={items.items.filter((i)=>!i.bought).length}>
      {items.items.map((item)=><Row key={item.id} title={item.title} value={item.qty} done={item.bought} tags={<Tag tone={item.category==='online' ? 'neutral' : item.category==='super' ? 'paid' : 'warm'}>{listLabel(item.category)}</Tag>}
        check={<CheckButton checked={item.bought} label={(item.bought ? 'ביטול קנייה ' : 'נקנה ')+item.title} onChange={()=>start(item)}/>}
        swipe={{right:{label:item.bought ? 'להחזיר' : 'נקנה',icon:item.bought ? 'back' : 'check',tone:'done',onAction:()=>start(item)}}} />)}
      <Row title="הוספת קנייה לאירוע" onClick={()=>setAdding(true)}/>
    </ListCard>
    <Sheet open={adding} onClose={closeAdd} title="קנייה לאירוע"><div className="events-sheet">
      <Field label="שם הפריט" value={title} maxLength={100} onChange={(e)=>setTitle(e.target.value)}/>
      <Field label="כמות" value={qty} maxLength={40} onChange={(e)=>setQty(e.target.value)}/>
      <label className="k-field"><span>קטגוריה</span><select className="k-input" value={category} onChange={(e)=>setCategory(e.target.value as ShoppingCategory)}>{categories.map((c)=><option key={c.cat} value={c.cat}>{c.label}</option>)}</select></label>
      <Button size="bar" disabled={!title.trim() || busy} onClick={async()=>{setBusy(true);const ok=await run(async()=>{await addEventShopping(event.id,ctx.actor,title,qty,category);return true;});setBusy(false);if(ok){closeAdd();setTitle('');setQty('');}}}>הוספה</Button>
    </div></Sheet>
    <Sheet open={!!choosing} onClose={closeChoice} title="מה לסמן ברשימת הקניות הרגילה?"><div className="events-sheet">
      <RadioList label="בחירת פריט">{options.map((o)=><RadioRow key={o.id} checked={pick===o.id} onSelect={()=>setPick(o.id)} title={o.title} meta={[o.qty,listLabel(o.category),o.createdBy?.name].filter(Boolean).join(' · ')}/>)}<RadioRow checked={pick==='event-only'} onSelect={()=>setPick('event-only')} title="רק בקניות האירוע"/></RadioList>
      <Button size="bar" disabled={!pick || busy} onClick={()=>choosing && set(choosing,pick==='event-only' ? undefined : pick)}>סימון כנקנה</Button>
      <Button variant="outline" onClick={closeChoice}>ביטול</Button>
    </div></Sheet>
  </>;
}
