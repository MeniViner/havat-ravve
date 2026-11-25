import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Bundle the Worker and its backup modules once, so the tests and scheduler use the same Firestore class.
const bundled = await build({
  stdin: {
    contents: `export * from './api/src/backup';
      export { history } from './api/src/data';
      export { Firestore } from './api/src/firestore';
      export { meter } from './api/src/meter';
      export { default as worker } from './api/src/index';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { runBackup, downloadBackup, backupCollection, restoreFromBackup, listBackups, lastBackup, pruneBackups,
  ilDate, history, Firestore, meter, worker } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));

const catalogKey = 'backups/catalog.json';
const stateKey = 'console:backup-state';
const lastKey = 'console:backup-last';
const indexKey = 'console:backup-index';
const root = 'projects/demo-backup-test/databases/(default)/documents';
const path = 'things/target';
const prefix = (date = ilDate()) => `backups/${date}/`;
const manifestKey = (date = ilDate()) => prefix(date) + 'manifest.json';
const partKey = (date, page) => prefix(date) + 'part-' + String(page).padStart(4, '0') + '.ndjson';
const doc = (id, updateTime) => ({ name: root + '/things/' + id, fields: { title: { stringValue: id } }, updateTime });
const page = (tag, count = 300) => Array.from({ length: count }, (_, i) => doc(`${tag}-${i}`));
const ndjson = (docs) => docs.length ? docs.map((d) => JSON.stringify(d)).join('\n') + '\n' : '';
const summary = (date, docs, bytes, parts) => ({ date, docs, bytes, parts, startedAt: date + 'T03:00:01Z', finishedAt: date + 'T03:00:02Z', by: 'fixture', collections: { things: docs } });

function fixture(t, { mockQuery = true } = {}) {
  const objects = new Map(), revisions = new Map(), kv = new Map();
  const calls = { kv: 0, r2: 0, fetch: 0, reads: 0 };
  let revision = 1;
  const tick = (service) => { calls[service]++; };
  const env = {
    FIRESTORE_PROJECT_ID: 'demo-backup-test',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
    FILE_BUCKET: {
      async put(key, value, { onlyIf } = {}) {
        tick('r2');
        if (onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null;
        if (onlyIf?.etagMatches && revisions.get(key) !== onlyIf.etagMatches) return null;
        const etag = 'rev-' + revision++;
        revisions.set(key, etag);
        objects.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
        return { etag };
      },
      async get(key) {
        tick('r2'); tick('reads');
        if (!objects.has(key)) return null;
        const value = objects.get(key);
        return Object.assign(new Response(value), { size: Buffer.byteLength(value), etag: revisions.get(key) });
      },
      async list({ prefix = '', delimiter, limit = 1000 }) {
        tick('r2'); tick('reads');
        const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort();
        const delimitedPrefixes = [];
        const found = [];
        for (const key of keys) {
          const end = delimiter ? key.slice(prefix.length).indexOf(delimiter) : -1;
          if (end < 0) found.push({ key, size: Buffer.byteLength(objects.get(key)) });
          else delimitedPrefixes.push(key.slice(0, prefix.length + end + 1));
        }
        return { objects: found.slice(0, limit), delimitedPrefixes: [...new Set(delimitedPrefixes)], truncated: found.length > limit };
      },
      async delete(keys) {
        tick('r2');
        for (const key of [].concat(keys)) { objects.delete(key); revisions.delete(key); }
      },
    },
    TOKEN_KV: {
      async get(key) { tick('kv'); return kv.get(key) ?? null; },
      async put(key, value) { tick('kv'); kv.set(key, value); },
      async delete(key) { tick('kv'); kv.delete(key); },
    },
  };
  let query = () => { throw new Error('unexpected query'); };
  if (mockQuery) t.mock.method(Firestore.prototype, 'rawQuery', async (...args) => query(...args));
  return {
    env, objects, kv, calls, setQuery(fn) { query = fn; },
    run: () => runBackup(env, { force: true }),
    catalog: () => JSON.parse(objects.get(catalogKey)),
    manifest(date = ilDate()) { return JSON.parse(objects.get(this.catalog().items.find((m) => m.date === date).manifestKey)); },
    async names(date = ilDate()) {
      const text = await (await downloadBackup(env, date)).text();
      return text ? text.trimEnd().split('\n').map((line) => JSON.parse(line).name.split('/').at(-1)) : [];
    },
    async numbered(date, pages) {
      const bodies = pages.map(ndjson);
      const m = summary(date, pages.flat().length, bodies.reduce((total, body) => total + Buffer.byteLength(body), 0), pages.length);
      for (const [i, body] of bodies.entries()) await env.FILE_BUCKET.put(partKey(date, i + 1), body);
      await env.FILE_BUCKET.put(manifestKey(date), JSON.stringify(m));
      return m;
    },
  };
}

function fsFixture(now = []) {
  const writes = [], trash = [];
  const fs = { root, rawGet: async () => now, query: async () => [], commit: async (batch) => writes.push(...batch),
    trash: { put: async (records) => trash.push(...records) } };
  return { fs, writes, trash };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { resolve, promise };
}

test('same-day repeat stays unpublished through a failed catalog write', async (t) => {
  const f = fixture(t);
  f.setQuery(() => [doc('before')]);
  await f.run();
  const old = f.catalog().items[0];
  const oldPart = f.manifest().partKeys[0];
  f.setQuery(() => page('new'));
  assert.equal((await f.run()).done, false);
  assert.deepEqual(await f.names(), ['before']);

  f.setQuery(() => [doc('unpublished')]);
  const put = f.env.FILE_BUCKET.put;
  f.env.FILE_BUCKET.put = async (key, ...args) => {
    if (key === catalogKey) throw new Error('catalog write failed');
    return put(key, ...args);
  };
  await assert.rejects(f.run(), /catalog write failed/);
  assert.deepEqual(f.catalog().items[0], old);
  assert.deepEqual(await f.names(), ['before']);

  f.env.FILE_BUCKET.put = put;
  f.setQuery(() => [doc('last')]);
  assert.equal((await f.run()).done, true);
  assert.deepEqual(await f.names(), [...page('new').map((d) => d.name.split('/').at(-1)), 'last']);
  assert.ok(f.objects.has(oldPart));
});

test('overlapping completions publish only the winner and keep last, manifest, and index on the same snapshot', async (t) => {
  const f = fixture(t);
  f.kv.set(indexKey, '[]');
  f.setQuery(() => page('base'));
  assert.equal((await f.run()).done, false);
  const put = f.env.FILE_BUCKET.put, waiting = deferred(), release = deferred();
  let delay = true;
  f.env.FILE_BUCKET.put = async (key, value, options) => {
    if (key === catalogKey && delay) {
      delay = false;
      waiting.resolve();
      await release.promise;
    }
    return put(key, value, options);
  };
  f.setQuery(() => [doc('stale-completion')]);
  const stale = f.run();
  await waiting.promise;
  f.setQuery(() => [doc('winner'), doc('another')]);
  assert.equal((await f.run()).docs, 302);
  release.resolve();
  assert.equal((await stale).docs, 302);
  const names = await f.names();
  assert.equal(names.length, 302);
  assert.deepEqual(names.slice(-2), ['winner', 'another']);
  assert.equal(new Set(names).size, names.length);
  const { partKeys, ...expected } = f.manifest();
  assert.equal(partKeys.length, 2);
  assert.deepEqual(await lastBackup(f.env), expected);
  assert.deepEqual(await listBackups(f.env), { items: [expected], running: null });
  assert.equal(f.kv.get(indexKey), '[]');
  assert.equal(f.kv.get(lastKey), undefined);
  assert.ok(!f.objects.get(catalogKey).includes('partKeys'));
});

test('a legacy cursor is never resumed by the immutable writer; old pages stay intact', async (t) => {
  const f = fixture(t);
  const today = ilDate();
  const old = await f.numbered(today, [[doc('available')]]);
  f.kv.set(indexKey, JSON.stringify([old]));
  f.kv.set(lastKey, JSON.stringify(old));
  const legacy = JSON.stringify({ date: today, startedAt: new Date().toISOString(), cursor: doc('old-300').name, part: 1, docs: 300, bytes: 1000, collections: {}, by: 'cron' });
  f.kv.set(stateKey, legacy);
  f.setQuery((q) => {
    assert.equal(q.startAt, undefined);
    return page('new');
  });
  assert.equal((await f.run()).done, false);
  assert.deepEqual(await f.names(), ['available']);
  f.setQuery((q) => {
    assert.equal(q.startAt.values[0].referenceValue, doc('new-299').name);
    return [doc('finished')];
  });
  assert.equal((await f.run()).done, true);
  assert.equal((await f.names()).length, 301);
  assert.equal(f.objects.get(partKey(today, 1)), ndjson([doc('available')]));
  assert.equal(f.kv.get(stateKey), legacy);
});

test('reader-first mode writes numbered parts; paused mode can read both formats', async (t) => {
  const f = fixture(t);
  const dayOne = ilDate();
  f.env.BACKUP_WRITE_FORMAT = 'legacy';
  f.setQuery(() => [doc('numbered')]);
  await f.run();
  assert.ok(f.objects.has(partKey(dayOne, 1)));
  assert.deepEqual(await f.names(), ['numbered']);
  f.setQuery(() => assert.fail('must leave completed numbered backup alone'));
  assert.equal((await f.run()).done, true);
  assert.equal((await lastBackup(f.env)).date, dayOne);

  t.mock.timers.enable({ apis: ['Date'], now: new Date(Date.now() + 86400_000) });
  delete f.env.BACKUP_WRITE_FORMAT;
  f.setQuery(() => [doc('immutable')]);
  await f.run();
  f.env.BACKUP_WRITE_FORMAT = 'paused';
  await assert.rejects(f.run(), /writing is paused/);
  assert.equal(await runBackup(f.env), null);
  assert.deepEqual(await f.names(dayOne), ['numbered']);
  assert.deepEqual(await f.names(), ['immutable']);
  assert.equal((await listBackups(f.env)).items.length, 2);
});

test('numbered reads and restores use only published pages; a missing or invalid later page fails before any write', async (t) => {
  const f = fixture(t);
  const day = ilDate();
  await f.env.FILE_BUCKET.put(partKey(day, 2), ndjson([doc('unpublished')]));
  await assert.rejects(downloadBackup(f.env, day), /no finished backup/);
  await f.numbered(day, [[doc('target')]]);
  assert.deepEqual(await f.names(), ['target']);
  assert.equal((await backupCollection(f.env, day, 'things')).total, 1);
  const { fs, writes, trash } = fsFixture([doc('target')]);
  assert.equal((await restoreFromBackup(f.env, day, [path], fs)).restored, 1);
  assert.equal(writes[0].update.name, doc('target').name);
  assert.equal(trash.length, 1);
  writes.length = trash.length = 0;
  await f.numbered(day, [[doc('target')], [doc('second')]]);
  f.objects.delete(partKey(day, 2));
  await assert.rejects(downloadBackup(f.env, day), /backup part is missing/);
  await assert.rejects(restoreFromBackup(f.env, day, [path], fs), /backup part is missing/);
  assert.equal(writes.length + trash.length, 0);
  await f.env.FILE_BUCKET.put(partKey(day, 2), '{something malformed}\n');
  await assert.rejects(restoreFromBackup(f.env, day, [path], fs), /invalid backup record/);
  assert.equal(writes.length + trash.length, 0);
  await f.env.FILE_BUCKET.put(partKey(day, 2), ndjson([{ ...doc('invalid-value'), fields: { invalid: { inventedValue: true } } }]));
  await assert.rejects(restoreFromBackup(f.env, day, [path], fs), /invalid backup record/);
  assert.equal(writes.length + trash.length, 0);
});

test('missing immutable part fails download before headers and also fails restore before any writes', async (t) => {
  const f = fixture(t);
  f.setQuery(() => page('first'));
  await f.run();
  f.setQuery(() => [doc('target')]);
  await f.run();
  f.objects.delete(f.manifest().partKeys[0]);
  await assert.rejects(downloadBackup(f.env, ilDate()), /backup part is missing/);
  await assert.rejects(lastBackup(f.env), /backup part is missing/);
  const { fs, writes, trash } = fsFixture();
  await assert.rejects(restoreFromBackup(f.env, ilDate(), [path], fs), /backup part is missing/);
  assert.equal(writes.length + trash.length, 0);
});

test('history resolves previous and new formats; missing or invalid snapshots are unavailable, complete absence is distinct', async (t) => {
  const f = fixture(t);
  const days = Array.from({ length: 5 }, (_, i) => ilDate(new Date(Date.now() - i * 86400_000)));
  const [day, missingPart, badManifest, missingManifest, retained] = days;
  const d = doc('target', day + 'T01:00:00Z');
  f.setQuery(() => [d]);
  await f.run();
  const old = [];
  const lost = await f.numbered(missingPart, [[d], [doc('later')]]);
  f.objects.delete(partKey(missingPart, 2));
  old.push(lost);
  old.push(await f.numbered(badManifest, [[d]]));
  f.objects.set(manifestKey(badManifest), JSON.stringify({ date: badManifest, parts: 0 }));
  old.push(summary(missingManifest, 0, 0, 0));
  old.push(await f.numbered(retained, [[doc('someone-else')]]));
  f.kv.set(indexKey, JSON.stringify(old));
  const { fs } = fsFixture([d]);
  const h = await history(f.env, fs, path, 5);
  assert.deepEqual(h.versions.map(({ from, fields, gone, unavailable }) => [from, fields?.title, gone || false, unavailable || false]), [
    [day, 'target', false, false],
    [missingPart, undefined, false, true],
    [badManifest, undefined, false, true],
    [missingManifest, undefined, false, true],
    [retained, undefined, true, false],
  ]);
  assert.equal(h.days, 2);
  assert.equal(h.truncated, false);
  f.calls.reads = 0;
  assert.deepEqual((await history(f.env, fs, path, 0)).versions, []);
  assert.equal(f.calls.reads, 0);
});

test('history also reads the single-manifest immutable format, but ignores unpublished pages', async (t) => {
  const f = fixture(t);
  const date = ilDate();
  const document = doc('target');
  const key = prefix(date) + 'pages/' + crypto.randomUUID() + '.page';
  const body = ndjson([document]);
  await f.env.FILE_BUCKET.put(key, body);
  const { fs } = fsFixture();
  assert.deepEqual((await history(f.env, fs, path)).versions, []);
  const m = { ...summary(date, 1, Buffer.byteLength(body), 1), partKeys: [key] };
  await f.env.FILE_BUCKET.put(manifestKey(date), JSON.stringify(m));
  assert.equal((await history(f.env, fs, path)).versions[0].fields.title, 'target');
  assert.deepEqual(await f.names(), ['target']);
  const restored = await restoreFromBackup(f.env, date, [path], fs);
  assert.equal(restored.restored, 1);
});

test('history stays inside 40 R2 reads even when the legacy index is missing', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 40; i++) {
    const d = ilDate(new Date(Date.now() - i * 86400_000));
    await f.numbered(d, [[doc('target', d + 'T00:00:00Z')]]);
  }
  const { fs } = fsFixture();
  const h = await history(f.env, fs, path, 30);
  assert.equal(h.truncated, true);
  assert.equal(h.days, 19);
  assert.equal(f.calls.reads, 40);
});

test('bounded retention withdraws then deletes expired pages and keeps the only published backup intact', async (t) => {
  const f = fixture(t);
  const today = Date.now();
  const oldest = ilDate(new Date(today - 400 * 86400_000));
  const abandoned = ilDate(new Date(today - 9 * 86400_000));
  t.mock.timers.enable({ apis: ['Date'], now: new Date(today - 400 * 86400_000) });
  f.setQuery(() => [doc('old')]);
  await f.run();
  const oldKey = f.manifest(oldest).partKeys[0];
  await f.env.FILE_BUCKET.put(prefix(abandoned) + 'pages/abandoned.page', 'incomplete');
  t.mock.timers.setTime(today);
  assert.equal((await pruneBackups(f.env)).pruned, 1);
  assert.ok(f.objects.has(oldKey));
  assert.ok(!f.objects.has(prefix(abandoned) + 'pages/abandoned.page'));
  for (let i = 31; i >= 0; i--) {
    t.mock.timers.setTime(today - i * 86400_000);
    f.setQuery(() => [doc('later-' + i)]);
    await f.run();
  }
  // First-of-month anchors count as well. Seed thirteen months with newer anchors so the oldest month expires.
  for (let i = 1; i <= 12; i++) {
    const d = new Date(today);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    t.mock.timers.setTime(d.getTime());
    f.setQuery(() => [doc('monthly-' + i)]);
    await f.run();
  }
  t.mock.timers.setTime(today);
  const before = f.calls.r2 + f.calls.kv;
  await pruneBackups(f.env);
  assert.ok(f.calls.r2 + f.calls.kv - before <= 10);
  assert.ok(f.objects.has(oldKey));
  await assert.rejects(downloadBackup(f.env, oldest), /no finished backup/);
  await pruneBackups(f.env);
  assert.ok(!f.objects.has(oldKey));
  assert.deepEqual(await f.names(), ['later-0']);
  for (let i = 0; i < 8; i++) await pruneBackups(f.env);
  assert.ok(!f.objects.has(prefix(abandoned) + 'pages/abandoned.page'));
});

test('upkeep accounts for every KV, R2 and Firestore subrequest on a publish and retention run', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T07:02:00Z') });
  const f = fixture(t, { mockQuery: false });
  f.kv.set('console:cron-last', '{}');
  const oldDay = '2026-08-01';
  const key = prefix(oldDay) + 'pages/abandoned.page';
  await f.env.FILE_BUCKET.put(key, 'unfinished');
  await f.env.FILE_BUCKET.put('trash/2026-07-01/fixture.json', '{}');
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(String(url).startsWith('http://127.0.0.1:1/'));
    f.calls.fetch++;
    return Response.json(String(url).includes(':runQuery') ? [{ document: doc('target') }] : {});
  });
  f.kv.set('console:cleanup', JSON.stringify({ date: ilDate(), done: true }));
  t.mock.method(console, 'log', () => {});
  const before = f.calls.r2 + f.calls.kv;
  await worker.scheduled({ cron: '2-59/5 * * * *', scheduledTime: Date.now() }, f.env);
  const round = JSON.parse(f.kv.get('console:cron-last')).rounds.at(-1);
  assert.equal(round.used, f.calls.r2 + f.calls.kv + f.calls.fetch - before);
  assert.ok(round.used <= 50);
  assert.ok(!f.objects.has(key));
  assert.ok(!f.objects.has('trash/2026-07-01/fixture.json'));
  assert.equal((await lastBackup(f.env)).date, ilDate());

  const counted = meter(f.env, 3);
  await counted.env.TOKEN_KV.get('missing');
  await counted.env.FILE_BUCKET.get('missing');
  await counted.env.FETCH('http://127.0.0.1:1/');
  const stopped = f.calls.r2 + f.calls.kv + f.calls.fetch;
  assert.throws(() => counted.env.FILE_BUCKET.list({}), /subrequest budget exhausted/);
  assert.equal(f.calls.r2 + f.calls.kv + f.calls.fetch, stopped);
});

test('workerd R2 accepts conditional catalog replacement without losing prior pages', async (t) => {
  const f = fixture(t);
  const mf = new Miniflare({ workers: [{
    config: {
      name: 'backup-test', compatibilityDate: '2026-11-01',
      manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch: () => new Response() }' } } },
      env: { TEST_BACKUPS: { type: 'r2' } },
    },
  }] });
  t.after(() => mf.dispose());
  f.env.FILE_BUCKET = await mf.getR2Bucket('TEST_BACKUPS');
  f.setQuery(() => [doc('previous')]);
  assert.equal((await f.run()).done, true);
  const old = await f.env.FILE_BUCKET.get(catalogKey);
  assert.equal(await f.env.FILE_BUCKET.put(catalogKey, '{}', { onlyIf: { etagDoesNotMatch: '*' } }), null);
  f.setQuery(() => page('replacement'));
  assert.equal((await f.run()).done, false);
  assert.deepEqual(await f.names(), ['previous']);
  f.setQuery(() => [doc('committed')]);
  assert.equal((await f.run()).done, true);
  assert.equal(await f.env.FILE_BUCKET.put(catalogKey, await old.text(), { onlyIf: { etagMatches: old.etag } }), null);
  assert.equal((await f.names()).at(-1), 'committed');
});
