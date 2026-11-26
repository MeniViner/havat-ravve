import assert from 'node:assert/strict';
import {
  quality,
  sections,
  geometryOf,
  chunked,
  connectionCurrent,
  hasLine,
  unpack,
} from '../src/app/survey/model.ts';
const at = 1720000000000,
  p = { lat: 50, lng: 10, at, accuracy: 6 };
assert.equal(quality(null, at), 'missing');
assert.equal(quality({ ...p, lat: 91 }, at), 'missing');
assert.equal(quality(p, at), 'fresh');
assert.equal(quality({ ...p, accuracy: null }, at), 'weak');
assert.equal(quality({ ...p, accuracy: 21 }, at), 'weak');
assert.equal(quality(p, at + 15001), 'stale');
const points = Array.from({ length: 1300 }, (_, i) => ({
  ...p,
  seq: i + 1,
  segment: i < 10 ? 1 : 2,
  quality: 'ok',
  provider: 'gps',
  mock: 0,
}));
const vertices = geometryOf(points);
assert.ok(!('accuracy' in vertices[0]));
assert.deepEqual(
  sections(vertices.filter((v) => v.seq !== 12)).map((s) => s.length),
  [10, 1, 1288]
);
assert.equal(hasLine([vertices[9], vertices[10]]), false);
const chunks = chunked(vertices).map((points, index) => ({ points, index }));
assert.ok(chunks.every((c) => c.points.length <= 128));
assert.equal(chunks.length, 11);
assert.deepEqual(unpack({ count: 1300, chunks: 11 }, chunks), vertices);
assert.equal(unpack({ count: 1300, chunks: 11 }, chunks.slice(1)), null);
assert.equal(unpack({ count: 1, chunks: 1 }, [{ index: 0, points: [{ ...vertices[0], lng: Infinity }] }]), null);
const c = { target: 'place', targetId: 'gate', lat: 50, lng: 10, at: 2, mode: 'walk' };
assert.ok(connectionCurrent(c, [{ id: 'gate', ...p }], []));
assert.ok(!connectionCurrent(c, [{ id: 'gate', ...p, lng: 11 }], []));
assert.ok(!connectionCurrent(c, [{ id: 'gate', ...p, archived: true }], []));
const link = { ...c, target: 'trail', targetGeometry: 'g1' },
  t = { id: 'gate', geometry: 'g1', status: 'confirmed', modes: ['walk'] };
assert.ok(connectionCurrent(link, [], [t]));
assert.ok(!connectionCurrent(link, [], [{ ...t, geometry: 'g2' }]));
assert.ok(!connectionCurrent({ ...link, mode: 'vehicle' }, [], [t]));
console.log('PASS survey accuracy, gaps, corrections, versioned entrances and 1,300-point chunk round-trip');
