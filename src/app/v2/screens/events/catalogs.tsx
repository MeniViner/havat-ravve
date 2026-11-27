import { useState } from 'react';
import type { FarmEvent, Product } from '../../../types';
import { newId, transact, useList, write } from '../../../db';
import { nowIso } from '../../../clock';
import { Button, CheckButton, Field, ListCard, Row, Sheet } from '../../kit';
import { useRun } from './shared';
import { money } from '../../format';

type Catalog = {id:string;name:string;createdAt:string;updatedAt:string};
type CatalogProduct = Catalog & {price:number};
type ProductSelection = Product & {catalogId?:string;catalogProductId?:string};
const catalogs='farm_catalogs';
type Edit = {catalog?:Catalog;product?:CatalogProduct;kind:'catalog'|'product'};
export function EventCatalogs({event,chosen}:{event:FarmEvent;chosen:ProductSelection[]}) {
  const source=useList<Catalog>(catalogs,{}),[edit,setEdit]=useState<Edit|null>(null);
  return <><ListCard title="הקטלוגים של דוכן החווה">
    <Row title="הוספת קטלוג" onClick={()=>setEdit({kind:'catalog'})}/>
    {source.items.map((c)=><CatalogGroup key={c.id} catalog={c} event={event} chosen={chosen} edit={setEdit}/>)}
  </ListCard>{edit && <CatalogEdit edit={edit} close={()=>setEdit(null)}/>}</>;
}
function CatalogGroup({catalog,event,chosen,edit}:{catalog:Catalog;event:FarmEvent;chosen:ProductSelection[];edit:(d:Edit)=>void}) {
  const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState('');
  const rows=useList<CatalogProduct>(catalogs+'/'+catalog.id+'/products',{},expanded),run=useRun();
  const select=async (product:CatalogProduct, active:boolean)=>{
    if (busy) return;
    setBusy(product.id);
    await run(async()=>{
      const col='events/'+event.id+'/products', id='catalog_'+catalog.id.length+'_'+catalog.id+'_'+product.id;
      await transact(async(tx)=>{
        const current=await tx.get<ProductSelection>(col,id);
        if (current?.active===active) return;
        if (!active) { if(current) tx.update(col,id,{active:false}); return; }
        const master=await tx.get<CatalogProduct>(catalogs+'/'+catalog.id+'/products',product.id);
        if (!master) throw new Error('המוצר לא נמצא');
        tx.set(col,id,{catalogId:catalog.id,catalogProductId:product.id,name:master.name,price:master.price,active:true,sort:current?.sort ?? chosen.reduce((n,p)=>Math.max(n,p.sort || 0),0)+1});
      });
    });setBusy('');
  };
  return <><Row title={catalog.name} meta={chosen.filter((p)=>p.catalogId===catalog.id && p.active).length+' נבחרו לאירוע'} onClick={()=>setExpanded(!expanded)}/>
    {expanded && <li className="events-catalog"><Button variant="quiet" onClick={()=>edit({kind:'catalog',catalog})}>עריכת שם הקטלוג</Button>
      <Button variant="outline" icon="plus" onClick={()=>edit({kind:'product',catalog})}>הוספת מוצר לקטלוג</Button>
      <ul className="k-list">{rows.items.map((p)=>{const selected=chosen.some((c)=>c.active && c.catalogId===catalog.id && c.catalogProductId===p.id);return <Row key={p.id} title={p.name} value={money(p.price)} check={<CheckButton label={'בחירת '+p.name+' לאירוע'} checked={selected} onChange={()=>void select(p,!selected)}/>} onClick={()=>edit({kind:'product',catalog,product:p})}/>;})}</ul>
    </li>}</>;
}
function CatalogEdit({edit,close}:{edit:Edit;close:()=>void}) {
  const isCatalog=edit.kind==='catalog';
  const row=isCatalog?edit.catalog:edit.product;
  const [name,setName]=useState(row?.name || ''),[price,setPrice]=useState(edit.product?String(edit.product.price):''),[busy,setBusy]=useState(false);
  const run=useRun();const valid=name.trim() && (isCatalog || price.trim()!=='' && Number.isFinite(Number(price)) && +price>=0);
  const save=async()=>{
    if(!valid || busy)return;setBusy(true);
    const ok=await run(async()=>{
      const col=isCatalog ? catalogs : catalogs+'/'+edit.catalog!.id+'/products';
      const at=nowIso(),fields={name:name.trim(),...(isCatalog?{}:{price:Math.round(+price*100)/100}),updatedAt:at};
      if(row) await write.update(col,row.id,fields);
      else await write.set(col,newId(col),{...fields,createdAt:at});
      return true;
    });setBusy(false);if(ok)close();
  };
  return <Sheet open onClose={close} title={isCatalog ? (row?'עריכת קטלוג':'הוספת קטלוג') : (row?'עריכת מוצר':'הוספת מוצר לקטלוג')}><div className="events-sheet">
    <Field label={isCatalog?'שם הקטלוג':'שם המוצר'} value={name} maxLength={100} onChange={(e)=>setName(e.target.value)}/>
    {!isCatalog && <Field label="מחיר בשקלים" type="number" min="0" step="0.01" value={price} onChange={(e)=>setPrice(e.target.value)}/>}
    <Button size="bar" disabled={!valid || busy} onClick={save}>שמירה</Button>
  </div></Sheet>;
}
