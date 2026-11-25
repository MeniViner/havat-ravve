// "מה לקבל" (C1): phone push on this device, and which kinds reach the lock screen.
// The permission prompt is asked only from the tap on "להפעיל" (iPhone asks only from a user gesture).
// PushSettings is the same content without the sheet, for the profile's notification row (L6 / C12, system area).
import { useState, type ReactNode } from 'react';
import { useToast, go } from '../../core';
import { Button, Card, ListCard, Row, Sheet, Toggle } from '../../kit';
import type { V2Ctx } from '../../ctx';
import type { Profile } from '../../../types';
import { PUSH_KINDS, disablePush, enablePush, setPushKinds, usePush, type PushKind, type PushState } from '../../data/push';

const NOTE: Record<PushState, string> = {
  on: 'פעיל במכשיר הזה. הודעות יכולות להופיע גם כשהאפליקציה סגורה.',
  ask: 'כבוי במכשיר הזה. לחצו להפעלה ואשרו התראות אם תתבקשו.',
  checking: 'בודקים אם אפשר לקבל התראות במכשיר.',
  unavailable: 'לא הצלחנו לבדוק את הגדרות ההתראות. נסו לרענן את הדף.',
  denied: 'חסום בהגדרות הטלפון. אפשר לאשר שוב בהגדרות של האתר או של הטלפון.',
  'needs-install': 'באייפון ובאייפד (גרסה 16.4 ומעלה), מוסיפים למסך הבית ופותחים מהאייקון כדי להפעיל התראות.',
  unsupported: 'הדפדפן הזה לא מקבל התראות. אפשר לפתוח את האפליקציה ב־Chrome או ב־Safari.',
  off: 'התראות לטלפון עוד לא הופעלו בחווה. הכל מופיע כאן באפליקציה.',
};

export function DevicePushRow({ profile, readOnly = false }: { profile: Profile; readOnly?: boolean }) {
  const toast = useToast();
  const push = usePush(profile);
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    if (busy || readOnly) return;
    setBusy(true);
    try {
      const s = await enablePush(profile, push.config);
      push.refresh();
      if (s === 'on') toast.show({ text: 'התראות לטלפון הופעלו' });
      else if (s === 'denied') toast.show({ text: NOTE.denied, check: false });
      else if (s === 'ask') toast.show({ text: 'לא ניתן אישור. אפשר לנסות שוב.', check: false });
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function turnOff() {
    if (busy || readOnly) return;
    setBusy(true);
    try { await disablePush(profile); push.refresh(); toast.show({ text: 'ההתראות כובו במכשיר הזה' }); } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } finally { setBusy(false); }
  }
  const s = push.state;
  const action = s === 'on'
    ? <Toggle checked label="התראות לטלפון" onChange={turnOff} disabled={busy || readOnly} />
    : s === 'ask' ? <Button variant="outline" onClick={turnOn} disabled={busy || readOnly}>{busy ? 'מפעילים…' : 'להפעיל'}</Button>
    : s === 'needs-install' ? <Button variant="outline" onClick={() => go('/install?notifications=1')}>איך מוסיפים</Button>
    : undefined;
  return <Row minHeight={64} title="התראות במכשיר" meta={NOTE[s]} actions={action} />;
}

export function PushSettings({ ctx }: { ctx: V2Ctx }): ReactNode {
  const toast = useToast();
  const { kinds } = usePush(ctx.profile);
  const readOnly = ctx.viewAsStaff;
  const toggleKind = (k: PushKind) => {
    if (readOnly) return;
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    setPushKinds(ctx.profile, next).catch((e) => toast.refused(`לא נשמר. ${(e as Error).message}`));
  };

  return (
    <>
      <Card as="section">
        <ul className="k-list k-list--flush">
          <DevicePushRow profile={ctx.profile} readOnly={readOnly} />
        </ul>
      </Card>
      <ListCard title="מה יקפוץ בטלפון">
        {PUSH_KINDS.map((k) => (
          <Row key={k.key} title={k.label} actions={<Toggle checked={kinds.includes(k.key)} label={k.label} onChange={() => toggleKind(k.key)} disabled={readOnly} />} />
        ))}
      </ListCard>
      <p className="broadcast-sheet__note">ההתראות כאן באפליקציה מגיעות תמיד, גם בלי התראות לטלפון.</p>
    </>
  );
}

export function PushSheet({ ctx, open, onClose }: { ctx: V2Ctx; open: boolean; onClose: () => void }): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="מה לקבל">
      <div className="broadcast-sheet"><PushSettings ctx={ctx} /></div>
    </Sheet>
  );
}
