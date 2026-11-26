import { openDB, type DBSchema } from 'idb';
import { newId, transact, write, type Tx } from '../db';
import { demoOnly } from '../demo/store';
import { readyAuth } from '../firebase';
import type { Actor } from '../types';
import { chunked, type PlaceDraft, type Recording, type Trail, type Vertex, type Sample } from './model';

export type Review = {
  trail: Trail;
  points: Vertex[];
  base: string;
  dirtyGeometry: boolean;
  raw?: { recording: Recording; samples: Sample[] };
};
export type PlaceJob = { draft: PlaceDraft; actor: Actor; at: string };
type Job = {
  key: string;
  scope: string;
  time: number;
  sent?: { raw?: number; geometry?: number };
  review?: Review;
  place?: PlaceJob;
};
interface Storage extends DBSchema {
  queue: { key: string; value: Job; indexes: { scope: string } };
  drafts: { key: string; value: PlaceDraft | Review };
}
let database: ReturnType<typeof openDB<Storage>> | undefined;
const storage = () =>
  (database ??= openDB<Storage>('farm-survey-v1', 1, {
    upgrade(db) {
      db.createObjectStore('queue', { keyPath: 'key' }).createIndex('scope', 'scope');
      db.createObjectStore('drafts');
    },
  }));
export const scopeOf = (uid: string) => (demoOnly() ? 'demo:' : 'user:') + uid;
export const jobs = async (scope: string) =>
  (await (await storage()).getAllFromIndex('queue', 'scope', scope)).sort((a, b) => a.time - b.time);
export async function readDraft<T extends PlaceDraft | Review>(key: string) {
  return (await (await storage()).get('drafts', key)) as T | undefined;
}
export async function draftAt(key: string, value: PlaceDraft | Review | null) {
  const db = await storage();
  if (value) await db.put('drafts', value, key);
  else await db.delete('drafts', key);
}
export async function enqueue(scope: string, data: Pick<Job, 'place' | 'review'>, draftKey: string) {
  const db = await storage(),
    tx = db.transaction(['queue', 'drafts'], 'readwrite');
  const key = data.review?.trail.revision || newId('surveyPlaceSave');
  await tx.objectStore('queue').put({ key, scope, time: Date.now(), ...data });
  await tx.objectStore('drafts').delete(draftKey);
  await tx.done;
  window.dispatchEvent(new Event('farm-survey-change'));
}
export function placeFields(job: PlaceJob) {
  const { draft, actor, at } = job;
  const { lat, lng, accuracy, source } = draft.point;
  return {
    name: draft.name.trim(),
    lat,
    lng,
    photo: draft.photo,
    accuracy: accuracy ?? null,
    ...(source === 'legacy' ? {} : { source, measuredAt: draft.point.at }),
    ...(draft.editing ? {} : { createdBy: actor, createdAt: at }),
  };
}
async function applyPlace(tx: Tx, job: PlaceJob, key: string) {
  const { draft, actor } = job,
    path = draft.id;
  const current = await tx.get('places', path);
  // The receipt doubles as the team's activity record. A lost acknowledgement never reapplies an old edit.
  if (await tx.get('activity', key)) return;
  if (draft.editing) {
    if (
      !current ||
      current.archived ||
      (draft.original &&
        (current.lat !== draft.original.lat ||
          current.lng !== draft.original.lng ||
          current.name !== draft.original.name ||
          (current.photo || '') !== (draft.original.photo || '')))
    )
      throw new Error('המקום השתנה במכשיר אחר. הטיוטה שלך נשמרה');
    tx.update('places', path, placeFields(job));
  } else {
    if (current) throw new Error('מזהה המקום כבר בשימוש');
    tx.set('places', path, placeFields(job));
  }
  tx.set('activity', key, {
    by: actor,
    kind: 'place',
    refId: path,
    action: draft.editing ? 'edited' : 'created',
    text: draft.name,
    at: job.at,
    subjectUid: '',
    eventId: '',
  });
}
const checkScope = async (s: string) => {
  if (demoOnly() ? !s.startsWith('demo:') : s !== 'user:' + (await readyAuth()).currentUser?.uid)
    throw new Error('החשבון התחלף');
};
async function sendChunks(job: Job, part: 'raw' | 'geometry', path: string, points: Vertex[], uid: string) {
  const groups = chunked(points);
  for (let start = job.sent?.[part] || 0; start < groups.length; start += 12) {
    await checkScope(job.scope);
    await write.batch(
      groups.slice(start, start + 12).map((points, i) => ({
        op: 'set',
        col: path,
        id: String(start + i),
        data: { index: start + i, writer: uid, points },
      })),
      { wait: true }
    );
    const db = await storage(),
      tx = db.transaction('queue', 'readwrite');
    const stored = await tx.store.get(job.key);
    if (stored)
      await tx.store.put({ ...stored, sent: { ...stored.sent, [part]: Math.min(start + 12, groups.length) } });
    await tx.done;
  }
}
export const geometryPath = (t: Trail) => `farmTrails/${t.id}/versions/${t.geometry}/chunks`;
async function send(scope: string, job: Job) {
  const review = job.review;
  if (review) {
    const { trail, points, raw } = review;
    const uid = scope.slice(scope.indexOf(':') + 1);
    if (raw) await sendChunks(job, 'raw', `surveyRecordings/${raw.recording.id}/chunks`, raw.samples, uid);
    if (review.dirtyGeometry) await sendChunks(job, 'geometry', geometryPath(trail), points, uid);
  }
  await checkScope(scope);
  await transact(
    async (tx) => {
      if (job.place) return applyPlace(tx, job.place, job.key);
      if (!review) throw new Error('חסרים נתוני הסקירה');
      const { trail, base, raw } = review;
      const receipts = `farmTrails/${trail.id}/revisions`;
      if (await tx.get(receipts, trail.revision)) return;
      const old = await tx.get<Trail>('farmTrails', trail.id);
      if (old?.revision === trail.revision) return;
      if ((old?.revision || '') !== base) throw new Error('השביל השתנה במכשיר אחר. אפשר לשמור את העריכה כעותק');
      if (raw)
        tx.set('surveyRecordings', raw.recording.id, {
          ownerUid: raw.recording.owner,
          started: raw.recording.started,
          count: raw.samples.length,
          lastAt: raw.recording.lastAt ?? null,
          chunks: chunked(raw.samples).length,
        });
      const { id, ...fields } = trail;
      tx.set(receipts, trail.revision, { revision: trail.revision, at: trail.updatedAt });
      tx.set('farmTrails', id, {
        ...fields,
        placeIds: [...new Set(trail.connections.filter((c) => c.target === 'place').map((c) => c.targetId))],
      });
    },
    { serverOnly: true }
  );
}
const flights = new Map<string, Promise<void>>();
export function flush(scope: string): Promise<void> {
  const running = flights.get(scope);
  if (running) return running;
  const next = (async () => {
    for (;;) {
      if (!navigator.onLine) return;
      const [job] = await jobs(scope);
      if (!job) return;
      await checkScope(scope);
      await send(scope, job);
      await (await storage()).delete('queue', job.key);
      window.dispatchEvent(new Event('farm-survey-change'));
    }
  })().finally(() => flights.delete(scope));
  flights.set(scope, next);
  return next;
}
export async function recoverJob(scope: string, key: string) {
  const db = await storage(),
    tx = db.transaction(['queue', 'drafts'], 'readwrite');
  const j = await tx.objectStore('queue').get(key);
  if (!j || j.scope !== scope) return;
  if (j.review) {
    const trail = {
      ...j.review.trail,
      id: newId('farmTrails'),
      ownerUid: scope.slice(scope.indexOf(':') + 1),
      name: j.review.trail.name + ' (עותק)',
      status: 'draft' as const,
      modes: [],
      connections: [],
      geometry: crypto.randomUUID(),
      revision: crypto.randomUUID(),
    };
    await tx
      .objectStore('queue')
      .put({ ...j, key: trail.revision, sent: {}, review: { ...j.review, base: '', dirtyGeometry: true, trail } });
  } else if (j.place) {
    await tx
      .objectStore('drafts')
      .put({ ...j.place.draft, editing: false, original: undefined, id: newId('places') }, scope + ':place');
  }
  await tx.objectStore('queue').delete(key);
  await tx.done;
  window.dispatchEvent(new Event('farm-survey-change'));
}
