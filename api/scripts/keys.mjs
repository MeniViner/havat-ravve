// Manages the API keys: one per person (or assistant), each bound to its actors on the server.
// The registry (hashes and metadata, never the keys themselves) lives in api/.keys.local.json (git-ignored).
// A new key is printed once, to stderr; store it in the person's assistant vault, never in git or chat.
//
//   node api/scripts/keys.mjs list
//   node api/scripts/keys.mjs add <credential-id> <actor> [<actor>...] [--expires YYYY-MM-DD]
//   node api/scripts/keys.mjs rotate <credential-id>        new key, same id and actors; the old key stops working
//   node api/scripts/keys.mjs revoke <credential-id>        the key stops working (kept in the registry, disabled)
//   node api/scripts/keys.mjs restore <credential-id>       undo a revoke
//   node api/scripts/keys.mjs push                          uploads the registry to the Worker (wrangler secret put)
//
// Actors: "user:<uid>" for a real person (name and role come from their profile in the app), or a synthetic
// test actor. Changes take effect only after "push".
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, '..', '.keys.local.json');
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []);
const save = (list) => writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
const newKey = () => { const key = 'hr_' + randomBytes(32).toString('base64url'); return { key, sha256: createHash('sha256').update(key).digest('hex') }; };
const show = (key, id) => { console.error(`\nAPI key for ${id} (shown once; put it in the assistant's vault):\n${key}\n`); };
const die = (m) => { console.error(m); process.exit(1); };

const [cmd, id, ...rest] = process.argv.slice(2);
const list = load();
const find = () => list.find((c) => c.id === id) || die(`no credential "${id}"`);

switch (cmd) {
  case 'list':
    for (const c of list) console.log(`${c.disabled ? 'REVOKED ' : 'active  '} ${c.id.padEnd(22)} ${c.actors.join(', ')}${c.expiresAt ? '  expires ' + c.expiresAt : ''}  (since ${c.createdAt?.slice(0, 10) || '?'})`);
    break;
  case 'add': {
    if (!id || !rest.length) die('usage: add <credential-id> <actor> [<actor>...] [--expires YYYY-MM-DD]');
    if (list.some((c) => c.id === id)) die(`"${id}" exists; use rotate`);
    const i = rest.indexOf('--expires');
    const expiresAt = i >= 0 ? new Date(rest[i + 1] + 'T00:00:00+02:00').toISOString() : undefined;
    const actors = rest.filter((_, j) => i < 0 || (j !== i && j !== i + 1));
    if (!actors.every((a) => /^(user:[A-Za-z0-9_-]{1,128}|actor-[a-z-]+)$/.test(a))) die('actors are "user:<uid>" or synthetic "actor-..." ids');
    const { key, sha256 } = newKey();
    list.push({ id, sha256, actors, createdAt: new Date().toISOString(), ...(expiresAt ? { expiresAt } : {}) });
    save(list); show(key, id); console.log(`added ${id}. Run "push" to apply.`);
    break;
  }
  case 'rotate': {
    const c = find(); const { key, sha256 } = newKey();
    c.sha256 = sha256; c.rotatedAt = new Date().toISOString(); delete c.disabled;
    save(list); show(key, id); console.log(`rotated ${id}. Run "push" to apply; the old key works until then.`);
    break;
  }
  case 'revoke': { const c = find(); c.disabled = true; c.revokedAt = new Date().toISOString(); save(list); console.log(`revoked ${id}. Run "push" to apply.`); break; }
  case 'restore': { const c = find(); delete c.disabled; save(list); console.log(`restored ${id}. Run "push" to apply.`); break; }
  case 'push': {
    const secret = JSON.stringify(list.map(({ id, sha256, actors, disabled, expiresAt }) => ({ id, sha256, actors, ...(disabled ? { disabled } : {}), ...(expiresAt ? { expiresAt } : {}) })));
    const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'API_CREDENTIALS', '--config', join(here, '..', 'wrangler.toml')], { input: secret, stdio: ['pipe', 'inherit', 'inherit'] });
    process.exit(r.status ?? 1);
  }
  default:
    die('commands: list | add | rotate | revoke | restore | push');
}
