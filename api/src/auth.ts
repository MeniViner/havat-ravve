// Who is calling and what they may do. Permissions come only from the server-side registry below:
// credential -> allowed actors -> role -> scopes. Nothing the client sends (a "role" field, a header)
// can raise them.
import { ApiError } from './http';
import { sameHex, sha256hex } from './util';

export type Scope = 'tasks:read' | 'tasks:create' | 'tasks:assign' | 'people:read';
export type ActorRole = 'owner' | 'manager' | 'staff';

export type ActorDef = {
  id: string;
  role: ActorRole;
  /** The person this actor writes as, in the same {uid, name} shape the app stores. */
  person: { uid: string; name: string };
};

export type Caller = { credentialId: string; actor: ActorDef; scopes: ReadonlySet<Scope> };

const ROLE_SCOPES: Record<ActorRole, Scope[]> = {
  owner: ['tasks:read', 'tasks:create', 'tasks:assign', 'people:read'],
  manager: ['tasks:read', 'tasks:create', 'tasks:assign', 'people:read'],
  staff: ['tasks:read', 'tasks:create'],
};

/** Stage 1: synthetic actors only. Real people get added one by one, with Meni's approval, in stage 2/3. */
export const ACTORS: Record<string, ActorDef> = {
  'actor-demo-owner': { id: 'actor-demo-owner', role: 'owner', person: { uid: 'synthetic-owner', name: 'בעלים (סינתטי)' } },
  'actor-demo-staff': { id: 'actor-demo-staff', role: 'staff', person: { uid: 'synthetic-staff', name: 'מתנדב (סינתטי)' } },
};

export const seesManagerTasks = (a: ActorDef) => a.role === 'owner' || a.role === 'manager';

/**
 * API_CREDENTIALS (a secret) is a JSON array of { id, sha256, actors }. Only the SHA-256 of each key is
 * stored; `actors[0]` is the default actor for that key.
 */
type CredentialDef = { id: string; sha256: string; actors: string[] };

function credentials(raw: string | undefined): CredentialDef[] {
  if (!raw) throw new ApiError('INTERNAL', 'API_CREDENTIALS is not configured');
  let list: unknown;
  try { list = JSON.parse(raw); } catch { throw new ApiError('INTERNAL', 'API_CREDENTIALS is not valid JSON'); }
  if (!Array.isArray(list)) throw new ApiError('INTERNAL', 'API_CREDENTIALS must be an array');
  return list.filter((c): c is CredentialDef =>
    !!c && typeof c.id === 'string' && typeof c.sha256 === 'string' && /^[0-9a-f]{64}$/.test(c.sha256) && Array.isArray(c.actors) && c.actors.length > 0);
}

export async function authenticate(req: Request, rawCredentials: string | undefined): Promise<Caller> {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S{16,256})$/i.exec(header);
  if (!m) throw new ApiError('UNAUTHENTICATED', header ? 'malformed Authorization header' : 'missing Authorization header');
  const presented = await sha256hex(m[1]);
  // compare against every credential so timing does not reveal which one matched
  let found: CredentialDef | null = null;
  for (const c of credentials(rawCredentials)) if (sameHex(presented, c.sha256) && !found) found = c;
  if (!found) throw new ApiError('UNAUTHENTICATED', 'unknown API key');

  const requested = req.headers.get('x-actor-id');
  const actorId = requested ?? found.actors[0];
  if (!found.actors.includes(actorId)) throw new ApiError('FORBIDDEN', `credential ${found.id} may not act as ${actorId}`, { actor: actorId });
  const actor = ACTORS[actorId];
  if (!actor) throw new ApiError('FORBIDDEN', `actor ${actorId} is not registered`, { actor: actorId });
  return { credentialId: found.id, actor, scopes: new Set(ROLE_SCOPES[actor.role]) };
}

export function requireScope(c: Caller, scope: Scope) {
  if (!c.scopes.has(scope)) throw new ApiError('FORBIDDEN', `actor ${c.actor.id} has no scope ${scope}`, { requiredScope: scope });
}
