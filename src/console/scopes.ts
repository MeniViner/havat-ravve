import { ALL_SCOPES, ROLE_SCOPES, type Scope } from '../../api/src/auth';
import { PRESETS } from '../../api/src/presets';

// What a limited API key may do, by area of the farm (api/src/auth.ts scopes, grouped the way an owner thinks of them).
// The server keeps the list of scopes; the console shows and edits it as "none / read / read and change" per area.
export type Level = 'none' | 'read' | 'write';
export type Area = { id: string; he: string; read: Scope[]; write: Scope[] };

export const AREAS: Area[] = [
  { id: 'tasks', he: 'משימות', read: ['tasks:read', 'templates:read', 'projects:read'], write: ['tasks:create', 'tasks:assign', 'tasks:complete', 'tasks:edit', 'tasks:delete', 'templates:write', 'projects:write'] },
  { id: 'shopping', he: 'קניות', read: ['shopping:read'], write: ['shopping:write', 'shopping:delete'] },
  { id: 'people', he: 'אנשים', read: ['people:read'], write: ['people:write', 'people:block', 'people:delete'] },
  { id: 'places', he: 'מקומות', read: ['places:read'], write: ['places:write'] },
  { id: 'events', he: 'אירועים, כרטיסים ודוכנים', read: ['events:read', 'tickets:read', 'tabs:read', 'vendors:read'], write: ['events:write', 'events:delete', 'tickets:write', 'tabs:write', 'tabs:settle', 'vendors:write'] },
  { id: 'visits', he: 'ביקורים ותרומות', read: ['visits:read', 'donations:read'], write: ['visits:write', 'donations:write', 'donations:delete'] },
  { id: 'calendar', he: 'יומן ונוכחות', read: ['calendar:read'], write: ['calendar:write', 'presence:write', 'presence:remove', 'presence:write:any'] },
  { id: 'messages', he: 'הודעות והתראות', read: ['broadcasts:read', 'notifications:read'], write: ['broadcasts:write', 'broadcasts:urgent', 'notifications:write', 'notify:team', 'notify:all'] },
  { id: 'settings', he: 'הגדרות', read: ['settings:read'], write: ['settings:write'] },
  { id: 'general', he: 'מבט כללי, פעילות ותקלות', read: ['overview:read', 'activity:read', 'system:read', 'me:read'], write: ['me:write'] },
];
export const LEVELS: { value: Level; label: string }[] = [{ value: 'none', label: 'בלי' }, { value: 'read', label: 'צפייה' }, { value: 'write', label: 'צפייה ושינוי' }];
export const PRESET_LABELS = { owner: 'בעלים', manager: 'מנהל', volunteer: 'מתנדב', readOnly: 'קריאה בלבד', custom: 'מותאם אישית' } as const;
export type Preset = keyof typeof PRESET_LABELS;
export { PRESETS };

export function presetOf(scopes: string[] | null): Preset {
  if (scopes === null) return 'owner';
  const has = new Set(scopes);
  return (['manager', 'volunteer', 'readOnly'] as const)
    .find((p) => PRESETS[p].length === has.size && PRESETS[p].every((s) => has.has(s))) || 'custom';
}

export function scopesText(scopes: string[] | null): string {
  const preset = presetOf(scopes);
  return preset === 'custom' ? 'מוגבל' : PRESET_LABELS[preset];
}

export function areaLevel(area: Area, scopes: readonly string[]): Level | '' {
  const read = area.read.filter((s) => scopes.includes(s)).length;
  const write = area.write.filter((s) => scopes.includes(s)).length;
  if (!read && !write) return 'none';
  if (read === area.read.length) {
    if (write === area.write.length && write) return 'write';
    if (!write) return 'read';
  }
  return '';
}

/** A simple selection replaces the choices in this area only. */
export function setAreaLevel(area: Area, scopes: readonly string[], level: Level): string[] {
  const other = scopes.filter((s) => ![...area.read, ...area.write].some((scope) => scope === s));
  return [...other, ...(level === 'none' ? [] : area.read), ...(level === 'write' ? area.write : [])];
}

const SCOPE_TEXT: Record<Scope, string> = {
  'tasks:read': 'קריאת משימות', 'tasks:create': 'יצירת משימות', 'tasks:assign': 'הקצאת משימות לאחרים',
  'tasks:complete': 'לקיחה, שחרור, סיום ופתיחה מחדש', 'tasks:edit': 'עריכת משימות מותרות', 'tasks:delete': 'מחיקת משימות מותרות',
  'templates:read': 'קריאת משימות חוזרות', 'templates:write': 'ניהול משימות חוזרות',
  'projects:read': 'קריאת פרויקטים וצעדים', 'projects:write': 'ניהול פרויקטים וצעדים',
  'people:read': 'חיפוש וקריאת פרטי אנשים', 'people:write': 'ניהול אנשים, תפקידים והזמנות',
  'people:block': 'חסימה ושחרור של אדם', 'people:delete': 'מחיקת אדם', 'shopping:read': 'קריאת רשימות הקניות',
  'shopping:write': 'ניהול קניות וסבבי קנייה', 'shopping:delete': 'מחיקת פריטי קניות וסבבים', 'places:read': 'קריאת מקומות', 'places:write': 'שמירה ועריכת מקומות',
  'events:read': 'קריאת אירועים', 'events:write': 'עריכת אירועים, שיבוצים ודוכנים', 'events:delete': 'מחיקת אירועים',
  'tickets:read': 'קריאת כרטיסים והזמנות', 'tickets:write': 'ניהול כרטיסים, הזמנות ותשלומים',
  'tabs:read': 'קריאת חשבונות דוכן', 'tabs:write': 'עבודה עם חשבונות דוכן', 'tabs:settle': 'הסדרת תשלום בחשבון דוכן',
  'vendors:read': 'קריאת בעלי דוכנים', 'vendors:write': 'ניהול בעלי דוכנים', 'visits:read': 'קריאת בקשות ביקור',
  'visits:write': 'ניהול בקשות ביקור', 'donations:read': 'קריאת תרומות', 'donations:write': 'עדכון תרומות וקבלות',
  'donations:delete': 'מחיקת תרומות', 'notifications:read': 'קריאת תור הטיפול למנהלים', 'notifications:write': 'ניהול תור הטיפול למנהלים',
  'calendar:read': 'קריאת יומן החווה', 'calendar:write': 'ניהול פריטי היומן', 'activity:read': 'קריאת הפעילות המותרת לתפקיד',
  'settings:read': 'קריאת הגדרות מותרות', 'settings:write': 'עדכון הגדרות מותרות',
  'overview:read': 'קריאת מבט כללי', 'system:read': 'קריאת מצב המערכת',
  'presence:write': 'עדכון נוכחות אישית', 'presence:remove': 'הסרת רישומי נוכחות', 'presence:write:any': 'עדכון נוכחות של אחרים, עם הרשאת נוכחות',
  'broadcasts:read': 'קריאת הודעות שנגישות לתפקיד', 'broadcasts:write': 'שליחה ושליחה חוזרת של הודעות',
  'broadcasts:urgent': 'שליחה או שליחה חוזרת של הודעה דחופה', 'me:read': 'קריאת הפרופיל וההתראות שלי',
  'me:write': 'עדכון הפרופיל וההתראות שלי', 'notify:team': 'שליחת התראות אישיות לצוות',
  'notify:all': 'שליחת התראות לכל אדם פעיל והודעות לקהלים מחוץ לצוות',
};
export const SCOPE_ROWS = ALL_SCOPES.map((scope) => ({
  scope,
  description: SCOPE_TEXT[scope],
  roles: scope === 'people:delete' ? 'בעלים' : ROLE_SCOPES.staff.includes(scope) ? 'בעלים, מנהל, מתנדב' : 'בעלים, מנהל',
}));

export type Levels = Record<string, Level>;
export const allLevels = (l: Level): Levels => Object.fromEntries(AREAS.map((a) => [a.id, l]));
export const scopesFrom = (levels: Levels) => AREAS.flatMap((a) => levels[a.id] === 'write' ? [...a.read, ...a.write] : levels[a.id] === 'read' ? a.read : []).sort();
export const isReadOnly = (scopes: string[] | null) => !!scopes && AREAS.every((a) => !a.write.some((s) => scopes.includes(s)));

// ---------- on a computer: the same scopes as a checklist (K14) ----------
// Finer areas than the phone's, each scope in exactly one of them. `main` are the ones in front; the rest open on demand.
export type DeskArea = Area & { main?: boolean; short?: string; /** What the write level is called here, when it is not "קריאה ושינוי". */ writeHe?: string };
export const DESK_AREAS: DeskArea[] = [
  { id: 'tasks', he: 'משימות', main: true, read: ['tasks:read', 'templates:read', 'projects:read'], write: ['tasks:create', 'tasks:assign', 'tasks:complete', 'tasks:edit', 'templates:write', 'projects:write'] },
  { id: 'shopping', he: 'קניות', main: true, read: ['shopping:read'], write: ['shopping:write'] },
  { id: 'messages', he: 'הודעות לצוות', short: 'הודעות', main: true, writeHe: 'שליחה', read: ['broadcasts:read'], write: ['broadcasts:write', 'broadcasts:urgent'] },
  { id: 'events', he: 'אירועים וכרטיסים', short: 'אירועים', main: true, read: ['events:read', 'tickets:read', 'tabs:read', 'vendors:read'], write: ['events:write', 'tickets:write', 'tabs:write', 'vendors:write'] },
  { id: 'people', he: 'אנשים', main: true, read: ['people:read'], write: ['people:write'] },
  { id: 'money', he: 'כסף', main: true, read: ['donations:read'], write: ['donations:write', 'tabs:settle'] },
  { id: 'places', he: 'מקומות', read: ['places:read'], write: ['places:write'] },
  { id: 'visits', he: 'ביקורים', read: ['visits:read'], write: ['visits:write'] },
  { id: 'calendar', he: 'יומן ונוכחות', read: ['calendar:read'], write: ['calendar:write', 'presence:write'] },
  { id: 'notifications', he: 'התראות', read: ['notifications:read'], write: ['notifications:write', 'notify:team', 'notify:all'] },
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
