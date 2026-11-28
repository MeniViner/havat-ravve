import { useList, transact } from '../../db';
import { randomSecret } from '../../data';
import { nowIso } from '../../clock';
import type { Actor } from '../../types';
export type TestTicket = {id:string; eventId:string; ownerUid:string; ownerName:string; secret:string; createdAt:string; isTest:true};
const collection = (eid:string) => 'events/'+eid+'/test_tickets';
export const useTestTickets = (eid:string) => useList<TestTicket>(collection(eid || '_'),{},!!eid);
export const testPayload = (t:TestTicket) => ['HRTEST1',t.eventId,t.ownerUid,t.secret].map(encodeURIComponent).join('|');
export const isTestPayload = (code:string) => code.startsWith('HRTEST1|');
export const testMatch = (code:string,eventId:string,tickets:TestTicket[]) => tickets.find((t) => t.isTest === true && t.eventId === eventId && testPayload(t) === code);
export async function createTestTicket(eventId:string, actor:Actor) {
  const col = collection(eventId);
  await transact(async (tx) => {
    if (await tx.get<TestTicket>(col,actor.uid)) return;
    tx.set(col,actor.uid,{eventId,ownerUid:actor.uid,ownerName:actor.name,createdAt:nowIso(),secret:randomSecret(),isTest:true});
  });
}
