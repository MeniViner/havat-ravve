// Q27 "להוסיף מישהו מראש": adding someone ahead of time by phone. A one-time link (team_links/{code}) built like the vendor
// access link (vendor_invites/{code}, ?k= in the URL, claimed at first sign-in, used once). The role is granted only when the
// person signs in with Google through the link, never by matching the typed phone number: phone numbers are not verified in
// this app. The phone and the name are labels for the pending list. Rules: firestore.rules match /team_links and the users
// create/update branches that use a link (claimsTeamLink).
import { useMemo } from 'react';
import { useList, write, transact, ConflictError } from '../../db';
import { nowIso, nowMs } from '../../clock';
import { logActivity } from '../../activity';
import { isFemale } from '../gender';
import { ROLE_LABELS } from '../../types';
import type { Actor, Profile, RoleInvite } from '../../types';
import type { Session } from '../../firebase';

export type TeamRole = 'staff' | 'manager' | 'owner';
export type TeamLink = {
  id?: string; code: string; role: TeamRole; name: string; phone: string; fem?: boolean;
  active: boolean; usedBy: string | null; usedAt: string | null; createdBy: Actor; createdAt: string;
  /** Epoch milliseconds; the rules compare it with request.time. */
  expiresMs: number;
};

/** How long a link stays good. The rules refuse a lifetime longer than 15 days (a day of clock slack). */
export const LINK_DAYS = 14;
const DAY = 86400_000;

/** Team links start with "t-"; vendor codes never do (12 letters and digits, no dash). Both arrive as ?k= in the URL. */
export const isTeamLink = (code: string) => /^t-[a-z0-9]{12,30}$/.test(code || '');
const newCode = () => {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = 't-';
  const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(14)) : Array.from({ length: 14 }, () => Math.floor(Math.random() * 256));
  for (const b of rnd) s += abc[b % abc.length];
  return s;
};
const origin = () => (typeof location !== 'undefined' ? location.origin : 'https://havat-ravve.web.app');
/** The link in the WhatsApp message: the sign-in page, which remembers the code across the Google redirect. */
export const teamLinkUrl = (code: string) => `${origin()}/app/login?k=${code}`;

/** A link is good while it is active, unused and not expired. */
export const linkOpen = (l: Pick<TeamLink, 'active' | 'usedBy' | 'expiresMs'> | null | undefined, now = nowMs()) =>
  !!l && l.active === true && !l.usedBy && typeof l.expiresMs === 'number' && l.expiresMs > now;

const ROLE_AS: Record<TeamRole, [string, string]> = { staff: ['כמתנדב', 'כמתנדבת'], manager: ['כמנהל', 'כמנהלת'], owner: ['כבעלים', 'כבעלים'] };
export const roleAs = (role: TeamRole, fem?: boolean) => ROLE_AS[role][fem ? 1 : 0];

/** The prepared WhatsApp text. */
export function linkText(l: Pick<TeamLink, 'name' | 'role' | 'fem' | 'code'>) {
  const first = (l.name || '').trim().split(/\s+/)[0] || '';
  return `שלום${first ? ' ' + first : ''}, הוספתי אותך לצוות של חוות רווה ${roleAs(l.role, l.fem)}. נכנסים כאן עם חשבון Google: ${teamLinkUrl(l.code)} הקישור טוב לכניסה אחת, בתוקף ${LINK_DAYS} ימים.`;
}

/** Managers: the links not yet used (open or expired; a cancelled link is deleted). */
export function useTeamLinks(enabled: boolean) {
  const r = useList<TeamLink>('team_links', { orderBy: [['createdAt', 'desc']] }, enabled);
  return useMemo(() => ({ ...r, items: r.items.filter((l) => !l.usedBy) }), [r]);
}

/** Q27 "שליחת קישור בוואטסאפ": creates the link and returns it with the WhatsApp text. */
export async function createTeamLink(actor: Actor, p: { phone: string; name: string; role: TeamRole }) {
  const name = p.name.trim().slice(0, 80);
  const link: TeamLink = {
    code: newCode(), role: p.role, name, phone: p.phone.trim().slice(0, 25), ...(name && isFemale(name) ? { fem: true } : {}),
    active: true, usedBy: null, usedAt: null, createdBy: actor, createdAt: nowIso(), expiresMs: nowMs() + LINK_DAYS * DAY,
  };
  await write.set('team_links', link.code, link as unknown as Record<string, unknown>);
  logActivity(actor, 'user', link.code, 'invited', `${name || link.phone} הוגדר/ה מראש כ${ROLE_LABELS[p.role]}`);
  return { link, text: linkText(link) };
}
/** "ביטול": the link is deleted, so it can no longer be claimed. */
export const cancelTeamLink = (code: string) => write.remove('team_links', code);
/** Undo of a cancel: the same link again (the message already sent works again). */
export const restoreTeamLink = (l: TeamLink) => {
  const { id: _id, ...data } = l;
  return write.set('team_links', l.code, data as unknown as Record<string, unknown>);
};

/** C9 for a new account that came through a team link: the link shown as the "X added you as …" invitation. */
export const linkAsInvite = (l: TeamLink, email: string): RoleInvite => ({ id: l.code, email, role: l.role, createdBy: l.createdBy, createdAt: l.createdAt });

export const LINK_GONE = 'הקישור כבר לא בתוקף. בקשו מהחווה קישור חדש.';

/** A guest account that opens a team link: one transaction reads the link (active, unused, not expired), gives the role and
 *  marks the link used. A new account claims inside createProfile (store.ts) instead, after the C9 details. */
export async function claimTeamLink(user: Session, code: string): Promise<TeamRole> {
  const at = nowIso();
  return transact(async (tx) => {
    const l = await tx.get<TeamLink>('team_links', code);
    if (!linkOpen(l)) throw new ConflictError(LINK_GONE);
    const me = await tx.get<Profile>('users', user.uid);
    if (!me) throw new ConflictError(LINK_GONE);
    if (me.role !== 'guest' || me.status !== 'active') throw new ConflictError('החשבון הזה כבר בצוות או מחובר לדוכן. נכנסים עם חשבון אחר.');
    tx.update('users', user.uid, { role: l!.role, teamLink: code, updatedAt: at });
    tx.update('team_links', code, { usedBy: user.uid, usedAt: at, active: false });
    return l!.role;
  });
}

