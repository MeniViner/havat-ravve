import template from './template.json';
export const fields = template.fields;
export type EventItem = {id:string;title:string;description:string;start:string;end:string;status:'draft'|'published'|'hidden';archive:boolean;image:string;visibleFrom?:string;notify?:boolean};
export type Content = {values:Record<string,string>;events:EventItem[];position:string};
export const defaults:Content={values:Object.fromEntries(fields.map(f=>[f.id,f.value])),events:[],position:'experiences'};
export const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function safeUrl(s:string,image=false){
 if(typeof s!=='string'||/[\u0000-\u0020]/.test(s))return false;
 if(image && /^(?:\/)?(?:assets\/|api\/media\/)[\w./-]+$/.test(s)&&!s.includes('..'))return true;
 try{const u=new URL(s);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
export function validDate(s:unknown):s is string {return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export const todayInIsrael=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jerusalem'}).format(new Date());
export const mediaUrl=(s:string)=>s.startsWith('assets/')?'/'+s:s;
export function phoneNumber(value:string){const raw=value.replace(/[\s()-]/g,'');return /^\+?[0-9]{9,15}$/.test(raw)?raw:'';}
export function validate(x:Content){
 if(!x||!x.values||!Array.isArray(x.events)||x.events.length>100||!['story','heritage','experiences','visit'].includes(x.position)) throw Error('נתונים לא תקינים');
 const values:Record<string,string>={};
 for(const f of fields){const s=x.values[f.id]??defaults.values[f.id];if(typeof s!=='string'||s.length>20000||((f.kind==='image'||f.kind==='url')&&!safeUrl(s,f.kind==='image')))throw Error('ערך לא תקין: '+f.label);if(f.id.startsWith('contact_')&&s&&!phoneNumber(s))throw Error('הזינו מספר טלפון תקין: '+f.label);values[f.id]=s;}
 if(new Set(x.events.map(e=>e.id)).size!==x.events.length)throw Error('מזהי אירועים כפולים');
 for(const e of x.events){if(typeof e.id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(e.id)||typeof e.title!=='string'||(e.status==='published'&&!e.title.trim())||e.title.length>250||typeof e.description!=='string'||e.description.length>20000||!['draft','published','hidden'].includes(e.status)||typeof e.archive!=='boolean'||(e.notify!==undefined&&typeof e.notify!=='boolean')||!validDate(e.start)||!validDate(e.end)||(!!e.visibleFrom&&(!validDate(e.visibleFrom)||e.visibleFrom>e.end))||e.end<e.start||typeof e.image!=='string'||(e.image&&!safeUrl(e.image,true)))throw Error('בדקו את האירוע '+(e.title||'החדש')+': כותרת לאירוע מוצג, תאריכים תקינים ותאריך סיום שאינו לפני ההתחלה');}
 return {values,events:x.events,position:x.position};
}
export function render(data:Content,archive=false){
 let html=template.html.replace(/\{\{cms:(\w+)\}\}/g,(_,id)=>escape(data.values[id]??defaults.values[id]??''));
 const phone=phoneNumber(data.values.contact_phone||''),wa=phoneNumber(data.values.contact_whatsapp||'');
 const waNumber=wa.startsWith('0')?'972'+wa.slice(1):wa.replace(/^\+/, '');
 const contact=(phone||wa)?`<div class="visit-row contact-row" id="contact"><div><h3>מתאמים לפני שיוצאים</h3><p>פנו למארחים לבירור זמינות והנחיות הגעה.</p><div class="contact-actions">${phone?`<a class="button button-green" href="tel:${phone}" aria-label="התקשרות לתיאום ביקור">התקשרות <bdi>${escape(phone)}</bdi></a>`:''}${wa?`<a class="button contact-whatsapp" href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer">תיאום ב־WhatsApp ↗</a>`:''}</div></div></div>`:'';
 html=html.replace(/(<div class="visit-details[^"]*">)/,'$1'+contact);
 const today=todayInIsrael();
 const events=data.events.filter(e=>e.status==='published'&&(archive?e.end<today&&e.archive:e.end>=today&&(!e.visibleFrom||e.visibleFrom<=today))).sort((a,b)=>archive?b.start.localeCompare(a.start):a.start.localeCompare(b.start));
 const cards=events.map(e=>`<article id="event-${escape(e.id)}" class="event-card">${e.image?`<img loading="lazy" src="${escape(mediaUrl(e.image))}" alt="${escape(e.title)}">`:''}<h3>${escape(e.title)}</h3><p class="event-dates"><time datetime="${e.start}">${escape(new Date(e.start+'T12:00:00').toLocaleDateString('he-IL'))}</time>${e.start!==e.end?` — <time datetime="${e.end}">${escape(new Date(e.end+'T12:00:00').toLocaleDateString('he-IL'))}</time>`:''}</p><p style="white-space:pre-line">${escape(e.description)}</p><button type="button" class="text-link" data-calendar="${escape(e.id)}">הוספה ליומן ↗</button></article>`).join('');
 const hasArchive=data.events.some(e=>e.status==='published'&&e.end<today&&e.archive);
 const block=(events.length||hasArchive)?`<section id="events" class="cms-events" dir="rtl"><${archive?'h1':'h2'}>${archive?'ארכיון אירועים':'אירועים בחווה'}</${archive?'h1':'h2'}><div class="event-grid">${cards}</div>${archive?'<a href="/">חזרה לאתר</a>':hasArchive?'<a href="/events/archive">לאירועים שהיו בחווה</a>':''}</section>`:'';
 if(archive)html=html.replace(/<main[\s\S]*?<\/main>/,`<main>${block||'<section class="cms-events"><h1>אין אירועים בארכיון</h1><a href="/">חזרה לאתר</a></section>'}</main>`).replace(/(<a[^>]*href=")#(?!main)/g,'$1/#').replace('<main>','<main id="main">').replace('<title>','<title>ארכיון אירועים | ').replace(/<link[^>]*rel="canonical"[^>]*>/, tag=>tag.replace(/href="[^"]*"/, 'href="https://havat-ravve.web.app/events/archive"'));
 else {const re=new RegExp(`(<section[^>]*id="${data.position}"[\\s\\S]*?<\\/section>)`);html=html.replace(re,'$1'+block);}
 return html.replace(/(href|src)="(assets\/|styles.css|farm.js)/g,'$1="/$2');
}
