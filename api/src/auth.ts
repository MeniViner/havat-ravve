// Who is calling and what they may do. Permissions come only from the server-side registry below:
// credential -> allowed actors -> role -> scopes. Nothing the client sends (a "role" field, a header)
// can raise them.
import { ApiError } from './http';
import { sameHex, sha256hex } from './util';

export type Scope =
  | 'tasks:read' | 'tasks:create' | 'tasks:assign' | 'tasks:complete' | 'tasks:edit' | 'templates:read' | 'templates:write'
  | 'people:read' | 'people:write' | 'shopping:read' | 'shopping:write' | 'places:read' | 'places:write'
  | 'events:read' | 'events:write' | 'tickets:read' | 'tickets:write' | 'tabs:read' | 'tabs:write' | 'tabs:settle'
  | 'vendors:read' | 'vendors:write' | 'visits:read' | 'visits:write' | 'donations:read' | 'donations:write'
  | 'notifications:read' | 'notifications:write' | 'calendar:read' | 'calendar:write' | 'activity:read'
  | 'settings:read' | 'settings:write' | 'overview:read' | 'system:read';
export type ActorRole = 'owner' | 'manager' | 'staff';

export type ActorDef = {
  id: string;
  role: ActorRole;
  /** The person this actor writes as, in the same {uid, name} shape the app stores. */
  person: { uid: string; name: string };
};

export type Caller = { credentialId: string; actor: ActorDef; scopes: ReadonlySet<Scope>; keyVersion?: 'current' | 'previous' };

/** Mirrors firestore.rules: staff = isStaff(), manager/owner = isManager(). Owner-only cases are checked in the operation. */
const STAFF: Scope[] = [
  'tasks:read', 'tasks:create', 'tasks:complete', 'tasks:edit', 'templates:read', 'shopping:read', 'shopping:write', 'places:read',
  'events:read', 'tickets:read', 'tabs:read', 'tabs:write', 'vendors:read', 'activity:read', 'settings:read', 'overview:read',
];
const MANAGER: Scope[] = [
  ...STAFF, 'tasks:assign', 'templates:write', 'people:read', 'people:write', 'places:write', 'events:write', 'tickets:write', 'tabs:settle',
  'vendors:write', 'visits:read', 'visits:write', 'donations:read', 'donations:write', 'notifications:read', 'notifications:write',
  'calendar:read', 'calendar:write', 'settings:write', 'system:read',
];
const ROLE_SCOPES: Record<ActorRole, Scope[]> = { owner: MANAGER, manager: MANAGER, staff: STAFF };

/**
 * Synthetic actors, for tests. Real people are actors named "user:<uid>": a credential lists them, and
 * their name and role come from that person's profile in the app (users/<uid>) on every request, so a
 * role change or a block in the app takes effect here too (within the cache below).
 */
export const ACTORS: Record<string, ActorDef> = {
  'actor-demo-owner': { id: 'actor-demo-owner', role: 'owner', person: { uid: 'synthetic-owner', name: 'בעלים (סינתטי)' } },
  'actor-demo-staff': { id: 'actor-demo-staff', role: 'staff', person: { uid: 'synthetic-staff', name: 'מתנדב (סינתטי)' } },
};

export const seesManagerTasks = (a: ActorDef) => a.role === 'owner' || a.role === 'manager';

/**
 * API_CREDENTIALS (a secret) is a JSON array of { id, sha256, actors }. Only the SHA-256 of each key is
 * stored; `actors[0]` is the default actor for that key.
 */
/**
 * One key per person (or per assistant). Revoking sets "disabled"; rotating replaces "sha256" (same id,
 * same actors); "expiresAt" (ISO time) ends a key on its own. Managed with api/scripts/keys.mjs.
 */
type CredentialDef = {
  id: string; sha256: string; actors: string[]; disabled?: boolean; expiresAt?: string;
  /** During a rotation the replaced key keeps working until previousUntil, so the client can switch over. */
  previousSha256?: string; previousUntil?: string;
};

function credentials(raw: string | undefined): CredentialDef[] {
  if (!raw) throw new ApiError('INTERNAL', 'API_CREDENTIALS is not configured');
  let list: unknown;
  try { list = JSON.parse(raw); } catch { throw new ApiError('INTERNAL', 'API_CREDENTIALS is not valid JSON'); }
  if (!Array.isArray(list)) throw new ApiError('INTERNAL', 'API_CREDENTIALS must be an array');
  return list.filter((c): c is CredentialDef =>
    !!c && typeof c.id === 'string' && typeof c.sha256 === 'string' && /^[0-9a-f]{64}$/.test(c.sha256) && Array.isArray(c.actors) && c.actors.length > 0);
}

/** Loads users/<uid>, or null when it does not exist. Supplied by the caller so this module has no I/O. */
export type ProfileLoader = (uid: string) => Promise<Record<string, unknown> | null>;

const TEAM_ROLES = new Set<ActorRole>(['owner', 'manager', 'staff']);
const PROFILE_TTL_MS = 60_000;
const profileCache = new Map<string, { at: number; actor: ActorDef | null }>();

/** A real person as an actor: only an active team member, with the role their profile has right now. */
async function userActor(actorId: string, load: ProfileLoader): Promise<ActorDef | null> {
  const uid = actorId.slice('user:'.length);
  const hit = profileCache.get(uid);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.actor;
  const p = await load(uid);
  const role = String(p?.role) as ActorRole;
  const actor = p && p.status === 'active' && TEAM_ROLES.has(role) && typeof p.displayName === 'string' && p.displayName
    ? { id: actorId, role, person: { uid, name: p.displayName.slice(0, 80) } }
    : null;
  profileCache.set(uid, { at: Date.now(), actor });
  return actor;
}

export async function authenticate(req: Request, rawCredentials: string | undefined, loadProfile: ProfileLoader): Promise<Caller> {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S{16,256})$/i.exec(header);
  if (!m) throw new ApiError('UNAUTHENTICATED', header ? 'malformed Authorization header' : 'missing Authorization header');
  const presented = await sha256hex(m[1]);
  // compare against every credential so timing does not reveal which one matched
  let found: CredentialDef | null = null;
  let keyVersion: 'current' | 'previous' = 'current';
  const now = Date.now();
  for (const c of credentials(rawCredentials)) {
    const cur = sameHex(presented, c.sha256);
    const prev = !!c.previousSha256 && /^[0-9a-f]{64}$/.test(c.previousSha256) && sameHex(presented, c.previousSha256) && Date.parse(c.previousUntil || '') > now;
    if ((cur || prev) && !found) { found = c; keyVersion = cur ? 'current' : 'previous'; }
  }
  if (!found) throw new ApiError('UNAUTHENTICATED', 'unknown API key');
  if (found.disabled) throw new ApiError('UNAUTHENTICATED', 'this API key was revoked', { credential: found.id });
  if (found.expiresAt && !(Date.parse(found.expiresAt) > Date.now())) throw new ApiError('UNAUTHENTICATED', 'this API key has expired', { credential: found.id });

  const requested = req.headers.get('x-actor-id');
  const actorId = requested ?? found.actors[0];
  if (!found.actors.includes(actorId)) throw new ApiError('FORBIDDEN', `credential ${found.id} may not act as ${actorId}`, { actor: actorId });
  const actor = /^user:[A-Za-z0-9_-]{1,128}$/.test(actorId) ? await userActor(actorId, loadProfile) : ACTORS[actorId];
  if (!actor) throw new ApiError('FORBIDDEN', `actor ${actorId} is not registered or not an active team member`, { actor: actorId });
  return { credentialId: found.id, actor, scopes: new Set(ROLE_SCOPES[actor.role]), keyVersion };
}

export function requireScope(c: Caller, scope: Scope) {
  if (!c.scopes.has(scope)) throw new ApiError('FORBIDDEN', `actor ${c.actor.id} has no scope ${scope}`, { requiredScope: scope });
}
