import { useState } from 'react';
import { Button, ListCard, Row, Sheet, StatRow, StatTile, Tag } from '../../kit';
import { useExternal, useToast, waUrl, go } from '../../core';
import { approveStall, useApplications, useStallApplications, type StallApplication, type Participation } from '../../data/vendorApplications';
import { useRun } from '../events/shared';
const regUrl = () => location.origin + '/app/vendor-registration';
export function StallPoolApplications() {
  const list=useStallApplications(true),[open,setOpen]=useState<StallApplication|null>(null);
  const external=useExternal(),toast=useToast();
  return <><div className="events-btnrow"><Button variant="outline" onClick={()=>external('https://wa.me/?text='+encodeURIComponent('הרשמת בעלי דוכנים לחוות רווה '+regUrl()))}>שיתוף קישור ההרשמה בוואטסאפ</Button>
    <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(regUrl());toast.show({text:'קישור ההרשמה הועתק',check:true});} catch {toast.show({text:regUrl()});}}}>העתקת קישור</Button></div>
    {list.items.length>0 && <ListCard title="דוכנים שנרשמו" count={list.items.length}>{list.items.map((v)=><Row key={v.id} title={v.name} meta={v.products.join(' · ')} onClick={()=>setOpen(v)}/>)}</ListCard>}
    <Sheet open={!!open} onClose={()=>setOpen(null)} title={open?.name || 'פרטי הדוכן'}>{open && <RequestDetails v={open}/>}</Sheet>
  </>;
}
function RequestDetails({v}:{v:StallApplication}) { return <div className="events-sheet"><p dir="ltr">{v.phone}</p><h3>מוצרים</h3><ul>{v.products.map((p,i)=><li key={i}>{p}</li>)}</ul><h3>הכנה מהחווה</h3>{v.needs.length ? <ul>{v.needs.map((n,i)=><li key={i}>{n.name} · {n.quantity} {n.unit}</li>)}</ul> : <p>לא התבקש ציוד</p>}</div>; }
export function EventStallApplications({eid}:{eid:string}) {
  const list=useApplications(eid),run=useRun(),external=useExternal(),[uid,setUid]=useState(''),[busy,setBusy]=useState(false);
  const shown=list.items.find((v)=>v.id===uid);
  const pending=list.items.filter((v)=>v.status==='requested'),approved=list.items.filter((v)=>v.status==='approved');
  return <><StatRow><StatTile value={pending.length} label="ביקשו"/><StatTile value={approved.length} label="אושרו"/></StatRow>
    <ListCard title="בקשות השתתפות">
      {list.items.map((v)=><Row key={v.id} title={v.name} tags={<Tag tone={v.status==='approved'?'paid':'waiting'}>{v.status==='approved'?'אושרו':'ביקשו'}</Tag>} meta={v.people+' אנשים · '+v.vehicles+' רכבים'} onClick={()=>setUid(v.id)}/>)}
      <Row title="פתיחת הרשמת הדוכנים" onClick={()=>go('/vendor-registration?event='+encodeURIComponent(eid))}/>
    </ListCard>
    <Sheet open={!!shown} onClose={()=>setUid('')} title={shown?.name || 'בקשת השתתפות'}>{shown && <div className="events-sheet"><RequestDetails v={shown}/><p>{shown.people} אנשים · {shown.vehicles} רכבים</p>
      {shown.status==='requested' && <Button size="bar" disabled={busy} onClick={async()=>{setBusy(true);await run(()=>approveStall(eid,shown.id));setBusy(false);}}>אישור השתתפות הדוכן</Button>}
      <Button variant="outline" onClick={()=>external(waUrl(shown.phone))}>שיחה עם בעל הדוכן</Button></div>}</Sheet>
  </>;
}
