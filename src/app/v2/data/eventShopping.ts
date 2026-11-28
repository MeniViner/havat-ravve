import { ConflictError, newId, transact, useList, write } from '../../db';
import { nowIso } from '../../clock';
import type { Actor, ShoppingCategory, ShoppingItem } from '../../types';

export type EventShoppingItem = Pick<ShoppingItem, 'id'|'title'|'qty'|'category'|'createdBy'|'createdAt'|'updatedAt'|'bought'|'boughtBy'|'boughtAt'> & {linkedItemId?:string|null;linkedAt?:string|null};
const shoppingPath = (eid:string) => 'events/'+eid+'/shopping';
export const useEventShopping = (eid:string) => useList<EventShoppingItem>(shoppingPath(eid),{});
export const exactOptions = (item:EventShoppingItem, regular:ShoppingItem[]) => regular.filter((r) => r.title === item.title && !r.bought);
export async function addEventShopping(eid:string, actor:Actor, title:string, qty:string, category:ShoppingCategory) {
  if (!title.trim()) throw new Error('נדרש שם פריט');
  const at=nowIso(), col=shoppingPath(eid);
  await write.set(col,newId(col),{title,qty,category,createdBy:actor,createdAt:at,updatedAt:at,bought:false,boughtAt:null,boughtBy:null});
}
/** Only the ordinary item actually marked by this purchase can be restored by its undo. */
export async function changeEventPurchase(eid:string,actor:Actor,item:EventShoppingItem,regularId?:string) {
  const col=shoppingPath(eid);
  await transact(async (tx) => {
    const current = await tx.get<EventShoppingItem>(col,item.id);
    if (!current || current.bought !== item.bought || current.updatedAt !== item.updatedAt) throw new ConflictError('הקנייה השתנתה. נסו שוב מהרשימה.');
    const at = nowIso();
    if (current.bought) {
      const linked = current.linkedItemId ? await tx.get<ShoppingItem>('shopping',current.linkedItemId) : null;
      if (linked?.bought && linked.boughtAt === current.linkedAt && linked.boughtBy?.uid === current.boughtBy?.uid) {
        tx.update('shopping',linked.id,{bought:false,boughtAt:null,boughtBy:null,expireAt:null,updatedAt:at});
      }
      tx.update(col,item.id,{bought:false,boughtAt:null,boughtBy:null,linkedItemId:null,linkedAt:null,updatedAt:at});
      return;
    }
    if (regularId) {
      const match = await tx.get<ShoppingItem>('shopping',regularId);
      if (!match || match.bought || match.title !== current.title) throw new ConflictError('הפריט ברשימה הרגילה השתנה. בחרו מחדש.');
      tx.update('shopping',regularId,{bought:true,boughtBy:actor,boughtAt:at,updatedAt:at,expireAt:new Date(Date.parse(at)+86400000).toISOString()});
    }
    tx.update(col,item.id,{bought:true,boughtAt:at,boughtBy:actor,linkedItemId:regularId || null,linkedAt:regularId ? at : null,updatedAt:at});
  });
}
