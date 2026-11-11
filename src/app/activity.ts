// Activity log: one append-only record per meaningful change, so every screen can show "who did what, when".
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, type QueryConstraint, type DocumentData } from 'firebase/firestore';
import { db, nowIso } from './firebase';
import type { Activity, ActivityKind, Actor } from './types';

export function logActivity(by: Actor, kind: ActivityKind, refId: string, action: string, text: string, extra: { subjectUid?: string; eventId?: string } = {}) {
  const ref = doc(collection(db, 'activity'));
  return setDoc(ref, { kind, refId, action, text: text.slice(0, 500), by, at: nowIso(), subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' }).catch(() => {});
}

function useActivityQuery(constraints: QueryConstraint[], enabled: boolean, key: string) {
  const [state, setState] = useState<{ items: Activity[]; loading: boolean }>({ items: [], loading: enabled });
  useEffect(() => {
    if (!enabled) { setState({ items: [], loading: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(query(collection(db, 'activity'), ...constraints), (snap) => setState({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as Activity), loading: false }), () => setState({ items: [], loading: false }));
  }, [enabled, key]);
  return state;
}

export const useActivityFor = (refId: string, enabled = true) => useActivityQuery([where('refId', '==', refId), orderBy('at', 'desc'), limit(100)], enabled && !!refId, 'ref' + refId);
export const useActivityByKind = (kind: ActivityKind | 'all', enabled: boolean, max = 200) => useActivityQuery(kind === 'all' ? [orderBy('at', 'desc'), limit(max)] : [where('kind', '==', kind), orderBy('at', 'desc'), limit(max)], enabled, 'kind' + kind + max);
export const useActivityForUser = (uid: string, enabled: boolean) => useActivityQuery([where('subjectUid', '==', uid), orderBy('at', 'desc'), limit(100)], enabled && !!uid, 'user' + uid);
export const useActivityForEvent = (eventId: string, enabled: boolean) => useActivityQuery([where('eventId', '==', eventId), orderBy('at', 'desc'), limit(200)], enabled && !!eventId, 'ev' + eventId);

export const ACTION_LABELS: Record<string, string> = {
  created: 'נוצר', edited: 'נערך', done: 'בוצע', undone: 'הוחזר לביצוע', deleted: 'נמחק', photo: 'תמונה נוספה', note: 'הערה נוספה', assigned: 'הוקצה',
  bought: 'נקנה', unbought: 'הוחזר לרשימה', found: 'נמצא', added: 'נוסף',
  scanned: 'נסרק', paid: 'סומן שולם', claimed: 'הועבר תשלום', cancelled: 'בוטל', ordered: 'הוזמן',
  opened: 'נפתח', item: 'פריט נרשם', removed: 'פריט הוסר', waived: 'נמחל',
  approved: 'אושר', rejected: 'נדחה', requested: 'הוגש', role: 'תפקיד שונה', blocked: 'נחסם', unblocked: 'שוחרר', invited: 'הוזמן', joined: 'הצטרף',
  receipt: 'קבלה נשלחה', published: 'פורסם', unpublished: 'הוסר מפרסום', saved: 'נשמר',
};
