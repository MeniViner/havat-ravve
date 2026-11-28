import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const folder = await mkdtemp(path.join(tmpdir(), 'farm-event-share-'));
const module = path.join(folder, 'share.mjs');
const origin = 'https://havat-ravve-api.meniviner.workers.dev';
const fixture = {
  published: true, title: 'יריד "אביב" & קפה', shareWords: 'פתוח למשפחות',
  image: 'data:image/png;base64,iVBORw0KGgo=', privateNotes: 'הערה פנימית',
};
let reads = 0;
const database = createServer(async (req, res) => {
  assert.equal(req.method, 'POST');
  assert.match(req.url, /:batchGet$/);
  let body = '';
  for await (const chunk of req) body += chunk;
  const { documents:[name], mask } = JSON.parse(body);
  assert.deepEqual(mask.fieldPaths.toSorted(), ['image','published','shareWords','title']);
  const fields = Object.fromEntries(mask.fieldPaths.filter(k => k in fixture).map(k => [k, typeof fixture[k] === 'boolean' ? {booleanValue:fixture[k]} : {stringValue:fixture[k]}]));
  reads++;
  res.writeHead(200, {'content-type':'application/json'});
  res.end(JSON.stringify(name.endsWith('/missing') ? [{missing:name}] : [{found:{name, fields, updateTime:'2026-11-27T00:00:00Z'}}]));
});
try {
  await build({ entryPoints:['api/src/v2/eventShare.ts'], outfile:module, bundle:true, platform:'node', format:'esm', logLevel:'silent' });
  const { publicEventShare } = await import(pathToFileURL(module).href);
  await new Promise(resolve => database.listen(0,'127.0.0.1',resolve));
  const env = {FIRESTORE_PROJECT_ID:'demo-event-share', FIRESTORE_EMULATOR_HOST:'127.0.0.1:' + database.address().port};
  const get = (id='spring', suffix='', method='GET') => publicEventShare(new Request(origin+'/v1/events/'+encodeURIComponent(id)+'/share'+suffix,{method}),env,id);
  let response = await get();
  assert.equal(response.status,200);
  const page = await response.text();
  assert.match(page,/property="og:title" content="חוות רווה · יריד &quot;אביב&quot; &amp; קפה · פתוח למשפחות"/);
  assert.match(page,/property="og:image" content="https:[^"]+\/spring\/share\?image=1"/);
  assert(!page.includes(fixture.privateNotes));
  const script = page.match(/<script>(.*?)<\/script>/s)[1];
  assert(response.headers.get('content-security-policy').includes(createHash('sha256').update(script).digest('base64')));
  assert.equal(await (await get('spring','','HEAD')).text(),'');
  const image = await get('spring','?image=1');
  assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('hex'),'89504e470d0a1a0a');
  fixture.image=origin+'/v1/files/event/person/'+ 'A'.repeat(32) +'.webp';
  assert((await (await get()).text()).includes('property="og:image" content="'+fixture.image+'"'));
  fixture.image=''; delete fixture.shareWords;
  const legacy=await (await get()).text();assert(!legacy.includes('property="og:image"'));assert(!legacy.includes('undefined'));
  fixture.published=false;
  assert.equal((await get()).status,404);assert.equal((await get('spring','?image=1')).status,404);assert.equal((await get('missing')).status,404);
  const before=reads;assert.equal((await get('spring','','POST')).status,405);assert.equal((await get('bad/id')).status,404);assert.equal(reads,before);
  console.log('Public event title, optional wording, stored and inline photos, guest destination, HEAD, drafts and old events passed.');
} finally {
  if(database.listening) await new Promise(resolve=>database.close(resolve));
  await rm(folder,{recursive:true,force:true});
}
