// Q27 "להוסיף מישהו מראש" (/manage/people/invite): by phone (a one-time WhatsApp link, claimed at Google sign-in; data/invite.ts)
// or by e-mail (role_invites, as before). The pending list shows both kinds, each row with one "ביטול".
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useExternal, useToast, waUrl } from '../../core';
import { BottomBar, Button, Field, FormHeader, ListCard, Row, Segmented } from '../../kit';
import { nowMs } from '../../../clock';
import { contactPhoneOk } from '../../../data';
import { useDemo } from '../../../demo/store';
import {
  usePeople, useRoleInvites, useTeamLinks, roleWord, inviteRolesFor, emailOk, gw, inviteRole, cancelInvite,
  createTeamLink, cancelTeamLink, restoreTeamLink, linkOpen, useRun, type InviteRole, type TeamLink, type RoleInvite,
} from '../../data/manage';
import './manage.css';

type How = 'phone' | 'email';
/** "היום", "אתמול", "לפני 3 ימים": when a pending invite or link was sent (Q27, and G5's phone links). */
export const agoDays = (iso: string) => {
  const d = Math.floor((nowMs() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? 'היום' : d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : d === 7 ? 'לפני שבוע' : d === 14 ? 'לפני שבועיים' : `לפני ${d} ימים`;
};
/** Phone numbers compared by their digits (052-000-0188, +972520000188 and 0520000188 are the same number). */
const digits = (s: string) => (s || '').replace(/\D/g, '').replace(/^972/, '0');

type Pending = { kind: 'email'; at: string; invite: RoleInvite } | { kind: 'phone'; at: string; link: TeamLink };

export function InviteScreen({ ctx }: ScreenProps) {
  const emailInvites = useRoleInvites(true).items;
  const links = useTeamLinks(true).items;
  const people = usePeople(true).items;
  const allowed = inviteRolesFor(ctx.owner);
  const [how, setHow] = useState<How>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('staff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRun(); const open = useExternal(); const toast = useToast(); const demo = useDemo();

  const pending = useMemo<Pending[]>(() => [
    ...emailInvites.map((invite) => ({ kind: 'email' as const, at: invite.createdAt, invite })),
    ...links.map((link) => ({ kind: 'phone' as const, at: link.createdAt, link })),
  ].sort((a, b) => (a.at || '').localeCompare(b.at || '')), [emailInvites, links]); // oldest first, as Q27 lists them

  const existing = how === 'email'
    ? people.find((p) => p.email && p.email.toLowerCase() === email.trim().toLowerCase())
    : digits(phone).length >= 9 ? people.find((p) => p.phone && digits(p.phone) === digits(phone)) : undefined;
  const switchHow = (h: How) => { setHow(h); setError(''); };

  const saveEmail = async () => {
    const e = email.trim().toLowerCase();
    if (!emailOk(e)) { setError('כתובת מייל לא תקינה'); return; }
    if (existing) { setError(''); go(`/manage/people/${existing.uid}`); return; }
    const ok = `${e} ${role === 'owner' ? 'יקבל תפקיד בעלים' : `יקבל תפקיד ${roleWord(role, false)}`} בכניסה הראשונה`;
    if (await run(() => inviteRole(ctx.actor, e, role), ok)) { setEmail(''); setError(''); }
  };
  const sendLink = async () => {
    if (!contactPhoneOk(phone)) { setError('מספר טלפון לא תקין'); return; }
    if (existing) { setError(''); go(`/manage/people/${existing.uid}`); return; }
    if (busy) return;
    setBusy(true);
    let made: Awaited<ReturnType<typeof createTeamLink>> | null = null;
    const ok = await run(async () => { made = await createTeamLink(ctx.actor, { phone, name, role }); });
    setBusy(false);
    if (!ok || !made) return;
    const { link, text } = made as Awaited<ReturnType<typeof createTeamLink>>;
    open(waUrl(link.phone, text)); // in demo nothing leaves the browser: the demo toast says so
    if (!demo.on) toast.show({ text: `${link.name || link.phone} ${link.fem ? 'נוספה' : 'נוסף'} מראש. הקישור נפתח בוואטסאפ`, check: true });
    setPhone(''); setName(''); setError('');
  };
  const cancel = (p: Pending) => p.kind === 'email'
    ? run(() => cancelInvite(p.invite.id), { text: `בוטל: ${p.invite.email}`, undo: () => inviteRole(ctx.actor, p.invite.email, p.invite.role) })
    : run(() => cancelTeamLink(p.link.code), { text: `הקישור בוטל: ${p.link.name || p.link.phone}`, undo: () => restoreTeamLink(p.link) });

  const openCard = existing ? 'פתיחת הכרטיס שלו' : '';
  const bar = how === 'phone'
    ? <Button size="bar" grow icon={existing ? undefined : 'message'} iconSize={22} disabled={busy} onClick={sendLink}>{openCard || 'שליחת קישור בוואטסאפ'}</Button>
    : <Button size="bar" grow onClick={saveEmail}>{openCard || 'שמירת התפקיד'}</Button>;
  const existingHint = existing ? `${existing.displayName} כבר ${gw(existing.displayName, 'רשום', 'רשומה')}. את התפקיד משנים בכרטיס שלו.` : undefined;

  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar>{bar}</BottomBar>}>
      <FormHeader title="להוסיף מישהו מראש" onCancel={() => go('/manage/people')} />
      <Segmented className="manage-seg" label="איך" value={how} onChange={switchHow}
        options={[{ value: 'phone', label: 'לפי טלפון' }, { value: 'email', label: 'לפי מייל' }]} />
      {how === 'phone' ? (
        <>
          <Field label="מספר הטלפון" ltr type="tel" inputMode="tel" autoComplete="off" placeholder="05" maxLength={25} value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(''); }} error={error || undefined} hint={existingHint} />
          <Field label="שם (לא חובה)" placeholder="כדי שנזהה אותו ברשימה" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </>
      ) : (
        <Field label="כתובת Google של האדם" ltr type="email" inputMode="email" autoComplete="off" placeholder="name@gmail.com" value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }} error={error || undefined} hint={existingHint} />
      )}
      <div className="manage-group" style={{ gap: 8 }}>
        <span className="manage-group__label">איזה תפקיד</span>
        <Segmented className="manage-seg" label="תפקיד" value={role} onChange={setRole}
          options={allowed.map((r) => ({ value: r, label: roleWord(r, false) }))} />
      </div>
      {how === 'phone' && <span className="manage-hint">הוא מקבל קישור בוואטסאפ, נכנס עם חשבון Google שלו, והתפקיד מחכה לו. הקישור טוב לכניסה אחת.</span>}
      {!ctx.owner && <span className="manage-hint">רק בעלים יכולים למנות מנהלים ובעלים.</span>}
      {pending.length > 0 && (
        <ListCard title="נוספו מראש ועוד לא נכנסו" count={pending.length} aria-label="נוספו מראש ועוד לא נכנסו">
          {pending.map((p) => p.kind === 'email' ? (
            <Row key={'e:' + p.invite.id} minHeight={56} title={<span dir="ltr">{p.invite.email}</span>}
              meta={`${roleWord(p.invite.role, false)} · לפי מייל · ${agoDays(p.invite.createdAt)}`}
              actions={<Button variant="quiet" onClick={() => cancel(p)}>ביטול</Button>} />
          ) : (
            <Row key={'p:' + p.link.code} minHeight={56} title={p.link.name || <span dir="ltr">{p.link.phone}</span>}
              meta={`${roleWord(p.link.role, !!p.link.fem)} · לפי טלפון · ${linkOpen(p.link) ? `הקישור נשלח ${agoDays(p.link.createdAt)}` : 'הקישור פג תוקף'}`}
              actions={<Button variant="quiet" onClick={() => cancel(p)}>ביטול</Button>} />
          ))}
        </ListCard>
      )}
    </AppScreen>
  );
}
