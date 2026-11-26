/// <reference lib="webworker" />
export {};
const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE='havat-ravve-__BUILD_ID__',OFFLINE='/offline.html',APP='/app.html';
const PRECACHE=[OFFLINE,APP,'/assets/leaflet/leaflet.css','/app.js','/app.css','/app.webmanifest','/assets/app-icon-192.png','/assets/app-icon-512.png','/assets/rava-logo.png','/assets/heebo-hebrew.woff2','/assets/heebo-latin.woff2','/assets/frank-ruhl-libre-hebrew.woff2','/assets/frank-ruhl-libre-latin.woff2'];
const isApp=(p:string)=>p==='/app'||p.startsWith('/app/');
worker.addEventListener('install',e=>{worker.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)));});
worker.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('havat-ravve-')&&k!==CACHE)await caches.delete(k);await worker.clients.claim();})()));
// Weak reception is the normal case at the farm: give the network a few seconds, then answer from the cache.
const quick=(req:Request,ms=3500)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return fetch(req,{signal:c.signal}).finally(()=>clearTimeout(t));};
worker.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==worker.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/admin')||u.pathname.startsWith('/edit')||u.pathname.startsWith('/console')||u.pathname.startsWith('/__/'))return;
 if(e.request.mode==='navigate'){e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const r=await quick(e.request);if(r.ok&&isApp(u.pathname))await cache.put(APP,r.clone());return r;}catch{return (isApp(u.pathname)?await cache.match(APP):await caches.match(OFFLINE))||Response.error();}})());return;}
 if(u.pathname.startsWith('/assets/')||u.pathname==='/styles.css'||u.pathname==='/farm.js'||u.pathname==='/app.js'||u.pathname==='/app.css'||u.pathname==='/app.webmanifest'){e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const r=await quick(e.request);if(r.ok)await cache.put(e.request,r.clone());return r;}catch{return await cache.match(e.request)||Response.error();}})());}
});
// Phone push (docs/push-design.md). Both senders arrive here: our Web Push JSON {title, body, link, tag, urgent} and
// an FCM message whose fields sit under `data`. The link is an in-app path ('/tasks/x'); anything else opens the app root.
type PushPayload={title?:string;body?:string;link?:string;tag?:string;urgent?:boolean|string};
const appUrl=(link?:string)=>{const l=typeof link==='string'&&link.startsWith('/')&&!link.startsWith('//')?link:'/';return l==='/app'||l.startsWith('/app/')||l==='/admin'||l.startsWith('/admin#')?l:'/app'+(l==='/'?'':l);};
worker.addEventListener('push',e=>{let j:{data?:PushPayload}&PushPayload={};try{j=e.data?.json()||{};}catch{j={body:e.data?.text()||''};}
 const p:PushPayload={...j,...(j.data||{})};const urgent=p.urgent===true||p.urgent==='true';
 e.waitUntil(worker.registration.showNotification(String(p.title||'חוות רווה').slice(0,80),{body:String(p.body||'').slice(0,180),icon:'/assets/app-icon-192.png',badge:'/assets/app-icon-192.png',lang:'he',dir:'rtl',tag:p.tag||undefined,requireInteraction:urgent,data:{url:appUrl(p.link)}}));});
// Focus an open app window and move it to the subject; otherwise open one. The guest page keeps its '/#event-…' urls.
worker.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL(e.notification.data?.url||'/',worker.location.origin);if(url.origin!==worker.location.origin)return;
 e.waitUntil((async()=>{if(isApp(url.pathname)){for(const c of await worker.clients.matchAll({type:'window',includeUncontrolled:true})){const w=c as WindowClient;if(new URL(w.url).origin===url.origin&&isApp(new URL(w.url).pathname)){await w.focus();try{await w.navigate(url.href);}catch{}return;}}}await worker.clients.openWindow(url.href);})());});
