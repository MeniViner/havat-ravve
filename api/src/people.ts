// Everyone's last entry to the app and from what (the console's אנשים screen), in one answer for the whole list:
// the last sign-in from Firebase Auth (Identity Toolkit, up to 5 pages of 1,000 accounts), and the kind of device from
// the person's newest phone-push subscription, where they have one (users/{uid}.push.devices, one query).
import { type Env, Firestore } from './firestore';

const PAGES = 5;
const PAGE = 1000;
const MAX_PEOPLE = 2000;
export type PersonAccess = { at: string | null; device: 'phone' | 'computer' | null };
type AuthUser = { localId?: string; lastLoginAt?: string; lastRefreshAt?: string };

const ms = (v: unknown) => { const n = /^\d+$/.test(String(v ?? '')) ? Number(v) : Date.parse(String(v ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/** uid -> last sign-in (or a later refresh of the same sign-in). What could be read before a failure is kept. */
async function lastSignIns(env: Env, fs: Firestore): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (fs.emulator && !env.FIREBASE_AUTH_EMULATOR_HOST) return out;
  const base = (fs.emulator ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com') + `/v1/projects/${fs.project}/accounts:batchGet`;
  let token = '';
  try {
    for (let i = 0; i < PAGES; i++) {
      const u = new URL(base);
      u.searchParams.set('maxResults', String(PAGE));
      // only what is needed: an account's whole record is a kilobyte
      u.searchParams.set('fields', 'nextPageToken,users(localId,lastLoginAt,lastRefreshAt)');
      if (token) u.searchParams.set('nextPageToken', token);
      const res = await fetch(u, { headers: { authorization: await fs.bearer() }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) { await res.body?.cancel(); console.log(JSON.stringify({ peopleAccess: 'auth ' + res.status })); break; }
      const j = (await res.json()) as { users?: AuthUser[]; nextPageToken?: string };
      for (const a of j.users || []) {
        const at = Math.max(ms(a.lastLoginAt), ms(a.lastRefreshAt));
        if (a.localId && at) out.set(a.localId, new Date(at).toISOString());
      }
      if (!j.nextPageToken || !j.users?.length) break;
      token = j.nextPageToken;
    }
  } catch (e) { console.log(JSON.stringify({ peopleAccess: String(e instanceof Error ? e.name : e).slice(0, 80) })); }
  return out;
}

/** "iPhone · Safari · app" (src/app/v2/data/push.ts) -> phone; "Mac · Chrome" -> computer. */
export function deviceOf(devices: unknown): PersonAccess['device'] {
  if (!Array.isArray(devices)) return null;
  const known = devices.map((d) => (d && typeof d === 'object' ? (d as { ua?: unknown; createdAt?: unknown }) : {}))
    .map((d) => ({ ua: String(d.ua || ''), at: String(d.createdAt || '') }))
    .filter((d) => /^(iPhone|Android|Mac|Windows)\b/.test(d.ua))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return !known.length ? null : /^(iPhone|Android)/.test(known[0].ua) ? 'phone' : 'computer';
}

export async function peopleAccess(env: Env, fs: Firestore): Promise<{ people: Record<string, PersonAccess> }> {
  const [signIns, users] = await Promise.all([
    lastSignIns(env, fs),
    fs.query({ from: [{ collectionId: 'users' }], select: { fields: [{ fieldPath: 'push.devices' }] }, limit: MAX_PEOPLE }),
  ]);
  const people: Record<string, PersonAccess> = {};
  for (const u of users) people[u.id] = { at: signIns.get(u.id) || null, device: deviceOf((u.data.push as { devices?: unknown } | undefined)?.devices) };
  // beyond the first 2,000 people: the sign-in is still known, the device is not
  for (const [uid, at] of signIns) people[uid] ??= { at, device: null };
  return { people };
}
