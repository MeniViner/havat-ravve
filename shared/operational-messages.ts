export const eventGroups = ['registrants', 'crew', 'approvedVendors'] as const;
export type EventGroup = (typeof eventGroups)[number];
export const messageChannels = ['whatsapp', 'push', 'email'] as const;
export type MessageChannel = (typeof messageChannels)[number];
export type NoticePerson = { uid: string; name: string; phone: string; email: string; push: boolean; role?: string };
export type ReminderInputs = {
  profiles: {
    uid: string;
    displayName: string;
    role: string;
    status: string;
    phone?: string;
    email?: string;
    vendorId?: string;
    push?: unknown;
  }[];
  tickets: {
    id: string;
    ownerUid: string;
    ownerName: string;
    ownerPhone: string;
    status: string;
    paymentStatus: string;
    orderId: string;
    eventId: string;
    test?: boolean;
    selfRegistered?: boolean;
    walkIn?: boolean;
  }[];
  activity?: {
    kind: string;
    action: string;
    eventId: string;
    refId: string;
    subjectUid?: string;
    by?: { uid?: string };
  }[];
  applications?: { ownerUid: string; status: string }[];
  staffing: { people?: { uid: string }[] }[];
  stalls: { id: string; vendorId?: string; status?: string; confirmed?: boolean }[];
};
export const usableEmail = (raw: string) => /^[^\s@?&/#]+@[^\s@?&/#]+\.[^\s@?&/#]+$/.test(raw);
export function phoneDigits(raw: string) {
  const s = (raw || '').trim();
  if (!/^[+\d\s()-]+$/.test(s)) return '';
  const n = s.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '972');
  return /^[1-9]\d{7,14}$/.test(n) ? n : '';
}
export function noticePerson(p: ReminderInputs['profiles'][number]): NoticePerson {
  const prefs = p.push as { enabled?: boolean; devices?: unknown[]; kinds?: string[] } | undefined;
  return {
    uid: p.uid,
    role: p.role,
    name: p.displayName,
    phone: phoneDigits(p.phone || ''),
    email: usableEmail((p.email || '').trim()) ? p.email!.trim() : '',
    push:
      prefs?.enabled === true &&
      !!prefs.devices?.length &&
      (!Array.isArray(prefs.kinds) || prefs.kinds.includes('event')),
  };
}
export function eventReminderPeople(input: ReminderInputs, groups: readonly EventGroup[]) {
  const active = new Map(input.profiles.filter(p => p.status === 'active').map(p => [p.uid, p]));
  const people = new Map<string, NoticePerson>();
  const receipts = new Set(
    (input.activity || [])
      .filter(
        a =>
          a.kind === 'ticket' &&
          a.action === 'ordered' &&
          a.subjectUid &&
          a.subjectUid === a.by?.uid &&
          a.eventId &&
          a.refId,
      )
      .map(a => JSON.stringify([a.subjectUid, a.eventId, a.refId])),
  );
  if (groups.includes('registrants'))
    for (const t of input.tickets) {
      if (t.status !== 'valid' || t.paymentStatus === 'cancelled' || t.test) continue;
      const p = active.get(t.ownerUid);
      const linked =
        !t.walkIn &&
        !!t.ownerUid &&
        (t.selfRegistered === true ||
          (t.selfRegistered === undefined &&
            [t.orderId, t.id].some(ref => receipts.has(JSON.stringify([t.ownerUid, t.eventId, ref])))));
      if (p && linked) people.set(p.uid, noticePerson(p));
      else if (!linked && !t.walkIn) {
        const phone = phoneDigits(t.ownerPhone);
        if (phone) people.set('phone:' + phone, { uid: '', name: t.ownerName, phone, email: '', push: false });
      }
    }
  if (groups.includes('crew'))
    for (const station of input.staffing)
      for (const row of station.people || []) {
        const p = active.get(row.uid);
        if (p && ['staff', 'manager', 'owner'].includes(p.role)) people.set(p.uid, noticePerson(p));
      }
  if (groups.includes('approvedVendors')) {
    for (const a of input.applications || []) {
      const p = active.get(a.ownerUid);
      if (a.status === 'approved' && p) people.set(p.uid, noticePerson(p));
    }
    const vendors = new Set(
      input.stalls
        .filter(v => (v.status ? v.status === 'confirmed' : v.confirmed === true))
        .map(v => v.vendorId || v.id),
    );
    for (const p of active.values())
      if (p.role === 'vendor' && p.vendorId && vendors.has(p.vendorId)) people.set(p.uid, noticePerson(p));
  }
  // A manual copy of the same person's phone has only WhatsApp as a possible channel.
  for (const p of people.values()) if (p.uid && p.phone) people.delete('phone:' + p.phone);
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'he') || a.uid.localeCompare(b.uid));
}
export function whatsappDrafts(people: NoticePerson[], text: string) {
  const seen = new Set<string>();
  return people.flatMap(p => {
    const phone = phoneDigits(p.phone);
    if (!phone || seen.has(phone)) return [];
    seen.add(phone);
    return [{ uid: p.uid, name: p.name, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` }];
  });
}
export type VisitDecision = {
  status: 'approved' | 'rejected';
  date?: string;
  time?: string;
  managerNote?: string;
  expectedUpdatedAt: string;
};
