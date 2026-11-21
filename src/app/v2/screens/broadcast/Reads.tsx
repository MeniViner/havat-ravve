// B3-Read: who read a broadcast and who not yet, WhatsApp per person, "לשלוח שוב" (only to those without a receipt).
import { useMemo, useState, type ReactNode } from 'react';
import { AppScreen, go, useExternal, useRemove, useToast, waUrl } from '../../core';
import { Avatar, Button, ConfirmSheet, EmptyState, Hero, IconButton, ListCard, Row, TextLink, TopBar } from '../../kit';
import { dayTime, hhmm, initials, keyOf } from '../../format';
import type { ScreenProps } from '../../ctx';
import type { Profile } from '../../../types';
import { deleteBroadcast, firstName, isRead, resendBroadcast, sentLine, useBroadcast, usePresenceToday, useReceipts, type Receipt } from '../../data/broadcast';

const SHOWN = 3;

export function BroadcastReads({ ctx, params }: ScreenProps): ReactNode {
  const toast = useToast(); const open = useExternal();
  const { item: b, loading } = useBroadcast(params.id, ctx.manager);
  const receipts = useReceipts(params.id, ctx.manager);
  const presence = usePresenceToday(ctx.today, ctx.manager);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const remove = useRemove();

  const { unread, read } = useMemo(() => {
    const byUid = new Map(receipts.items.map((r) => [r.uid || r.id, r]));
    const here = new Map(presence.items.map((c) => [c.ownerUid, c]));
    const who = (uid: string): Profile | undefined => ctx.peopleByUid.get(uid);
    const unread: { uid: string; name: string; phone: string; note: ReactNode; seen: string }[] = [];
    const read: (Receipt & { name: string })[] = [];
    for (const uid of b?.recipients || []) {
      const r = byUid.get(uid); const p = who(uid);
      const name = p?.displayName || r?.name || '';
      if (isRead(r)) { read.push({ ...r!, name }); continue; }
      const c = here.get(uid);
      const hours = c ? (c.from && c.to ? `${c.from}–${c.to}` : c.time || '') : '';
      // no receipt at all: the card never reached their phone yet
      const note = !r ? 'עוד לא נכנס לאפליקציה' : c ? (hours ? <>בחווה היום, <span className="k-ltr">{hours}</span></> : 'בחווה היום') : 'לא בחווה היום';
      unread.push({ uid, name, phone: p?.phone || '', note, seen: r?.seenAt || '' });
    }
    // who saw it first comes first; people whose phone has not shown it yet at the end
    unread.sort((x, y) => (x.seen ? 0 : 1) - (y.seen ? 0 : 1) || x.seen.localeCompare(y.seen) || x.name.localeCompare(y.name, 'he'));
    // the sender's own receipt is written with the broadcast: list them last, the others in the order they read
    read.sort((x, y) => (x.uid === b?.by.uid ? 1 : 0) - (y.uid === b?.by.uid ? 1 : 0) || String(x.at).localeCompare(String(y.at)));
    return { unread, read };
  }, [b, receipts.items, presence.items, ctx.peopleByUid]);

  async function resend() {
    if (!b || busy) return;
    setBusy(true);
    try {
      const n = await resendBroadcast(ctx.actor, b, receipts.items);
      toast.show({ text: n === 1 ? 'נשלח שוב לאדם אחד' : `נשלח שוב ל־${n} אנשים` });
    } catch (e) { toast.refused(`לא נשמר. ${(e as Error).message}`); } finally { setBusy(false); }
  }

  const backBar = <TopBar back={{ label: 'הודעות', onClick: () => go('/manage/broadcasts') }} end={b && ctx.owner ? <Button variant="quiet" onClick={() => setAskDelete(true)}>מחיקה</Button> : undefined} />;
  if (!b) return <AppScreen variant="detail" gap={10}>{backBar}{!loading && <EmptyState variant="card" icon="megaphone" title="ההודעה לא נמצאה" />}</AppScreen>;
  const shown = all ? read : read.slice(0, SHOWN);
  return (
    <AppScreen variant="detail" gap={10}>
      {backBar}
      <Hero>
        <span className="k-hero__meta">{sentLine(b)}</span>
        <span className="broadcast-hero__text">{b.text}</span>
      </Hero>
      {unread.length > 0 && (
        <ListCard title="עוד לא קראו" count={unread.length} end={<TextLink onClick={resend}>לשלוח שוב</TextLink>}>
          {unread.map((p) => (
            <Row key={p.uid} minHeight={56} leading={<Avatar initials={initials(p.name)} size={32} />} title={p.name} meta={p.note}
              actions={p.phone ? <IconButton icon="message" variant="outline" label={`וואטסאפ ל${firstName(p.name)}`} onClick={() => open(waUrl(p.phone, b.text))} /> : undefined} />
          ))}
        </ListCard>
      )}
      <ListCard title="קראו" count={read.length} end={!all && read.length > SHOWN ? <TextLink onClick={() => setAll(true)}>עוד {read.length - SHOWN}</TextLink> : undefined}>
        {shown.map((r) => <Row key={r.uid} minHeight={50} leading={<Avatar initials={initials(r.name)} size={32} />} title={r.name} meta={<span className="k-num">{r.at ? (keyOf(r.at) === keyOf(b.createdAt) ? hhmm(r.at) : dayTime(r.at)) : ''}</span>} />)}
      </ListCard>
      <ConfirmSheet open={askDelete} onClose={() => setAskDelete(false)} title="למחוק את ההודעה?"
        text="ההודעה תימחק מהרשימה ומהמסך של הצוות. מי שכבר קיבל אותה עדיין רואה אותה בהתראות שלו." confirmLabel="מחיקה"
        onConfirm={() => remove(() => deleteBroadcast(b), { text: 'ההודעה נמחקה', after: () => go('/manage/broadcasts', true) })} />
    </AppScreen>
  );
}
