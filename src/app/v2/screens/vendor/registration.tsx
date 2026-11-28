import { eventMillis } from '../events/logic';
import { useState } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { Button, CheckButton, Field, ListCard, PageTitle, Row, Tag, TopBar } from '../../kit';
import { useUpcomingEvents } from '../../../data';
import { useParam } from '../../../router';
import { nowIso } from '../../../clock';
import type { FarmEvent, Profile } from '../../../types';
import { useMyApplication, useParticipation, submitStall, validateApplication, supplierPayload, type ApplicationData, type Need, type Participation, type StallApplication } from '../../data/vendorApplications';
import { Qr } from '../guest/parts';
import { useSignIn, type GuestCtx } from '../guest/data';
import { useRun } from '../events/shared';

const route='/vendor-registration';
export function PublicVendorRegistration({ctx}:{ctx:GuestCtx;eventId:string}) {
  const eventId=useParam('event');
  const sign=useSignIn(), events=useUpcomingEvents(), base=useMyApplication(ctx.profile?.uid || '');
  const p=ctx.profile, e=events.items.find((ev)=>ev.id===eventId);
  const upcoming=events.items.filter((ev)=>ev.published && ev.stall!==false && !('closed' in ev && ev.closed) && eventMillis(ev.end)>Date.parse(nowIso()));
  return <AppScreen variant="detail"><TopBar back={{label:'החווה',onClick:()=>go('/')}} /><PageTitle>{eventId ? 'בקשת השתתפות באירוע' : 'הרשמת בעלי דוכנים'}</PageTitle>
    {!p ? <><p>עם הכניסה אפשר לרשום את הדוכן ולהגיש בקשות להשתתפות באירועים.</p><Button disabled={sign.busy} onClick={()=>void sign.go(route+(eventId?'?event='+encodeURIComponent(eventId):''))}>כניסה עם Google</Button></>
      : !base.loading && (!eventId ? <>
        <ApplicationForm key={p.uid+':base'} user={p} base={base.item}/>
        <ListCard title="בקשת השתתפות באירוע">{upcoming.map((ev)=><Row key={ev.id} title={ev.title} onClick={()=>go(route+'?event='+encodeURIComponent(ev.id))}/>)}</ListCard>
      </> : e ? <EventApplication key={p.uid+':'+e.id} event={e} user={p} base={base.item} events={events.items}/> : <p>{events.loading?'טוען...':'האירוע אינו זמין להרשמה'}</p>)}
  </AppScreen>;
}
function EventApplication({event,user,base,events}:{event:FarmEvent;user:Profile;base:StallApplication|null;events:FarmEvent[]}) {
  const mine=useParticipation(event.id,user.uid);
  const previousEvent = events.filter((e)=>e.start<event.start && base?.appliedEventIds?.includes(e.id)).sort((a,b)=>b.start.localeCompare(a.start))[0];
  const previous=useParticipation(previousEvent?.id || '',user.uid);
  const [qr,setQr]=useState(false);
  if (mine.loading || previous.loading) return <p>טוען את פרטי הדוכן…</p>;
  if (mine.item) return <><h2>{event.title}</h2><Tag tone={mine.item.status==='approved'?'paid':'waiting'}>{mine.item.status==='approved'?'אושרו':'הבקשה ממתינה לאישור'}</Tag><p>{mine.item.people} אנשים · {mine.item.vehicles} רכבים</p>
    {mine.item.status==='approved' && <><p>אפשר להיכנס גם ללא קוד. הקוד משותף לדוכן ולכל האנשים שמגיעים איתו.</p><Button variant="outline" onClick={()=>setQr(!qr)}>הקוד המשותף של הדוכן</Button>{qr && <Qr text={supplierPayload(mine.item)} size={180}/>}</>}</>;
  return <><h2>{event.title}</h2>{previous.item && <p>מילאנו את פרטי ההשתתפות מ־{previousEvent?.title}. אפשר לשנות אותם לאירוע הזה.</p>}<ApplicationForm user={user} base={base} previous={previous.item} event={event}/></>;
}
function ApplicationForm({user,base,previous,event}:{user:Profile;base:StallApplication|null;previous?:Participation|null;event?:FarmEvent}) {
  const initial=previous || base;
  const [name,setName]=useState(initial?.name || user.displayName),[phone,setPhone]=useState(initial?.phone || user.phone);
  const [products,setProducts]=useState(initial?.products?.length ? initial.products : ['']);
  const [needs,setNeeds]=useState<Need[]>(initial?.needs || []);
  const [people,setPeople]=useState(String(previous?.people || 1)),[vehicles,setVehicles]=useState(String(previous?.vehicles ?? 0));
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const run=useRun(),toast=useToast();
  const data:ApplicationData={name:name.trim(),phone:phone.trim(),products:products.map((v)=>v.trim()),needs};
  const valid=validateApplication(data) && (!event || confirm && /^\d+$/.test(people) && +people>=1 && +people<=500 && /^\d+$/.test(vehicles) && +vehicles<=500);
  const editNeed=(i:number,d:Partial<Need>)=>setNeeds(needs.map((n,j)=>j===i?{...n,...d}:n));
  const submit=async()=>{if (!valid || busy) return;setBusy(true);const ok=await run(async()=>{await submitStall(user.uid,data,event?{record:event,people:+people,vehicles:+vehicles,source:previous?.eventId || ''}:undefined);return true;});setBusy(false);if(ok){setSaved(true);toast.show({text:event?'הבקשה הוגשה לאישור':'פרטי הדוכן נשמרו',check:true});}};
  return <div className="events-sheet">
    <Field label="שם בעל הדוכן" value={name} maxLength={80} onChange={(e)=>{setName(e.target.value);setSaved(false);}}/>
    <Field label="טלפון" ltr inputMode="tel" value={phone} maxLength={25} onChange={(e)=>setPhone(e.target.value)}/>
    <h2>מוצרים בדוכן</h2><p className="k-note">כתבו כל מוצר בשורה משלו כדי שנוכל להכין מקום לדוכן.</p>
    {products.map((v,i)=><div key={i}><Field label={'מוצר '+(i+1)} value={v} maxLength={100} onChange={(e)=>setProducts(products.map((p,j)=>i===j?e.target.value:p))}/>{products.length>1 && <Button variant="quiet" onClick={()=>setProducts(products.filter((_,j)=>j!==i))}>הסרת מוצר</Button>}</div>)}
    <Button variant="outline" onClick={()=>setProducts([...products,''])}>הוסף עוד מוצר</Button>
    <h2>מה צריך מהחווה?</h2>
    {needs.map((n,i)=><div className="k-card events-need" key={i}><Field label="מה נדרש" value={n.name} maxLength={80} onChange={(e)=>editNeed(i,{name:e.target.value})}/><Field label="כמות" type="number" min="0.1" step="any" value={n.quantity || ''} onChange={(e)=>editNeed(i,{quantity:Number(e.target.value)})}/>
      <label className="k-field"><span>יחידה</span><select className="k-input" value={n.unit} onChange={(e)=>editNeed(i,{unit:e.target.value as Need['unit']})}><option>יחידות</option><option>מטרים</option></select></label>
      <Button variant="quiet" onClick={()=>setNeeds(needs.filter((_,j)=>j!==i))}>הסרת צורך</Button></div>)}
    <Button variant="outline" onClick={()=>setNeeds([...needs,{name:'',quantity:1,unit:'יחידות'}])}>הוספת צורך מהחווה</Button>
    {event && <><Field label="כמה אנשים מגיעים, כולל עוזרים?" type="number" min="1" max="500" value={people} onChange={(e)=>setPeople(e.target.value)}/><Field label="כמה כלי רכב מגיעים?" type="number" min="0" max="500" value={vehicles} onChange={(e)=>setVehicles(e.target.value)}/>
      <label className="events-checkline"><input type="checkbox" checked={confirm} onChange={(e)=>setConfirm(e.target.checked)}/>בדקתי את הפרטים ואני מבקש להשתתף באירוע הזה</label></>}
    <Button size="bar" disabled={!valid || busy} onClick={submit}>{event?'הגשה לאישור':'שמירת פרטי הדוכן'}</Button>{saved && !event && <p role="status">פרטי הדוכן נשמרו.</p>}
  </div>;
}
