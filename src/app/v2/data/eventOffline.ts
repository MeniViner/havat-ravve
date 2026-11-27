import { useEffect, useState } from 'react';
import { readListFromCache, readOnce, type Spec } from '../../db';
import { useOnline } from '../../store';
import { useDemo, useDemoStates } from '../../demo/store';
import { nowIso } from '../../clock';

type LocalRow = { id: string; holderName?: string; ownerName?: string; secret?: string; status?: string };
type Part = { title: string; path: string; spec: Spec };
type Mark = { at: string; lists: (string | null)[]; denied?: boolean[] };
type State = { tone: 'good' | 'partial' | 'bad'; title: string; at: string; counts: { label:string; count:number; valid:boolean; denied:boolean }[]; names: string[] };
const waiting: State = {tone:'partial',title:'בודקים את הרשימות',at:'',counts:[],names:[]};
const noCopy: State = {tone:'bad',title:'עוד אין עותק במכשיר',at:'',counts:[],names:[]};

function loadMark(key: string): Mark | null {
  try { const m = JSON.parse(localStorage.getItem(key) || 'null'); return m && typeof m.at === 'string' && Array.isArray(m.lists) ? m : null; } catch { return null; }
}
function saveMark(key: string, mark: Mark | null) {
  try { if (mark) localStorage.setItem(key, JSON.stringify(mark)); else localStorage.removeItem(key); } catch { /* A tab without storage can still verify this session. */ }
}
/** Only a digest reaches localStorage. The event's documents stay in Firestore's private cache. */
function canonical(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
async function signature(rows: LocalRow[]) {
  const bytes = new TextEncoder().encode(JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)).map(canonical)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}
export function useEventOffline(eventId: string, uid: string, manager: boolean, refreshKey = 0): State {
  const online = useOnline();
  const demo = useDemo();
  const demoState = useDemoStates();
  const available = online && !(demo.on && demoState.offline);
  const key = ['farm-event-cache-v1', demo.on ? 'demo' : 'live', uid, manager ? 'manager' : 'staff', eventId].map(encodeURIComponent).join('/');
  const [snapshot, setSnapshot] = useState({ key:'', value:waiting });
  useEffect(() => {
    if (!eventId || !uid) return;
    let active = true, running = false, pending = false;
    const lists: Part[] = [
      {title:'כרטיסים',path:'tickets',spec:{where:[['eventId','==',eventId]]}},
      {title:'כרטיסי בדיקה',path:'events/' + eventId + '/test_tickets',spec:{}},
      {title:'אישורי דוכנים לשער',path:'events/' + eventId + '/supplier_passes',spec:{}},
      {title:'מוצרים',path:'events/' + eventId + '/products',spec:{}},
      {title:'צוות',path:'events/' + eventId + '/staffing',spec:{}},
      {title:'משימות',path:'tasks',spec:{where:[['eventId','==',eventId], ...(manager ? [] : [['managersOnly','==',false] as ['managersOnly','==',boolean]])]}}
    ];
    const inspectCache = async (mark:Mark, refreshFailed:boolean) => {
      const cached = await Promise.allSettled(lists.map((p)=>readListFromCache<LocalRow>(p.path,p.spec)));
      const counts = await Promise.all(cached.map(async (r,i)=>{
        const denied = !!mark.denied?.[i];
        const rows = !denied && r.status==='fulfilled' ? r.value : [];
        const keysPresent = i===0 ? rows.every((t)=>t.status!=='valid' || !!t.secret) : i===1 ? rows.every((t)=>!!t.secret) : true;
        const valid = !!mark.lists[i] && r.status==='fulfilled' && keysPresent && await signature(rows)===mark.lists[i];
        return {label:lists[i].title,count:rows.length,valid,denied};
      }));
      const complete=counts.every((c)=>c.valid);
      const tickets=counts[0].valid && cached[0].status==='fulfilled' ? cached[0].value : [];
      const names=tickets.filter((t)=>t.status==='valid').map((t)=>t.holderName || t.ownerName || 'ללא שם');
      const usable = counts.some((c)=>c.valid);
      const denied = counts.some((c)=>c.denied);
      const tone = !usable ? 'bad' : complete && !refreshFailed ? 'good' : 'partial';
      const title = !usable && denied ? 'אין גישה לרשימות האירוע'
        : denied ? 'חלק מהרשימות אינו פתוח לתפקיד שלך'
        : !usable ? 'מחכים לחיבור כדי לשמור את הרשימות'
        : !complete ? 'חלק מהרשימות חסר במכשיר'
        : refreshFailed ? 'עותק מקומי · מחכים לחיבור'
        : available ? 'הרשימות נשמרו במכשיר' : 'הרשימות במכשיר · אין חיבור';
      const value: State = {tone,title,counts,names,at:mark.at};
      if (active) setSnapshot({key,value});
    };
    const update = async () => {
      if (running) {pending=true;return;}
      running=true;
      try {
        const previous=loadMark(key);
        if (previous) await inspectCache(previous,false);
        if (!available) {
          if (!previous && active) setSnapshot({key,value:{...noCopy,title:'מחכים לחיבור כדי לשמור את הרשימות'}});
          return;
        }
        const results = await Promise.allSettled(lists.map((part)=>readOnce<LocalRow>(part.path,part.spec)));
        const denied = results.map((r,i)=>r.status==='rejected' && ((r.reason as {code?:string})?.code==='permission-denied' || !!previous?.denied?.[i]));
        const digests = await Promise.all(results.map((r,i)=>r.status==='fulfilled' ? signature(r.value) : denied[i] ? null : previous?.lists[i] || null));
        const fresh = results.every((r)=>r.status==='fulfilled');
        const at = fresh || !previous && results.some((r)=>r.status==='fulfilled') ? nowIso() : previous?.at || '';
        const mark: Mark = { at, lists:digests, denied };
        if (!active) return;
        if (digests.some(Boolean) || denied.some(Boolean)) saveMark(key,mark);
        await inspectCache(mark,!fresh);
      } catch {if (active)setSnapshot({key,value:{...noCopy,title:'לא הצלחנו לבדוק את העותק'}});}
      finally {running=false;if(active && pending){pending=false;void update();}}
    };
    const visible=()=>{if(document.visibilityState==='visible') void update();};
    void update();
    document.addEventListener('visibilitychange',visible);
    const timer=available ? window.setInterval(visible,60000) : undefined;
    return ()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  }, [eventId, uid, manager, key, available, refreshKey]);
  return snapshot.key === key ? snapshot.value : waiting;
}
