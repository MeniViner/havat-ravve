// L6-Me (volunteer), C12-Profile (owner / manager), C13-ProfileEdit and the notification preferences sheet.
import { useState } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { TopBar, Button, Icon, StatRow, StatTile, DetailList, DetailRow, TextLink, ListCard, Row, IconTile, FormHeader, Field, BottomBar, Toggle, Sheet, initials } from '../../kit';
import { back } from '../../../router';
import { signOutUser } from '../../../firebase';
import { useDemo, setDemo } from '../../../demo/store';
import { setViewAsStaff } from '../../App';
import type { ScreenProps } from '../../ctx';
import type { Profile } from '../../../types';
import {
  roleWord, sinceText, photoOf, sourceOf, useMyCounts, usePresenceText, useGooglePhotoSync, pushKindsOf, savePushKinds, PUSH_KINDS,
  receiptOf, saveProfile, parseBirth, birthText, type ProfileDraft,
} from '../../data/system';
import './system.css';

export function signOutEverywhere(demoOn: boolean) {
  if (demoOn) { setDemo({ persona: 'anon' }); go('/', true); return; }
  void signOutUser().then(() => go('/', true));
}

/** L6 / C12: the same structure; managers and owners get the number, "view as volunteer", and no "contact managers". */
export function ProfileScreen({ ctx }: ScreenProps) {
  const p = ctx.profile;
  const demo = useDemo();
  const toast = useToast();
  const vendor = ctx.role === 'vendor';
  const lead = ctx.manager || ctx.owner;
  const counts = useMyCounts(ctx);
  const presence = usePresenceText(ctx.user.uid, ctx.today, !vendor);
  const [notifs, setNotifs] = useState(false);
  useGooglePhotoSync(p);
  const src = photoOf(p);
  const kinds = pushKindsOf(p);
  const role = ctx.viewAsStaff ? 'מתנדב' : roleWord(p, ctx.owner, ctx.manager);
  const sub = [role, lead && p.customerNumber ? `מספר ${p.customerNumber}` : '', sinceText(p.createdAt)].filter(Boolean).join(' · ');
  return (
    <AppScreen variant="root" gap={10}>
      <TopBar className="system-pull" back={{ label: 'חזרה', onClick: () => back(vendor ? '/vendor' : '/tasks') }}
        end={<Button variant="outline" icon="edit" iconSize={16} onClick={() => go('/me/edit')}>עריכה</Button>} />
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
        <Row leading={<IconTile icon="download" />} title="התקנה למסך הבית" meta="" onClick={() => go('/install')} />
        {!vendor && <Row leading={<IconTile icon="ticket" />} title="הכרטיסים שלי כאורח" meta="" onClick={() => go('/me/tickets')} />}
        {!demo.on && <Row leading={<IconTile icon="help" />} title="לראות איך האפליקציה עובדת" meta="הדגמה עם נתונים לא אמיתיים" onClick={() => go('/demo')} />}
      </ListCard>
      <div className="system-foot">
        <Button variant="outline" size="tall" onClick={() => signOutEverywhere(demo.on)}>יציאה מהחשבון</Button>
        <Button variant="quiet" onClick={() => go('/terms')}>תנאי שימוש</Button>
        <Button variant="quiet" onClick={() => go('/delete-account')}>מחיקת החשבון</Button>
      </div>
      <NotificationsSheet open={notifs} onClose={() => setNotifs(false)} profile={p} onError={(t) => toast.refused(t)} />
    </AppScreen>
  );
}

/** The notification preferences behind the L6 / C12 "התראות" row (stored on users/{uid}.push). */
function NotificationsSheet({ open, onClose, profile, onError }: { open: boolean; onClose: () => void; profile: Profile; onError: (t: string) => void }) {
  const kinds = pushKindsOf(profile);
  const set = (key: string, on: boolean) => {
    const next = on ? [...new Set([...kinds, key])] : kinds.filter((k) => k !== key);
    savePushKinds(profile, PUSH_KINDS.map((k) => k.key).filter((k) => next.includes(k))).catch((e: Error) => onError(`לא נשמר. ${e.message}`));
  };
  return (
    <Sheet open={open} onClose={onClose} title="התראות" aside={`${kinds.length} מתוך ${PUSH_KINDS.length} פעילות`}>
      <ListCard>
        {PUSH_KINDS.map((k) => (
          <Row key={k.key} className="system-togglerow" title={k.label} actions={<Toggle checked={kinds.includes(k.key)} onChange={(v) => set(k.key, v)} label={k.label} />} />
        ))}
      </ListCard>
      <span className="system-note">ההתראות עובדות אחרי שמתקינים על מסך הבית.</span>
    </Sheet>
  );
}

const PHOTO_META = { custom: 'תמונה משלי', google: 'מחשבון Google', none: 'רק ראשי התיבות' } as const;

/** C13: my details. Only my own fields; the e-mail comes from Google and is locked. */
export function ProfileEdit({ ctx }: ScreenProps) {
  const p = ctx.profile;
  const toast = useToast();
  const [d, setD] = useState<ProfileDraft>({ displayName: p.displayName || '', phone: p.phone || '', town: p.town || '', birthDate: birthText(p.birthDate), receipt: receiptOf(p) });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = photoOf(p);
  const nameErr = tried && !d.displayName.trim() ? 'צריך שם' : '';
  const birthErr = tried && parseBirth(d.birthDate) === null ? 'תאריך בצורה 14.03.1975' : '';
  const save = async () => {
    setTried(true);
    if (!d.displayName.trim() || parseBirth(d.birthDate) === null || busy) return;
    setBusy(true);
    try { await saveProfile(p, d); toast.show({ text: 'נשמר', duration: 2500 }); back('/me'); }
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
      <Field label="יישוב" value={d.town} onChange={set('town')} maxLength={60} />
      <Field label="תאריך לידה" value={d.birthDate} onChange={set('birthDate')} placeholder="לא חובה" inputMode="numeric" error={birthErr} />
      <DetailList className="system-dl"><DetailRow term="מייל"><span dir="ltr">{p.email}</span></DetailRow></DetailList>
      <span className="system-note">המייל מגיע מחשבון Google, ולכן אי אפשר לשנות אותו כאן.</span>
      <ListCard>
        <Row className="system-togglerow" title="אישורי תשלום" meta={`לאן לשלוח לי אישור כשאני משלם כאורח: ${d.receipt === 'whatsapp' ? 'וואטסאפ' : 'מייל'}`}
          actions={<Toggle checked={d.receipt === 'whatsapp'} onChange={(v) => setD((s) => ({ ...s, receipt: v ? 'whatsapp' : 'email' }))} label="אישורי תשלום" />} />
      </ListCard>
    </AppScreen>
  );
}
