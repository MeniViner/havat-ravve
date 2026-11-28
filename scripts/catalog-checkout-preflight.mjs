// Verify that pre-existing catalog selections have the same checkout guard as new selections.
// Reads only field masks for event IDs and source references. Never changes a catalog or a sale.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { project: {type:'string'}, 'initialize-guards': {type:'boolean'} } });
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const project = values.project || (emulator ? 'demo-havat-ravve' : '');
if (!/^[a-z][a-z0-9-]{3,62}$/.test(project) || (emulator && !/^(localhost|127\.0\.0\.1):\d+$/.test(emulator))) {
  throw Error('Pass --project or set a loopback Firestore emulator.');
}
const base = (emulator ? 'http://'+emulator : 'https://firestore.googleapis.com')+'/v1/projects/'+project+'/databases/(default)/documents';
let credential = emulator ? 'owner' : process.env.ACCESS_TOKEN;
if (!credential) {
  const { GoogleAuth } = await import('google-auth-library');
  credential = await new GoogleAuth({scopes:['https://www.googleapis.com/auth/datastore']}).getAccessToken();
}
const headers = {authorization:'Bearer '+credential, 'content-type':'application/json'};
async function read(path, missing = false) {
  const r = await fetch(base+'/'+path,{headers});
  if (r.status===404 && missing) return null;
  if (!r.ok) throw Error('Firestore read returned '+r.status);
  return r.json();
}
async function* list(path, fields) {
  let token='';
  do {
    const params = new URLSearchParams({pageSize:'250'});
    for (const field of fields) params.append('mask.fieldPaths',field);
    if (token) params.set('pageToken',token);
    const page=await read(path+'?'+params);
    yield* page.documents || [];
    token=page.nextPageToken || '';
  } while(token);
}
let events=0, linkedEvents=0, missing=0, initialized=0, invalid=0;
const validId = (field) => typeof field?.stringValue === 'string' && field.stringValue.length > 0 && !field.stringValue.includes('/');
for await (const event of list('events',['__name__'])) {
  events++;
  const eid=encodeURIComponent(event.name.split('/').at(-1));
  let linked=false;
  for await (const line of list('events/'+eid+'/products',['catalogId','catalogProductId'])) {
    const f=line.fields || {};
    if (!f.catalogId && !f.catalogProductId) continue;
    if (!validId(f.catalogId) || !validId(f.catalogProductId)) invalid++;
    linked=true;
  }
  if (!linked) continue;
  linkedEvents++;
  const path='events/'+eid+'/stall_config/catalog';
  const marker=await read(path+'?mask.fieldPaths=enabled',true);
  if (marker?.fields?.enabled?.booleanValue===true) continue;
  missing++;
  if (values['initialize-guards']) {
    const write={
      update:{name:event.name+'/stall_config/catalog', fields:{enabled:{booleanValue:true}}},
      updateMask:{fieldPaths:['enabled']},
      currentDocument:marker?{updateTime:marker.updateTime}:{exists:false}
    };
    const r=await fetch(base+':commit',{method:'POST',headers,body:JSON.stringify({writes:[write]})});
    if (!r.ok && r.status!==409 && r.status!==412) throw Error('Guard initialization returned '+r.status);
    const verified=await read(path+'?mask.fieldPaths=enabled',true);
    if (verified?.fields?.enabled?.booleanValue!==true) throw Error('Checkout guard not confirmed');
    initialized++;
  }
}
console.log(JSON.stringify({events,linkedEvents,missingGuards:missing,initialized,invalidReferences:invalid}));
if (invalid || missing>initialized) process.exitCode=2;
