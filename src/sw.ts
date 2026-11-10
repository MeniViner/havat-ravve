/// <reference lib="webworker" />
export {};
const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE='havat-ravve-__BUILD_ID__',OFFLINE='/offline.html';
worker.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([OFFLINE,'/assets/app-icon-192.png','/assets/app-icon-512.png']))));
worker.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('havat-ravve-')&&k!==CACHE)await caches.delete(k);await worker.clients.claim();})()));
worker.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==worker.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/admin')||u.pathname.startsWith('/__/'))return;if(e.request.mode==='navigate')e.respondWith((async()=>{try{return await fetch(e.request);}catch{return await caches.match(OFFLINE)||Response.error();}})());else if(u.pathname.startsWith('/assets/')||u.pathname==='/styles.css')e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const r=await fetch(e.request);if(r.ok)await cache.put(e.request,r.clone());return r;}catch{return await cache.match(e.request)||Response.error();}})());});
worker.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL(e.notification.data?.url||'/',worker.location.origin);if(url.origin!==worker.location.origin)return;e.waitUntil(worker.clients.openWindow(url.href));});
