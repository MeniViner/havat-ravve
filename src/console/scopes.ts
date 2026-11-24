// What a limited API key may do, by area of the farm (api/src/auth.ts scopes, grouped the way an owner thinks of them).
// The server keeps the list of scopes; the console shows and edits it as "none / read / read and change" per area.
export type Level = 'none' | 'read' | 'write';
export type Area = { id: string; he: string; read: string[]; write: string[] };

export const AREAS: Area[] = [
  { id: 'tasks', he: 'משימות', read: ['tasks:read', 'templates:read', 'projects:read'], write: ['tasks:create', 'tasks:assign', 'tasks:complete', 'tasks:edit', 'templates:write', 'projects:write'] },
  { id: 'shopping', he: 'קניות', read: ['shopping:read'], write: ['shopping:write'] },
  { id: 'people', he: 'אנשים', read: ['people:read'], write: ['people:write'] },
  { id: 'places', he: 'מקומות', read: ['places:read'], write: ['places:write'] },
  { id: 'events', he: 'אירועים, כרטיסים ודוכנים', read: ['events:read', 'tickets:read', 'tabs:read', 'vendors:read'], write: ['events:write', 'tickets:write', 'tabs:write', 'tabs:settle', 'vendors:write'] },
  { id: 'visits', he: 'ביקורים ותרומות', read: ['visits:read', 'donations:read'], write: ['visits:write', 'donations:write'] },
  { id: 'calendar', he: 'יומן ונוכחות', read: ['calendar:read'], write: ['calendar:write', 'presence:write'] },
  { id: 'messages', he: 'הודעות והתראות', read: ['broadcasts:read', 'notifications:read'], write: ['broadcasts:write', 'notifications:write', 'notify:write'] },
  { id: 'settings', he: 'הגדרות', read: ['settings:read'], write: ['settings:write'] },
  { id: 'general', he: 'מבט כללי, פעילות ותקלות', read: ['overview:read', 'activity:read', 'system:read', 'me:read'], write: ['me:write'] },
];
export const LEVELS: { value: Level; label: string }[] = [{ value: 'none', label: 'בלי' }, { value: 'read', label: 'צפייה' }, { value: 'write', label: 'צפייה ושינוי' }];
export type Levels = Record<string, Level>;

export const allLevels = (l: Level): Levels => Object.fromEntries(AREAS.map((a) => [a.id, l]));
export function scopesFrom(levels: Levels): string[] {
  return AREAS.flatMap((a) => (levels[a.id] === 'write' ? [...a.read, ...a.write] : levels[a.id] === 'read' ? a.read : [])).sort();
}
export function levelsFrom(scopes: string[] | null): Levels {
  if (!scopes) return allLevels('write');
  const has = new Set(scopes);
  return Object.fromEntries(AREAS.map((a) => [a.id, a.write.some((s) => has.has(s)) ? 'write' : a.read.some((s) => has.has(s)) ? 'read' : 'none']));
}
/** "כל מה שהאדם יכול", "צפייה בלבד", or the areas in short. */
export function scopesText(scopes: string[] | null): string {
  if (!scopes) return 'כל מה שהאדם שהוא פועל בשמו יכול';
  const lv = levelsFrom(scopes);
  const on = AREAS.filter((a) => lv[a.id] !== 'none');
  if (!on.length) return 'שום דבר';
  if (on.length === AREAS.length && on.every((a) => lv[a.id] === 'read')) return 'צפייה בלבד, בכל החווה';
  return on.map((a) => `${a.he} (${lv[a.id] === 'write' ? 'צפייה ושינוי' : 'צפייה'})`).join(' · ');
}
export const isReadOnly = (scopes: string[] | null) => !!scopes && AREAS.every((a) => !a.write.some((s) => scopes.includes(s)));

// ---------- on a computer: the same scopes as a checklist (K14) ----------
// Finer areas than the phone's, each scope in exactly one of them. `main` are the ones in front; the rest open on demand.
export type DeskArea = Area & { main?: boolean; short?: string; /** What the write level is called here, when it is not "קריאה ושינוי". */ writeHe?: string };
export const DESK_AREAS: DeskArea[] = [
  { id: 'tasks', he: 'משימות', main: true, read: ['tasks:read', 'templates:read', 'projects:read'], write: ['tasks:create', 'tasks:assign', 'tasks:complete', 'tasks:edit', 'templates:write', 'projects:write'] },
  { id: 'shopping', he: 'קניות', main: true, read: ['shopping:read'], write: ['shopping:write'] },
  { id: 'messages', he: 'הודעות לצוות', short: 'הודעות', main: true, writeHe: 'שליחה', read: ['broadcasts:read'], write: ['broadcasts:write'] },
  { id: 'events', he: 'אירועים וכרטיסים', short: 'אירועים', main: true, read: ['events:read', 'tickets:read', 'tabs:read', 'vendors:read'], write: ['events:write', 'tickets:write', 'tabs:write', 'vendors:write'] },
  { id: 'people', he: 'אנשים', main: true, read: ['people:read'], write: ['people:write'] },
  { id: 'money', he: 'כסף', main: true, read: ['donations:read'], write: ['donations:write', 'tabs:settle'] },
  { id: 'places', he: 'מקומות', read: ['places:read'], write: ['places:write'] },
  { id: 'visits', he: 'ביקורים', read: ['visits:read'], write: ['visits:write'] },
  { id: 'calendar', he: 'יומן ונוכחות', read: ['calendar:read'], write: ['calendar:write', 'presence:write'] },
  { id: 'notifications', he: 'התראות', read: ['notifications:read'], write: ['notifications:write', 'notify:write'] },
  { id: 'settings', he: 'הגדרות', read: ['settings:read'], write: ['settings:write'] },
  { id: 'general', he: 'מבט כללי, פעילות ותקלות', short: 'מבט כללי', read: ['overview:read', 'activity:read', 'system:read', 'me:read'], write: ['me:write'] },
];
export const levelHe = (a: DeskArea, l: Level) => (l === 'none' ? '' : l === 'read' ? 'קריאה' : a.writeHe || 'קריאה ושינוי');
export function deskLevels(scopes: string[] | null): Levels {
  if (!scopes) return Object.fromEntries(DESK_AREAS.map((a) => [a.id, 'write' as Level]));
  const has = new Set(scopes);
  return Object.fromEntries(DESK_AREAS.map((a) => [a.id, (a.write.some((s) => has.has(s)) ? 'write' : a.read.some((s) => has.has(s)) ? 'read' : 'none') as Level]));
}
/** The scopes after a change of levels: only the areas that changed are rewritten, so a key that holds part of an area keeps exactly that part. */
export function deskScopes(before: string[] | null, levels: Levels): string[] {
  const old = deskLevels(before);
  const known = new Set(DESK_AREAS.flatMap((a) => [...a.read, ...a.write]));
  const keep = (before || []).filter((s) => !known.has(s)); // a scope this list does not know yet stays as it is
  for (const a of DESK_AREAS) {
    const l = levels[a.id] || 'none';
    if (before && l === old[a.id]) keep.push(...before.filter((s) => a.read.includes(s) || a.write.includes(s)));
    else if (l !== 'none') keep.push(...a.read, ...(l === 'write' ? a.write : []));
  }
  return [...new Set(keep)].sort();
}
/** One cell of the table: "הכול, כמו בעלים", "צפייה בלבד", "משימות, קניות, הודעות". */
export function scopesShort(scopes: string[] | null, role: string): string {
  if (!scopes) return role ? `הכול, כמו ${role}` : 'הכול';
  const lv = deskLevels(scopes);
  const on = DESK_AREAS.filter((a) => lv[a.id] !== 'none');
  if (!on.length) return 'שום דבר';
  const names = on.map((a) => a.short || a.he).join(', ');
  return !isReadOnly(scopes) ? names : on.length > 3 ? 'צפייה בלבד' : `${names} · צפייה`;
}
