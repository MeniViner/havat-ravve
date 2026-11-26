// "Who am I, and what may this key do": the caller's own identity and effective permissions, read from the
// authenticated key and nothing else. It takes no parameters, reads no farm data and no other person's record, and
// returns no key value, no key hash and no contact details.
import { type Caller, requireScope } from './auth';
import type { Operation } from './catalog';
import { ApiError } from './http';

export const WHOAMI_OPS: Operation[] = [
  {
    name: 'me.whoami', kind: 'read', method: 'GET', path: '/v1/me', requiredScope: 'me:read',
    he: 'מי אני ומה המפתח הזה יכול לעשות: הזהות של האדם שהמפתח מקושר אליו, התפקיד וההרשאות בפועל',
    notes: [
      'Takes no parameters. Answers only about the caller: the profile the key is bound to (actor id, uid, name), its current role and the effective scopes.',
      'Effective scopes are the role\'s scopes, cut down to the key\'s own list when the key is limited. A role change or a block in the app takes effect here too.',
      'Returns no key value or hash, no other actor or person, no contact details and no farm data. Use it to check that a new key works and who it acts as.',
    ],
  },
];

/** The authenticated caller, as the server sees it right now. */
export function whoami(caller: Caller, query: URLSearchParams) {
  requireScope(caller, 'me:read');
  const extra = [...query.keys()][0];
  if (extra !== undefined) throw new ApiError('VALIDATION_FAILED', 'me.whoami takes no query parameters', { field: extra });
  return {
    actor: { id: caller.actor.id, role: caller.actor.role, person: { uid: caller.actor.person.uid, name: caller.actor.person.name } },
    scopes: [...caller.scopes].sort(),
    key: { ...(caller.label ? { label: caller.label } : {}), version: caller.keyVersion || 'current', limited: !!caller.limited },
  };
}
