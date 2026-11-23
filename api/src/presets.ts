import { ALL_SCOPES, ROLE_SCOPES, type Scope } from './auth';

export const PRESETS = {
  owner: null,
  manager: ROLE_SCOPES.manager.filter((s) => s !== 'settings:write'),
  volunteer: [
    'tasks:read', 'tasks:create', 'tasks:complete', 'tasks:edit', 'templates:read', 'projects:read',
    'shopping:read', 'shopping:write', 'places:read', 'events:read', 'tickets:read', 'tabs:read',
    'vendors:read', 'activity:read', 'calendar:read', 'presence:write', 'broadcasts:read',
    'notifications:read', 'overview:read', 'me:read', 'me:write',
  ],
  readOnly: ALL_SCOPES.filter((s) => s.endsWith(':read')),
} satisfies Record<string, readonly Scope[] | null>;
