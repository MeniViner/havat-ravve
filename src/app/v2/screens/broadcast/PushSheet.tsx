// "מה לקבל" (C1): phone push on this device, and which kinds reach the lock screen.
// The permission prompt is asked only from the tap on "להפעיל" (iPhone asks only from a user gesture).
// PushSettings is the same content without the sheet, for the profile's notification row (L6 / C12, system area).
import { useState, type ReactNode } from 'react';
import { useToast, go } from '../../core';
import { Button, Card, ListCard, Row, Sheet, Toggle } from '../../kit';
import type { V2Ctx } from '../../ctx';
import { PUSH_KINDS, disablePush, enablePush, setPushKinds, usePush, type PushKind, type PushState } from '../../data/push';

const NOTE: Record<PushState, string> = {
  on: 'פעיל בטלפון הזה',
  ask: 'כבוי בטלפון הזה',
  denied: 'חסום בהגדרות הטלפון. אפשר לאשר שוב בהגדרות של האתר או של הטלפון.',
  'needs-install': 'באייפון מקבלים התראות רק אחרי שמוסיפים את האפליקציה למסך הבית.',
  unsupported: 'הדפדפן הזה לא מקבל התראות. אפשר לפתוח את האפליקציה ב־Chrome או ב־Safari.',
  off: 'התראות לטלפון עוד לא הופעלו בחווה. הכל מופיע כאן באפליקציה.',
};

export function PushSettings({ ctx }: { ctx: V2Ctx }): ReactNode {
  const toast = useToast();
  const push = usePush(ctx.profile);
  const [busy, setBusy] = useState(false);
  const readOnly = ctx.viewAsStaff;

  async function turnOn() {
    if (busy || readOnly) return;
    setBusy(true);
    try {
      const s = await enablePush(ctx.profile, push.config);
      push.refresh();
      if (s === 'on') toast.show({ text: 'התראות לטלפון הופעלו' });
      else if (s === 'denied') toast.show({ text: NOTE.denied, check: false });
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function turnOff() {
    if (busy || readOnly) return;
    setBusy(true);
    try { await disablePush(ctx.profile); push.refresh(); } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } finally { setBusy(false); }
  }
  const toggleKind = (k: PushKind) => {
    if (readOnly) return;
    const next = push.kinds.includes(k) ? push.kinds.filter((x) => x !== k) : [...push.kinds, k];
    setPushKinds(ctx.profile, next).catch((e) => toast.refused(`לא נשמר. ${(e as Error).message}`));
  };

  const s = push.state;
  const action = s === 'on'
    ? <Toggle checked label="התראות לטלפון" onChange={turnOff} disabled={busy || readOnly} />
    : s === 'ask' ? <Button variant="outline" onClick={turnOn} disabled={busy || readOnly}>להפעיל</Button>
    : s === 'needs-install' ? <Button variant="outline" onClick={() => go('/install')}>איך מוסיפים</Button>
    : undefined;
  return (
    <>
      <Card as="section">
        <ul className="k-list k-list--flush">
          <Row minHeight={64} title="התראות לטלפון" meta={NOTE[s]} actions={action} />
        </ul>
      </Card>
      <ListCard title="מה יקפוץ בטלפון">
        {PUSH_KINDS.map((k) => (
          <Row key={k.key} title={k.label} actions={<Toggle checked={push.kinds.includes(k.key)} label={k.label} onChange={() => toggleKind(k.key)} disabled={readOnly} />} />
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
