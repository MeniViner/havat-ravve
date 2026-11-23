// Q18-Profile (replaces L6-Me and C12-Profile), C13-ProfileEdit and the notification preferences sheet.
// Q18: "עריכת פרטים" is the underlined link at the top end; registration answers are edited in /me/edit, not listed here;
// the farm website, terms and the demo are quiet links beside "יציאה מהחשבון"; account deletion is at the bottom of /me/edit.
import { useState } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { TopBar, Button, Icon, StatRow, StatTile, DetailList, DetailRow, TextLink, ListCard, Row, IconTile, FormHeader, Field, BottomBar, Toggle, Sheet, UnderlineLink, initials } from '../../kit';
import { back } from '../../../router';
import { signOutUser } from '../../../firebase';
import { useDemo, setDemo } from '../../../demo/store';
import { setViewAsStaff } from '../../App';
import type { ScreenProps } from '../../ctx';
import type { Profile } from '../../../types';
import { revokeThisDevice, usePush, PUSH_KINDS } from '../../data/push';
import { PushSettings } from '../broadcast';
import { setUpdatesOptIn } from '../../data/broadcast';
import type { V2Ctx } from '../../ctx';
import {
  roleWord, sinceText, photoOf, sourceOf, useMyCounts, usePresenceText, useGooglePhotoSync,
  receiptOf, saveProfile, parseBirth, birthText, registrationQuestions, answersFor, missingAnswers, type ProfileDraft,
} from '../../data/system';
import { RegistrationQuestions } from './fields';
import { isNative, openSitePage } from '../../../native';
import './system.css';

export function signOutEverywhere(demoOn: boolean, profile?: Profile) {
  if (demoOn) { setDemo({ persona: 'anon' }); go('/', true); return; }
  // this phone stops getting pushes for this account (best effort; sign-out never waits for it)
  const revoke = profile ? revokeThisDevice(profile).catch(() => {}) : Promise.resolve();
  void Promise.race([revoke, new Promise((r) => setTimeout(r, 1500))]).then(() => signOutUser()).then(() => go('/', true));
}

/** Q18 (L6 / C12): the same structure; managers and owners get the number, "view as volunteer", and no "contact managers". */
export function ProfileScreen({ ctx }: ScreenProps) {
  const p = ctx.profile;
  const demo = useDemo();
  const vendor = ctx.role === 'vendor';
  const lead = ctx.manager || ctx.owner;
  const counts = useMyCounts(ctx);
  const presence = usePresenceText(ctx.user.uid, ctx.today, !vendor);
  const [notifs, setNotifs] = useState(false);
  useGooglePhotoSync(p);
  const src = photoOf(p);
  const kinds = usePush(p).kinds;
  const role = ctx.viewAsStaff ? 'מתנדב' : roleWord(p, ctx.owner, ctx.manager);
  const sub = [role, lead && p.customerNumber ? `מספר ${p.customerNumber}` : '', sinceText(p.createdAt)].filter(Boolean).join(' · ');
  return (
    <AppScreen variant="root" gap={10}>
      <TopBar className="system-pull" back={{ label: 'חזרה', onClick: () => back(vendor ? '/vendor' : '/tasks') }}
        end={<UnderlineLink icon="edit" onClick={() => go('/me/edit')}>עריכת פרטים</UnderlineLink>} />
      <div className="system-me">
        <button type="button" className="system-me__avatar" aria-label="החלפת תמונת הפרופיל" onClick={() => go('/me/photo')}>
          {src ? <img src={src} alt="" /> : initials(p.displayName || '')}
          <span className="system-me__badge" aria-hidden="true"><Icon name="camera" size={16} /></span>
        </button>
        <div className="system-me__text"><b className="system-me__name">{p.displayName}</b><span className="system-me__role">{sub}</span></div>
      </div>
      {!vendor && (
        <StatRow>
          <StatTile value={counts.day} label="בוצעו היום" />
          <StatTile value={counts.week} label="השבוע" />
          <StatTile value={counts.month} label="החודש" />
        </StatRow>
      )}
      <DetailList className="system-dl">
        <DetailRow term="טלפון"><span dir="ltr">{p.phone || '—'}</span></DetailRow>
        <DetailRow term="מייל"><span dir="ltr">{p.email}</span></DetailRow>
        {!vendor && <DetailRow term="בחווה" action={<TextLink onClick={() => go('/farm/presence')}>שינוי</TextLink>}>{presence}</DetailRow>}
      </DetailList>
      <ListCard>
        <Row leading={<IconTile icon="bell-settings" />} title="התראות" meta={`${kinds.length} מתוך ${PUSH_KINDS.length} פעילות`} onClick={() => setNotifs(true)} />
        {(lead || ctx.viewAsStaff) && (
          <Row leading={<IconTile icon="people" />} title="לראות את האפליקציה כמו מתנדב"
            meta={ctx.viewAsStaff ? 'פעיל עכשיו. נגיעה מחזירה לתצוגה הרגילה' : 'בלי ניהול ובלי פרויקטים'} onClick={() => setViewAsStaff(!ctx.viewAsStaff)} />
        )}
        {!lead && !ctx.viewAsStaff && !vendor && <Row leading={<IconTile icon="people" />} title="פנייה למנהלים" meta="שאלה, בקשה או בעיה" onClick={() => go('/contact?from=team')} />}
        {!isNative && <Row leading={<IconTile icon="download" />} title="התקנה למסך הבית" meta="" onClick={() => go('/install')} />}
        {!vendor && <Row leading={<IconTile icon="ticket" />} title="הכרטיסים שלי כאורח" meta="" onClick={() => go('/me/tickets')} />}
      </ListCard>
      <div className="system-foot">
        <Button variant="outline" onClick={() => signOutEverywhere(demo.on, p)}>יציאה מהחשבון</Button>
        <Button variant="quiet" onClick={() => openSitePage('/')}>האתר של החווה</Button>
        <Button variant="quiet" onClick={() => go('/terms')}>תנאי שימוש</Button>
        {/* the demo link (parity): a quiet link too, only while the demo is off */}
        {!demo.on && <Button variant="quiet" onClick={() => go('/demo')}>הדגמה</Button>}
      </div>
      <NotificationsSheet open={notifs} onClose={() => setNotifs(false)} ctx={ctx} />
    </AppScreen>
  );
}

/** The notification preferences behind the L6 / C12 "התראות" row: the push area's settings (device subscription + kinds on users/{uid}.push). */
function NotificationsSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: V2Ctx }) {
  const kinds = usePush(ctx.profile).kinds;
  return (
    <Sheet open={open} onClose={onClose} title="התראות" aside={`${kinds.length} מתוך ${PUSH_KINDS.length} פעילות`}>
      <PushSettings ctx={ctx} />
    </Sheet>
  );
}

const PHOTO_META = { custom: 'תמונה משלי', google: 'מחשבון Google', none: 'רק ראשי התיבות' } as const;

/** C13: my details. Only my own fields; the e-mail comes from Google and is locked. */
export function ProfileEdit({ ctx }: ScreenProps) {
  const p = ctx.profile;
  const toast = useToast();
  const all = registrationQuestions(ctx.settings.registrationFields);
  // C13 has its own "יישוב" and "תאריך לידה" fields: a sign-up question asking the same is not asked twice (rule 7);
  // on save its answer follows the field
  const townQ = all.find((f) => f.type !== 'date' && f.label.includes('יישוב'));
  const birthQ = all.find((f) => f.type === 'date' && f.label.includes('לידה'));
  const questions = all.filter((f) => f !== townQ && f !== birthQ);
  const a0 = answersFor(p.fields, all);
  const [d, setD] = useState<ProfileDraft>({ displayName: p.displayName || '', phone: p.phone || '', town: p.town || (townQ ? a0[townQ.id] || '' : ''),
    birthDate: birthText(p.birthDate || (birthQ ? a0[birthQ.id] || '' : '')), receipt: receiptOf(p), answers: a0 });
  const [optIn, setOptIn] = useState(p.updatesOptIn === true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = photoOf(p);
  const nameErr = tried && !d.displayName.trim() ? 'צריך שם' : '';
  const birthErr = tried && parseBirth(d.birthDate) === null ? 'תאריך בצורה 14.03.1975' : '';
  const townMissing = !!townQ?.required && !d.town.trim();
  const birthMissing = !!birthQ?.required && !d.birthDate.trim();
  const missing = [...missingAnswers(d.answers, questions), ...(townMissing ? [townQ!.id] : []), ...(birthMissing ? [birthQ!.id] : [])];
  const save = async () => {
    setTried(true);
    if (!d.displayName.trim() || parseBirth(d.birthDate) === null || missing.length || busy) return;
    setBusy(true);
    const answers = { ...(d.answers || {}) };
    if (townQ) answers[townQ.id] = d.town.trim();
    if (birthQ) answers[birthQ.id] = parseBirth(d.birthDate) || '';
    try { await saveProfile(p, { ...d, answers }); if (optIn !== (p.updatesOptIn === true)) await setUpdatesOptIn(p.uid, optIn); toast.show({ text: 'נשמר', duration: 2500 }); back('/me'); }
    catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const set = (k: keyof ProfileDraft) => (e: { target: { value: string } }) => setD((s) => ({ ...s, [k]: e.target.value }));
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow disabled={busy} onClick={save}>שמירה</Button></BottomBar>}>
      <FormHeader title="הפרטים שלי" onCancel={() => back('/me')} />
      <button type="button" className="system-photorow" onClick={() => go('/me/photo')}>
        <span className="k-avatar k-avatar--me" style={{ width: 48, height: 48, fontSize: 16 }} aria-hidden="true">{src ? <img className="k-avatar__img" src={src} alt="" /> : initials(p.displayName || '')}</span>
        <span className="system-photorow__body"><span className="system-photorow__title">תמונת פרופיל</span><span className="system-photorow__meta">{PHOTO_META[sourceOf(p)]}</span></span>
        <span className="system-photorow__action">החלפה</span>
      </button>
      <Field label="שם בעברית" value={d.displayName} onChange={set('displayName')} maxLength={80} error={nameErr} autoComplete="name" />
      <Field label="טלפון" ltr value={d.phone} onChange={set('phone')} maxLength={25} inputMode="tel" autoComplete="tel" />
      <Field label={townQ?.required ? 'יישוב *' : 'יישוב'} value={d.town} onChange={set('town')} maxLength={60} error={tried && townMissing ? 'צריך למלא' : ''} />
      <Field label={birthQ?.required ? 'תאריך לידה *' : 'תאריך לידה'} value={d.birthDate} onChange={set('birthDate')} placeholder={birthQ?.required ? '14.03.1975' : 'לא חובה'} inputMode="numeric"
        error={birthErr || (tried && birthMissing ? 'צריך למלא' : '')} />
      <RegistrationQuestions questions={questions} answers={d.answers || {}} missing={tried ? missing : []}
        onChange={(id, v) => setD((s) => ({ ...s, answers: { ...s.answers, [id]: v } }))} />
      <DetailList className="system-dl"><DetailRow term="מייל"><span dir="ltr">{p.email}</span></DetailRow></DetailList>
      <span className="system-note">המייל מגיע מחשבון Google, ולכן אי אפשר לשנות אותו כאן.</span>
      <ListCard>
        <Row className="system-togglerow" title="אישורי תשלום" meta={`לאן לשלוח לי אישור כשאני משלם כאורח: ${d.receipt === 'whatsapp' ? 'וואטסאפ' : 'מייל'}`}
          actions={<Toggle checked={d.receipt === 'whatsapp'} onChange={(v) => setD((s) => ({ ...s, receipt: v ? 'whatsapp' : 'email' }))} label="אישורי תשלום" />} />
        {/* tidy round (U13 copy): consent to update messages to all users (Q26 "כל המשתמשים" reaches only people with this on) */}
        <Row className="system-togglerow" title="לקבל עדכונים מהחווה" meta="אירועים חדשים, כמה פעמים בשנה"
          actions={<Toggle checked={optIn} onChange={setOptIn} label="לקבל עדכונים מהחווה" />} />
      </ListCard>
      {/* account deletion lives at the bottom of the edit-details screen (moved from the profile foot, as on the guest account) */}
      <div className="system-foot"><Button variant="quiet" onClick={() => go('/delete-account')}>מחיקת החשבון</Button></div>
    </AppScreen>
  );
}
