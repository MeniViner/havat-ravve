import { useState } from 'react';
import type { V2Ctx } from '../../ctx';
import { Button, ListCard, Row, Sheet, Tag } from '../../kit';
import { createTestTicket, useTestTickets, testPayload } from '../../data/eventTestTickets';
import { Qr } from '../guest/parts';
import { useRun } from './shared';
export function EventTestTickets({ctx,eventId}:{ctx:V2Ctx;eventId:string}) {
  const tickets = useTestTickets(eventId), run = useRun();
  const [open,setOpen] = useState(false), [busy,setBusy]=useState(false);
  const mine = tickets.items.find((t)=>t.ownerUid===ctx.user.uid);
  return <><ListCard title="כרטיסי בדיקה">
    {tickets.items.map((t)=><Row key={t.id} title={t.ownerName} tags={<Tag tone="warm">כרטיס לבדיקה</Tag>} onClick={t.ownerUid===ctx.user.uid ? ()=>setOpen(true) : undefined}/>)}
    <Row title={mine ? 'פתיחת כרטיס הבדיקה שלי' : 'בדיקת הזמנה וכרטיס'} onClick={()=>setOpen(true)} />
  </ListCard><Sheet open={open} onClose={()=>setOpen(false)} title="כרטיס לבדיקה"><div className="events-sheet">
    <p>כרטיס אישי לתרגול בשער. אין תשלום, והסריקה אינה מוסיפה אדם לספירת הכניסות.</p>
    {mine ? <><b>{mine.ownerName}</b><Qr text={testPayload(mine)} size={180}/></> : <Button size="bar" disabled={busy || tickets.loading} onClick={async()=>{setBusy(true);await run(()=>createTestTicket(eventId,ctx.actor));setBusy(false);}}>יצירת כרטיס לבדיקה</Button>}
  </div></Sheet></>;
}
