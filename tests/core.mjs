import assert from 'node:assert/strict';import fs from 'node:fs';import {build} from 'esbuild';
await build({entryPoints:['src/cms.ts'],bundle:true,platform:'node',format:'esm',outfile:'.build/cms-test.mjs'});const {defaults,render,validate,fields}=await import('../.build/cms-test.mjs');
assert.deepEqual(validate(defaults),defaults);assert.ok(!render(defaults).includes('sacredbard6'));assert.ok(render(defaults).includes('manifest.webmanifest'));assert.ok(render(defaults).includes('/site.js'));
const d=structuredClone(defaults);d.values[fields.find(f=>f.kind==='text').id]='<script>alert(1)</script>';assert.ok(render(d).includes('&lt;script&gt;'));d.values[fields.find(f=>f.kind==='image').id]='javascript:alert(1)';assert.throws(()=>validate(d));
const event={id:'test',title:'EVENT TEST',description:'test',start:'2000-01-01',end:'2000-01-02',status:'published',archive:true,image:'',notify:true};const events={...defaults,events:[event]};assert.ok(!render(events).includes('<h3>EVENT TEST</h3>'));assert.ok(render(events,true).includes('<h3>EVENT TEST</h3>'));assert.ok(render(events,true).includes('data-calendar="test"'));event.end='2000-02-30';assert.throws(()=>validate(events));
const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest'));for(const icon of manifest.icons)assert.ok(fs.existsSync('public'+icon.src));const hosting=JSON.parse(fs.readFileSync('firebase.json'));assert.ok(!hosting.functions&&!hosting.storage);assert.ok(hosting.hosting.rewrites.every(r=>!r.function));assert.ok(!fs.existsSync('functions'));
const sw=fs.readFileSync('src/sw.ts','utf8');assert.ok(sw.includes("u.pathname.startsWith('/admin')"));assert.ok(!sw.includes('push'));console.log('PASS: static Firebase Spark architecture, PWA assets, escaped content, event expiry/archive/calendar, invalid dates, protected admin cache exclusion.');

// Audit regressions: incomplete drafts, contact configuration and archive semantics.
const draftEvent={id:'audit-draft',title:'',description:'',start:'2030-01-01',end:'2030-01-01',status:'draft',archive:false,image:''};
assert.doesNotThrow(()=>validate({...defaults,events:[draftEvent]}));
assert.throws(()=>validate({...defaults,events:[{...draftEvent,status:'published'}]}));
assert.throws(()=>validate({...defaults,events:[{...draftEvent,id:'bad\nid'}]}));
assert.ok(!render(defaults).includes('id="contact"'));
const contacts=render({...defaults,values:{...defaults.values,contact_phone:'050-1234567',contact_whatsapp:'050-1234567'}});
assert.ok(contacts.includes('tel:0501234567'));assert.ok(contacts.includes('https://wa.me/972501234567'));
assert.throws(()=>validate({...defaults,values:{...defaults.values,contact_phone:'javascript:alert(1)'}}));
const archived=render({...defaults,events:[{...draftEvent,title:'Archive audit',start:'2000-01-01',end:'2000-01-01',status:'published',archive:true}]},true);
assert.ok(archived.includes('<h1>ארכיון אירועים</h1>'));
assert.ok(/<link[^>]*href="https:[^"]+\/events\/archive"[^>]*rel="canonical"/.test(archived));
assert.equal((archived.match(/<time datetime="2000-01-01">/g)||[]).length,1);
assert.ok(render(defaults).includes('data-cms-field="f011"'));
console.log('PASS: audit regression cases');
