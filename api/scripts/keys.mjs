// Manages the API keys: one per person (or assistant), each bound to its actors on the server.
// The registry (hashes and metadata, never the keys themselves) lives in api/.keys.local.json (git-ignored).
// A new key is never printed. It goes where --deliver says:
//   --deliver clipboard            (default) the macOS clipboard, to paste into the assistant's vault; clear it after
//   --deliver env:<file>:<VAR>     a line VAR=<key> in a local, git-ignored file (mode 600), for test keys
//
//   node api/scripts/keys.mjs list
//   node api/scripts/keys.mjs add <credential-id> <actor> [<actor>...] [--expires YYYY-MM-DD] [--deliver ...]
//   node api/scripts/keys.mjs rotate <credential-id> [--grace-minutes N] [--deliver ...]
//        new key, same id and actors. With a grace period the old key keeps working for N minutes, so the
//        client can switch; without one it stops at the next push.
//   node api/scripts/keys.mjs end-grace <credential-id>     the old key stops now (at the next push)
//   node api/scripts/keys.mjs revoke <credential-id>        the key stops working (kept in the registry, disabled)
//   node api/scripts/keys.mjs restore <credential-id>       undo a revoke
//   node api/scripts/keys.mjs push                          uploads the whole registry to the Worker (wrangler secret put)
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
function opt(args, name) { const i = args.indexOf(name); if (i < 0) return { value: undefined, rest: args }; return { value: args[i + 1], rest: args.filter((_, j) => j !== i && j !== i + 1) }; }
/** Hands the key over without it ever reaching a terminal, log or chat. */
function deliver(key, id, how = 'clipboard') {
  if (how === 'clipboard') {
    const r = spawnSync('pbcopy', [], { input: key });
    if (r.status !== 0) die('could not write to the clipboard; use --deliver env:<file>:<VAR>');
    console.log(`the new key for ${id} is on the clipboard: paste it into the assistant's vault, then clear the clipboard`);
    return;
  }
  const m = /^env:(.+):([A-Z][A-Z0-9_]*)$/.exec(how);
  if (!m) die('--deliver is "clipboard" or "env:<file>:<VAR>"');
  const [, file, name] = m;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith(name + '=')) : [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  writeFileSync(file, [...lines, `${name}=${key}`, ''].join('\n'), { mode: 0o600 });
  console.log(`the new key for ${id} was written to ${file} as ${name}`);
}
const die = (m) => { console.error(m); process.exit(1); };

const [cmd, id, ...rest] = process.argv.slice(2);
const list = load();
const find = () => list.find((c) => c.id === id) || die(`no credential "${id}"`);

switch (cmd) {
  case 'list':
    for (const c of list) console.log(`${c.disabled ? 'REVOKED ' : 'active  '} ${c.id.padEnd(22)} ${c.actors.join(', ')}${c.expiresAt ? '  expires ' + c.expiresAt : ''}${c.previousUntil ? '  old key valid until ' + c.previousUntil : ''}  (since ${c.createdAt?.slice(0, 10) || '?'})`);
    break;
  case 'add': {
    const d = opt(rest, '--deliver'); rest.splice(0, rest.length, ...d.rest);
    if (!id || !rest.length) die('usage: add <credential-id> <actor> [<actor>...] [--expires YYYY-MM-DD] [--deliver ...]');
    if (list.some((c) => c.id === id)) die(`"${id}" exists; use rotate`);
    const i = rest.indexOf('--expires');
    const expiresAt = i >= 0 ? new Date(rest[i + 1] + 'T00:00:00+02:00').toISOString() : undefined;
    const actors = rest.filter((_, j) => i < 0 || (j !== i && j !== i + 1));
    if (!actors.every((a) => /^(user:[A-Za-z0-9_-]{1,128}|actor-[a-z-]+)$/.test(a))) die('actors are "user:<uid>" or synthetic "actor-..." ids');
    const { key, sha256 } = newKey();
    list.push({ id, sha256, actors, createdAt: new Date().toISOString(), ...(expiresAt ? { expiresAt } : {}) });
    save(list); deliver(key, id, d.value); console.log(`added ${id}. Run "push" to apply.`);
    break;
  }
  case 'rotate': {
    const c = find();
    const g = opt(rest, '--grace-minutes'); const d = opt(g.rest, '--deliver');
    const { key, sha256 } = newKey();
    if (g.value) { c.previousSha256 = c.sha256; c.previousUntil = new Date(Date.now() + Number(g.value) * 60_000).toISOString(); }
    else { delete c.previousSha256; delete c.previousUntil; }
    c.sha256 = sha256; c.rotatedAt = new Date().toISOString(); delete c.disabled;
    save(list); deliver(key, id, d.value);
    console.log(g.value ? `rotated ${id}; after "push" the old key still works until ${c.previousUntil}` : `rotated ${id}; after "push" the old key stops working`);
    break;
  }
  case 'end-grace': { const c = find(); delete c.previousSha256; delete c.previousUntil; save(list); console.log(`grace ended for ${id}. Run "push" to apply.`); break; }
  case 'revoke': { const c = find(); c.disabled = true; c.revokedAt = new Date().toISOString(); save(list); console.log(`revoked ${id}. Run "push" to apply.`); break; }
  case 'restore': { const c = find(); delete c.disabled; save(list); console.log(`restored ${id}. Run "push" to apply.`); break; }
  case 'push': {
    if (!list.length) die('the registry is empty; refusing to push (it would remove every key)');
    const secret = JSON.stringify(list.map(({ id, sha256, actors, disabled, expiresAt, previousSha256, previousUntil }) => ({ id, sha256, actors, ...(disabled ? { disabled } : {}), ...(expiresAt ? { expiresAt } : {}), ...(previousSha256 && previousUntil ? { previousSha256, previousUntil } : {}) })));
    console.log(`pushing ${list.length} credentials: ${list.map((c) => c.id).join(', ')}`);
    const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'API_CREDENTIALS', '--config', join(here, '..', 'wrangler.toml')], { input: secret, stdio: ['pipe', 'inherit', 'inherit'] });
    process.exit(r.status ?? 1);
  }
  default:
    die('commands: list | add | rotate | end-grace | revoke | restore | push');
}
