import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// The Worker sources use extensionless imports for bundlers.
registerHooks({ resolve(specifier, ctx, next) {
  if (specifier.startsWith('.') && ctx.parentURL?.includes('/api/src/') && !specifier.endsWith('.ts')) {
    const file = specifier + '.ts';
    return next(existsSync(new URL(file, ctx.parentURL)) ? file : specifier + '/index.ts', ctx);
  }
  return next(specifier, ctx);
} });
const { runBackup, downloadBackup, backupCollection, restoreFromBackup, ilDate } = await import('../api/src/backup.ts');
const { Firestore } = await import('../api/src/firestore.ts');

const date = ilDate();
const prefix = `backups/${date}/`;
const manifestKey = prefix + 'manifest.json';
const stateKey = 'console:backup-state';
const doc = (id) => ({ name: `projects/demo/databases/(default)/documents/things/${id}`, fields: {} });
const page = (tag, count = 300) => Array.from({ length: count }, (_, i) => doc(`${tag}-${i}`));

function fixture(t) {
  const objects = new Map(), kv = new Map();
  const env = {
    FIRESTORE_PROJECT_ID: 'demo-backup-test',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
    FILE_BUCKET: {
      async put(key, value) {
        objects.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
      },
      async get(key) {
        if (!objects.has(key)) return null;
        return new Response(objects.get(key));
      },
      async list({ prefix, delimiter }) {
        const keys = [...objects.keys()].filter(k => k.startsWith(prefix));
        return {
          objects: keys.map(key => ({ key })),
          delimitedPrefixes: delimiter ? [...new Set(keys.flatMap(key => {
            const i = key.slice(prefix.length).indexOf(delimiter);
            return i < 0 ? [] : [key.slice(0, prefix.length + i + 1)];
          }))] : [],
          truncated: false,
        };
      },
      async delete(keys) { for (const key of [].concat(keys)) objects.delete(key); },
    },
    TOKEN_KV: {
      async get(key) { return kv.get(key) ?? null; },
      async put(key, value) { kv.set(key, value); },
      async delete(key) { kv.delete(key); },
    },
  };
  let query = () => { throw new Error('unexpected query'); };
  t.mock.method(Firestore.prototype, 'rawQuery', async (...args) => query(...args));
  return {
    env, objects, kv, setQuery(fn) { query = fn; },
    run: () => runBackup(env, { force: true }),
    async names() {
      const text = await (await downloadBackup(env, date)).text();
      return text ? text.trimEnd().split('\n').map(line => JSON.parse(line).name.split('/').at(-1)) : [];
    },
  };
}

test('failed same-day rerun never changes the completed backup; a retry replaces it only after publication', async t => {
  const f = fixture(t);
  f.setQuery(() => [doc('before')]);
  await f.run();
  const old = f.objects.get(manifestKey);
  f.setQuery(() => page('new'));
  assert.equal((await f.run()).done, false);
  assert.equal(f.objects.get(manifestKey), old);
  assert.deepEqual(await f.names(), ['before']);

  f.setQuery(() => [doc('unpublished')]);
  const put = f.env.FILE_BUCKET.put;
  f.env.FILE_BUCKET.put = async (key, value) => {
    if (key === manifestKey) throw new Error('manifest write failed');
    return put(key, value);
  };
  await assert.rejects(f.run(), /manifest write failed/);
  assert.equal(f.objects.get(manifestKey), old);
  assert.deepEqual(await f.names(), ['before']);

  f.env.FILE_BUCKET.put = put;
  f.setQuery(() => [doc('last')]);
  assert.equal((await f.run()).done, true);
  assert.deepEqual(await f.names(), [...page('new').map(d => d.name.split('/').at(-1)), 'last']);
  assert.ok(f.objects.has(JSON.parse(old).partKeys[0]));
});

test('concurrent rerun completions from the same cursor do not overwrite one another’s published pages', async t => {
  const f = fixture(t);
  f.setQuery(() => page('base'));
  assert.equal((await f.run()).done, false);
  const saved = f.kv.get(stateKey);
  const put = f.env.FILE_BUCKET.put;
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  let signal;
  const firstPageWritten = new Promise(resolve => { signal = resolve; });
  f.env.FILE_BUCKET.put = async (key, value) => {
    if (key === manifestKey && JSON.parse(value).partKeys.length === 2 && !f.objects.has(manifestKey)) {
      // Delay the first publication after all its data pages have been stored.
      if (signal) { const notify = signal; signal = null; notify(); await deferred; }
    }
    return put(key, value);
  };
  f.setQuery(() => [doc('winner-a')]);
  const a = f.run();
  await firstPageWritten;
  assert.equal(f.kv.get(stateKey), saved);
  f.setQuery(() => [doc('winner-b')]);
  await f.run();
  assert.equal((await f.names()).at(-1), 'winner-b');
  release();
  await a;
  const names = await f.names();
  assert.equal(names.length, 301);
  assert.equal(names.at(-1), 'winner-a');
  assert.equal(new Set(names).size, names.length);
});

test('legacy backups still restore exact declared parts; incomplete and missing parts fail closed', async t => {
  const f = fixture(t);
  const k = prefix + 'part-0001.ndjson';
  f.objects.set(k, JSON.stringify(doc('original')) + '\n');
  f.objects.set(prefix + 'part-0002.ndjson', JSON.stringify(doc('unpublished')) + '\n');
  await assert.rejects(downloadBackup(f.env, date), /no finished backup/);
  f.objects.set(manifestKey, JSON.stringify({ date, parts: 1 }));
  assert.deepEqual(await f.names(), ['original']);
  assert.equal((await backupCollection(f.env, date, 'things')).total, 1);
  const writes = [];
  const fs = { rawGet: async () => [], commit: async batch => writes.push(...batch) };
  const restored = await restoreFromBackup(f.env, date, ['things/original'], fs);
  assert.equal(restored.restored, 1);
  assert.equal(writes[0].update.name, doc('original').name);

  f.objects.delete(k);
  await assert.rejects(backupCollection(f.env, date, 'things'), /backup part is missing/);
  await assert.rejects(f.names(), /backup part is missing/);
});
