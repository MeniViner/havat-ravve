import { eventMillis } from '../screens/events/logic';
import { ConflictError, transact, useDoc, useList } from '../../db';
import { contactPhoneOk, randomSecret } from '../../data';
import { nowIso } from '../../clock';
import type { FarmEvent } from '../../types';
export type Need = {name:string;quantity:number;unit:'יחידות'|'מטרים'};
export type ApplicationData = {name:string;phone:string;products:string[];needs:Need[]};
export type StallApplication = ApplicationData & {id:string;ownerUid:string;createdAt:string;updatedAt:string;appliedEventIds?:string[]};
export type Participation = StallApplication & {eventId:string;eventStart:string;people:number;vehicles:number;sourceEventId?:string;status:'requested'|'approved';qrToken?:string};
const apps = 'vendor_applications';
export const eventApplications = (id:string) => 'events/'+id+'/vendor_applications';
export const useMyApplication = (uid:string) => useDoc<StallApplication>(apps+'/'+(uid || '_'),!!uid);
export const useParticipation = (eventId:string,uid:string) => useDoc<Participation>(eventApplications(eventId || '_')+'/'+(uid || '_'),!!eventId && !!uid);
export const useApplications = (eventId:string) => useList<Participation>(eventApplications(eventId || '_'),{},!!eventId);
export const useStallApplications = (enabled:boolean) => useList<StallApplication>(apps,{},enabled);
export type SupplierPass = {id:string;eventId:string;name:string;people:number;createdAt:string};
export const useSupplierPasses = (id:string) => useList<SupplierPass>('events/'+(id || '_')+'/supplier_passes',{},!!id);
export const supplierPayload = (r:Participation) => r.status==='approved' && r.qrToken ? ['HRSUP1',r.eventId,r.qrToken].map(encodeURIComponent).join('|') : '';
export function validateApplication(data:ApplicationData) {
  if (!data.name.trim() || !contactPhoneOk(data.phone) || !data.products.length || data.products.some((s)=>!s.trim())) return false;
  return data.needs.every((s)=>s.name.trim() && Number.isFinite(s.quantity) && s.quantity>0 && ['יחידות','מטרים'].includes(s.unit));
}
export async function submitStall(uid:string,data:ApplicationData,event?:{record:FarmEvent;people:number;vehicles:number;source:string}) {
  if (!uid || !validateApplication(data)) throw new Error('בדקו את פרטי הדוכן.');
  const at=nowIso();
  await transact(async(tx)=>{
    const base=await tx.get<StallApplication>(apps,uid);
    if (!event) {
      tx.set(apps,uid,{...data,ownerUid:uid,createdAt:base?.createdAt || at,updatedAt:at,appliedEventIds:base?.appliedEventIds || []});
      return;
    }
    if (!Number.isInteger(event.people)||event.people<1||event.people>500||!Number.isInteger(event.vehicles)||event.vehicles<0||event.vehicles>500) throw new Error('בדקו את מספר האנשים והרכבים.');
    const eid=event.record.id,col=eventApplications(eid);
    const exists=await tx.get<Participation>(col,uid);
    if (exists) throw new ConflictError('כבר הוגשה בקשה לאירוע הזה.');
    if (!event.record.published || event.record.stall===false || !(eventMillis(event.record.end)>Date.parse(at)) || ('closed' in event.record && !!event.record.closed)) throw new ConflictError('ההרשמה לדוכנים הסתיימה.');
    tx.set(col,uid,{...data,ownerUid:uid,eventId:eid,eventStart:event.record.start,people:event.people,vehicles:event.vehicles,sourceEventId:event.source,status:'requested',createdAt:at,updatedAt:at});
    if (base) tx.update(apps,uid,{appliedEventIds:[...new Set([...(base.appliedEventIds || []),eid])],updatedAt:at});
    else tx.set(apps,uid,{...data,ownerUid:uid,createdAt:at,updatedAt:at,appliedEventIds:[eid]});
  });
}
export async function approveStall(eventId:string,uid:string) {
  const col=eventApplications(eventId);
  await transact(async(tx)=>{
    const existing=await tx.get<Participation>(col,uid);
    if (!existing) throw new ConflictError('הבקשה לא נמצאה.');
    if (existing.status==='approved') return;
    const token=randomSecret(),at=nowIso();
    tx.update(col,uid,{status:'approved',qrToken:token,updatedAt:at});
    tx.set('events/'+eventId+'/supplier_passes',token,{eventId,name:existing.name,people:existing.people,createdAt:at});
  });
}
