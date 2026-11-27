import { useState } from 'react';
import { newId, write } from '../../../db';
import { nowIso } from '../../../clock';
import { useCalendar } from '../../../data';
import { type AppNotification, type Visit } from '../../../types';
import { Button, Field, RadioList, RadioRow, Sheet, TextAreaField } from '../../kit';
import { useExternal } from '../../core';
import type { V2Ctx } from '../../ctx';
import { deliverOperationalMessage, visitRecipient } from '../../data/operationalMessages';
type ReplyMode='app'|'app-email'|'whatsapp';
type Choice='approved'|'rejected';
export function VisitDecision({ctx,visit,managerNote,choice,inbox,close}:{ctx:V2Ctx;visit:Visit;managerNote:string;choice:Choice;inbox:AppNotification[];close:()=>void}) {
  const accepted=choice==='approved';
  const [date,setDate]=useState(visit.approvedDate || visit.date),[time,setTime]=useState(visit.approvedTime || '');
  const [text,setText]=useState<string|null>(null),[channel,setChannel]=useState<ReplyMode>('app');
  const [id]=useState(()=>newId('operational_notices')),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [receipt,setReceipt]=useState<Awaited<ReturnType<typeof deliverOperationalMessage>>|null>(null);
  const cal=useCalendar(accepted && !!date,date || visit.date,date || visit.date),external=useExternal();
  const target=visitRecipient(visit,ctx.peopleByUid.get(visit.uid));
  const body=text ?? (accepted ? 'שלום '+visit.name+', הביקור בחוות רווה אושר ל־'+date.split('-').reverse().join('.')+(time?' בשעה '+time:'')+'.' : 'שלום '+visit.name+', תודה שפנית לחוות רווה. המועד שביקשת אינו מתאים לנו הפעם.');
  const valid=!!body.trim() && (!accepted || /^\d{4}-\d{2}-\d{2}$/.test(date)) && (channel!=='whatsapp' || !!target.phone) && (channel!=='app-email'||!!target.email);
  const confirm=async()=>{
    if (!valid || busy) return;
    setBusy(true);setError('');
    const decision={status:choice,managerNote,...(accepted?{date,time}:{}),expectedUpdatedAt:visit.updatedAt};
    const demoDecision=async()=>{
      const at=nowIso();
      const ops:Parameters<typeof write.batch>[0]=[{op:'update',col:'visits',id:visit.id,data:{status:choice,managerNote,requestedDate:visit.requestedDate || visit.date,...(accepted?{approvedDate:date,approvedTime:time}:{}),replyText:body,replyChannel:channel,handledBy:ctx.actor,updatedAt:at}}];
      if(accepted)ops.push({op:'set',col:'calendar',id:'visit_'+visit.id,data:{title:'ביקור: '+visit.name+' · '+visit.people,date,time,ownerUid:ctx.actor.uid,ownerName:ctx.actor.name,kind:'visit',refId:visit.id,createdAt:at}});
      else if(visit.status==='approved')ops.push({op:'remove',col:'calendar',id:'visit_'+visit.id});
      for(const n of inbox.filter((n)=>n.refId===visit.id))ops.push({op:'update',col:'notifications',id:n.id,data:{handled:true,handledBy:ctx.actor,handledAt:at}});
      await write.batch(ops);
    };
    try{
      const result=await deliverOperationalMessage(ctx.actor,{id,source:'visit',sourceId:visit.id,text:body,channels:channel==='app'?[]:channel==='app-email'?['email']:['whatsapp'],people:[target],decision},demoDecision);
      setReceipt(result);
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  };
  return <Sheet open onClose={close} title={accepted?'אישור הביקור ליומן':'לא מתאים'}><div className="events-sheet">
    {receipt ? <><b role="status">{accepted ? 'הביקור אושר ליומן' : 'הבקשה נדחתה'}</b>{receipt.drafts.map((w)=><Button key={w.url} onClick={()=>external(w.url)}>פתיחת WhatsApp ל{w.name}</Button>)}<Button variant="outline" onClick={close}>סגירה</Button></> : <>
      {accepted && <><Field label="תאריך הביקור" type="date" value={date} onChange={(e)=>setDate(e.target.value)}/><Field label="שעה" type="time" value={time} onChange={(e)=>setTime(e.target.value)}/>
        {date!==visit.date && <b>מועד שונה מהבקשה</b>}<h3>ביומן בתאריך שנבחר</h3>{cal.items.filter((c)=>c.refId!==visit.id).map((c)=><p key={c.id}>{c.time} {c.title}</p>)}{!cal.loading && !cal.items.some((c)=>c.refId!==visit.id) && <p>היום הזה פנוי ביומן</p>}</>}
      <TextAreaField label="נוסח ההודעה למבקש" value={body} onChange={(e)=>setText(e.target.value)} maxLength={240}/>
      <RadioList label="איך להשיב"><RadioRow checked={channel==='app'} title="הודעה באפליקציה בלבד" onSelect={()=>setChannel('app')}/><RadioRow checked={channel==='app-email'} title="באפליקציה וגם במייל" onSelect={()=>setChannel('app-email')} meta={target.email || 'אין כתובת מייל'}/><RadioRow checked={channel==='whatsapp'} title="פתיחת WhatsApp ישירות למבקש" onSelect={()=>setChannel('whatsapp')} meta={target.phone||'אין טלפון'}/></RadioList>
      <Button size="bar" disabled={!valid || busy} onClick={confirm}>{accepted ? 'אישור סופי ליומן' : 'אישור סופי של הדחייה'}</Button>
      {error && <p role="alert">{error}</p>}
    </>}
  </div></Sheet>;
}
