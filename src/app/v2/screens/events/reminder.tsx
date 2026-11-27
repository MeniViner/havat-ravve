import { useCallback, useState } from 'react';
import type { FarmEvent } from '../../../types';
import type { V2Ctx } from '../../ctx';
import { Button, Sheet, TextAreaField } from '../../kit';
import { useExternal } from '../../core';
import { newId } from '../../../db';
import { deliverOperationalMessage, useEventReminderRecipients, type ReminderGroup, type MessageChannel } from '../../data/operationalMessages';
import { dayName, ddmm, hhmm } from '../../format';
const groups: [ReminderGroup,string][]=[['registrants','נרשמי האירוע'],['crew','צוות האירוע'],['approvedVendors','בעלי דוכנים שאושרו']];
const channels: [MessageChannel,string][]=[['whatsapp','WhatsApp'],['push','פוש'],['email','מייל']];
const toggle = <T,>(values:T[],key:T) => values.includes(key) ? values.filter((v)=>v!==key) : [...values,key];
export function ReminderAction({ctx,event}:{ctx:V2Ctx;event:FarmEvent}) {
  const [open,setOpen]=useState(false),close=useCallback(()=>setOpen(false),[]);
  return <><Button variant="outline" size="tall" icon="message" onClick={()=>setOpen(true)}>תזכורת לאירוע</Button>
    {open && <ReminderForm ctx={ctx} event={event} close={close}/>}</>;
}
function ReminderForm({ctx,event,close}:{ctx:V2Ctx;event:FarmEvent;close:()=>void}) {
  const [audience,setAudience]=useState<ReminderGroup[]>([]),[selected,setSelected]=useState<MessageChannel[]>([]);
  const [text,setText]=useState('נפגשים בחוות רווה ל'+event.title+' ביום '+dayName(event.start)+' '+ddmm(event.start)+' בשעה '+hhmm(event.start)+'.');
  const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [receipt,setReceipt]=useState<Awaited<ReturnType<typeof deliverOperationalMessage>>|null>(null);
  const [id,setId]=useState(()=>newId('operational_notices'));
  const targets=useEventReminderRecipients(ctx,event.id,audience),external=useExternal();
  const send=async()=>{
    if (busy) return;
    setBusy(true);setError('');
    try {setReceipt(await deliverOperationalMessage(ctx.actor,{id,source:'event',sourceId:event.id,text,groups:audience,channels:selected,people:targets.people}));}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  };
  return <Sheet open onClose={close} title={receipt?'התזכורת לאירוע':preview?'תצוגה מקדימה':'תזכורת לאירוע'}><div className="events-sheet">
    {receipt ? <><p role="status">{receipt.queued} מסירות בתור · {receipt.drafts.length} טיוטות WhatsApp לפתיחה אישית</p>
      {receipt.drafts.map((r)=><Button key={r.uid || r.url} variant="outline" onClick={()=>external(r.url)}>פתיחת טיוטה ל{r.name}</Button>)}
      <Button onClick={close}>סיום</Button></> : preview ? <>
        <p>{groups.filter(([k])=>audience.includes(k)).map(([,l])=>l).join(' · ')}</p><p>{channels.filter(([k])=>selected.includes(k)).map(([,l])=>l).join(' · ')}</p>
        <blockquote>{text}</blockquote><p>נמצאו {targets.people.length} נמענים. כל אדם נספר פעם אחת.</p>
        <Button size="bar" disabled={busy || targets.loading || !!targets.error || !targets.people.length} onClick={send}>אישור התזכורת והכנת טיוטות</Button>
        <Button variant="outline" disabled={busy} onClick={()=>{setId(newId('operational_notices'));setPreview(false);setError('');}}>חזרה לעריכה</Button></> : <>
        <fieldset><legend>קהל יעד</legend>{groups.map(([key,label])=><label className="events-checkline" key={key}><input type="checkbox" checked={audience.includes(key)} onChange={()=>setAudience(toggle(audience,key))}/>{label}</label>)}</fieldset>
        <fieldset><legend>ערוצי תזכורת</legend>{channels.map(([key,label])=><label className="events-checkline" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={()=>setSelected(toggle(selected,key))}/>{label}</label>)}</fieldset>
        <TextAreaField label="תוכן ההודעה" value={text} onChange={(e)=>setText(e.target.value)} maxLength={240}/>
        <Button size="bar" disabled={!text.trim() || !audience.length || !selected.length} onClick={()=>setPreview(true)}>תצוגה מקדימה</Button>
      </>}
    {(error || targets.error) && <p role="alert">{error || targets.error}</p>}
  </div></Sheet>
}
