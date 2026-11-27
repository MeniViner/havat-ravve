import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds as yes, assertFails as no } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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
  await yes(updateDoc(ref(staff, 'places/gate'), { lat: 51, source: null, measuredAt: null, accuracy: 8 }));
  await no(updateDoc(ref(staff, 'places/gate'), { source: 'gps', measuredAt: 110 }));
  await no(updateDoc(ref(owner, 'places/gate'), { lat: 91 }));
  const home = {lat:31,lng:35,zoom:15};
  await yes(setDoc(ref(owner,'farmMap/home'),home));
  for(const viewer of [guest,staff,manager,identity('vendor'),identity('helper')]){
    await yes(getDoc(ref(viewer,'farmMap/home')));
    await no(setDoc(ref(viewer,'farmMap/home'),{...home,zoom:12}));
    await no(updateDoc(ref(viewer,'places/gate'),{markerIcon:'tree'}));
  }
  await no(setDoc(ref(owner,'farmMap/home'),{...home,zoom:20}));
  await no(setDoc(ref(owner,'farmMap/home'),{...home,privateField:'no'}));
  await no(getDoc(ref(guest,'places/gate')));
  await yes(updateDoc(ref(owner,'places/gate'),{markerIcon:'tree',markerDisplay:'icon'}));
  await no(updateDoc(ref(owner,'places/gate'),{markerIcon:'unsupported'}));
  await no(updateDoc(ref(owner,'places/gate'),{markerDisplay:'photo'}));
  await yes(updateDoc(ref(owner,'places/gate'),{markerDisplay:'photo',photo:'data:image/jpeg;base64,YQ=='}));
  await yes(setDoc(ref(owner,'farmMap/setup'),{entrance:'gate'}));
  await no(setDoc(ref(staff,'farmMap/setup'),{entrance:'gate'}));
  await no(getDoc(ref(guest,'farmMap/setup')));
  await no(deleteDoc(ref(owner, 'places/gate')));
  await yes(updateDoc(ref(manager, 'places/gate'), { archived: true }));
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
  await no(getDoc(ref(manager, 'farmTrails/run')));
  console.log(
    'PASS owner-only survey, repeatable chunks, immutable raw samples, receipts and legacy place history'
  );
} finally {
  await env.cleanup();
}
