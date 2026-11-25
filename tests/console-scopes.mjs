import assert from 'node:assert/strict';
import { build } from 'esbuild';

await build({ stdin: {
  contents: "export * from './src/console/scopes'; export { ALL_SCOPES } from './api/src/auth';",
  resolveDir: process.cwd(), loader: 'ts',
}, bundle: true, platform: 'node', format: 'esm', outfile: '.build/console-scopes.mjs' });
const { ALL_SCOPES, DESK_AREAS, deskExtraLabels, deskLevels, deskScopes, scopesShort } = await import('../.build/console-scopes.mjs');

const grouped = DESK_AREAS.flatMap((a) => [...a.read, ...a.write, ...(a.existingOnly ?? [])]);
assert.deepEqual(grouped.sort(), [...ALL_SCOPES].sort(), 'Every server scope must belong to exactly one desktop area');

for (const area of DESK_AREAS.filter((a) => a.existingOnly?.length)) {
  const unrelated = 'settings:read';
  const edit = (before, level) => deskScopes(before, { ...deskLevels(before), [area.id]: level });
  const before = [...area.existingOnly, unrelated];
  assert.equal(deskLevels(before)[area.id], 'write', 'A granular write alone must make its area visible');
  assert.match(scopesShort(area.existingOnly, ''), new RegExp(area.short ?? area.he));
  assert.equal(deskExtraLabels(area, before).length, area.existingOnly.length);
  assert.deepEqual(deskScopes(before, deskLevels(before)), [...before].sort(), 'No changes preserve the exact grant');
  assert.deepEqual(edit(before, 'none'), [unrelated]);
  assert.deepEqual(edit(before, 'read'), [...area.read, unrelated].sort());
  assert.deepEqual(edit([unrelated], 'write'), [...area.read, ...area.write, unrelated].sort(), 'Coarse write must not add granular privileges');
  assert.deepEqual(deskScopes(null, { [area.id]: 'write' }), [...area.read, ...area.write].sort(), 'New limited keys do not get granular privileges');
}
console.log('PASS: desktop key grants cover all scopes without leaking or adding granular writes');
