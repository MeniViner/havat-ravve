import assert from 'node:assert/strict';
import {
  surveyMetrics,
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

const measured = (seq, lng, segment = 1) => ({...p, seq, lng, at:at+seq*1000,segment,quality:'ok'});
const metrics = surveyMetrics([measured(1,10),measured(2,10.0001),measured(3,11,2)]);
assert.equal(metrics.seconds,1);
assert.ok(metrics.meters>6 && metrics.meters<8);
const {validHome, publicPlace, centeredTab} = await import('../shared/farm-map.ts');
assert.ok(validHome({lat:0,lng:0,zoom:0}));
for (const zoom of [-1,20,3.5,Infinity]) assert.equal(validHome({lat:31,lng:35,zoom}),false);
assert.equal(validHome({lat:89,lng:0,zoom:15}),false);
assert.deepEqual(centeredTab(['events','stall'],'map'),['events','map','stall']);
assert.deepEqual(publicPlace('p',{lat:0,lng:0,name:'שער',markerDisplay:'photo',createdBy:{uid:'private'},measuredAt:100}),{id:'p',lat:0,lng:0,name:'שער',markerDisplay:'icon',markerIcon:'pin',photo:''});
assert.equal(publicPlace('p',{lat:1,lng:2,name:'ישן',archived:true}),null);
console.log('PASS saved camera, centered navigation, marker defaults, safe public fields and recording gaps');
