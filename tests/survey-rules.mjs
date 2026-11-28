import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds as yes, assertFails as no } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
const env = await initializeTestEnvironment({
  projectId: 'demo-farm-survey-rules',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
});
const identity = (role) =>
  env
    .authenticatedContext(role, {
      email: role + '@example.test',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const owner = identity('owner'),
  staff = identity('staff'),
  manager = identity('manager'),
  guest = env.unauthenticatedContext().firestore();
const ref = (db, path) => doc(db, path);
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    for (const role of ['owner', 'staff', 'manager'])
      await setDoc(ref(c.firestore(), 'users/' + role), { role, status: 'active', displayName: role });
  });
  const base = {
    name: 'שער',
    lat: 50,
    lng: 10,
    createdBy: { uid: 'owner', name: 'owner' },
    createdAt: '2026-11-26T09:00:00Z',
  };
  await yes(setDoc(ref(owner, 'places/gate'), { ...base, source: 'gps', measuredAt: 100, accuracy: 4 }));
  await no(
    setDoc(ref(staff, 'places/s'), {
      ...base,
      createdBy: { uid: 'staff', name: 'staff' },
      source: 'manual',
      measuredAt: 100,
    })
  );
  await no(updateDoc(ref(staff, 'places/gate'), { lat: 51 }));
  await no(updateDoc(ref(staff, 'places/gate'), { lat: 51, source: null, measuredAt: null, accuracy: 8 }));
  await yes(updateDoc(ref(owner, 'places/gate'), { lat: 51, source: null, measuredAt: null, accuracy: 8 }));
  await no(updateDoc(ref(staff, 'places/gate'), { source: 'gps', measuredAt: 110 }));
  await no(updateDoc(ref(owner, 'places/gate'), { lat: 91 }));
  await no(deleteDoc(ref(owner, 'places/gate')));
  await no(updateDoc(ref(manager, 'places/gate'), { archived: true }));
  await yes(updateDoc(ref(owner, 'places/gate'), { archived: true }));
  assert.equal((await getDoc(ref(staff, 'places/gate'))).data().archived, true);
  const samples = {
    index: 0,
    writer: 'owner',
    points: [{ lat: 50, lng: 10, seq: 1, segment: 1, quality: 'ok', at: 100, accuracy: 3 }],
  };
  for (const path of ['surveyRecordings/run/chunks/0', 'farmTrails/run/versions/g1/chunks/0']) {
    await yes(setDoc(ref(owner, path), samples));
    await yes(setDoc(ref(owner, path), samples));
    await no(updateDoc(ref(owner, path), { points: [] }));
    await no(getDoc(ref(staff, path)));
    await no(setDoc(ref(manager, path + 'x'), { ...samples, writer: 'manager' }));
    await no(getDoc(ref(guest, path)));
    await no(setDoc(ref(owner, path + 'x'), { ...samples, points: Array(129).fill(samples.points[0]) }));
  }
  const raw = { ownerUid: 'owner', started: 100, lastAt: 200, count: 1, chunks: 1 };
  await yes(setDoc(ref(owner, 'surveyRecordings/run'), raw));
  await no(updateDoc(ref(owner, 'surveyRecordings/run'), { started: 200 }));
  const t = {
    name: 'שביל',
    ownerUid: 'owner',
    recordingId: 'run',
    geometry: 'g1',
    revision: 'r1',
    status: 'confirmed',
    count: 2,
    chunks: 1,
    modes: ['walk'],
    connections: [],
    placeIds: [],
    updatedAt: 200,
  };
  await no(setDoc(ref(staff, 'farmTrails/run'), t));
  await no(setDoc(ref(owner, 'farmTrails/run'), { ...t, modes: [] }));
  await no(setDoc(ref(owner, 'farmTrails/run'), { ...t, chunks: 2 }));
  const batch = writeBatch(owner);
  batch.set(ref(owner, 'farmTrails/run'), t);
  batch.set(ref(owner, 'farmTrails/run/revisions/r1'), { revision: 'r1', at: 200 });
  await yes(batch.commit());
  await no(setDoc(ref(owner, 'farmTrails/run/revisions/r2'), { revision: 'r2', at: 220 }));
  await yes(setDoc(ref(owner, 'farmTrails/draft'), { ...t, status: 'draft' }));
  await yes(setDoc(ref(owner, 'farmTrails/draft/versions/g1/chunks/0'), samples));
  await yes(setDoc(ref(owner, 'farmTrails/run/versions/old/chunks/0'), samples));
  for (const reader of [staff, manager]) {
    await yes(getDoc(ref(reader, 'farmTrails/run')));
    const trails = await yes(getDocs(query(collection(reader, 'farmTrails'), where('status', '==', 'confirmed'))));
    assert.deepEqual(trails.docs.map(d => d.id), ['run']);
    await yes(getDocs(collection(reader, 'farmTrails/run/versions/g1/chunks')));
    for (const path of ['farmTrails/draft', 'farmTrails/run/revisions/r1', 'farmTrails/run/versions/old/chunks/0',
      'farmTrails/draft/versions/g1/chunks/0', 'surveyRecordings/run', 'surveyRecordings/run/chunks/0']) {
      await no(getDoc(ref(reader, path)));
    }
    await no(getDocs(collection(reader, 'farmTrails')));
    await no(updateDoc(ref(reader, 'farmTrails/run'), { status: 'draft' }));
  }
  await no(getDoc(ref(guest, 'farmTrails/run')));
  await no(getDoc(ref(guest, 'farmTrails/run/versions/g1/chunks/0')));
  await yes(updateDoc(ref(owner, 'farmTrails/run'), { geometry: 'old' }));
  await no(getDoc(ref(staff, 'farmTrails/run/versions/g1/chunks/0')));
  await yes(getDoc(ref(staff, 'farmTrails/run/versions/old/chunks/0')));
  console.log(
    'PASS owner-only map editing, team confirmed geometry, private drafts, recordings and revisions'
  );
} finally {
  await env.cleanup();
}
