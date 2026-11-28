import { deleteApp, initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, connectAuthEmulator, GoogleAuthProvider, inMemoryPersistence, initializeAuth, signInWithPopup } from 'firebase/auth';
import { config, emulatorMode, readyAuth } from '../../firebase';
import { demoItems, demoOnly } from '../../demo/store';
import { useDoc, useList, write } from '../../db';
import { nowIso } from '../../clock';
import { apiBase } from '../../upload';
import type { ContactGuest, Profile } from '../../types';

export type ReplyAccount = { email: string; token: string };
export async function chooseReplyAccount(): Promise<ReplyAccount> {
  if (demoOnly()) return { email: 'guest@example.invalid', token: '' };
  const signed = (await readyAuth()).currentUser;
  if (signed?.email) return { email: signed.email, token: await signed.getIdToken() };
  // An optional address picker must not switch the application's real account or open registration.
  const secondary = initializeApp(config.firebase, 'contact-' + crypto.randomUUID());
  try {
    const auth = initializeAuth(secondary, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    if (emulatorMode) connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const { user } = await signInWithPopup(auth, provider);
    if (!user.email) throw new Error('לא התקבלה כתובת מייל. אפשר להקליד אותה.');
    return { email: user.email, token: await user.getIdToken() };
  } finally { await deleteApp(secondary); }
}

export async function sendFarmContact(id: string, subject: string, message: string, method: ContactGuest['method'], reply: string, token: string) {
  if (demoOnly()) {
    const key = 'demo-contact-' + id;
    const createdAt = nowIso();
    const existing = [...demoItems('users'), ...demoItems('contact_people')];
    const customerNumber = 1 + existing.reduce((max, row) => Math.max(max, Number(row.customerNumber) || 0), 0);
    await write.batch([
      { op: 'set', col: 'contact_people', id: key, data: { accountUid: '', customerNumber, createdAt, method, reply } },
      { op: 'set', col: 'notifications', id: key, data: { type: 'contact', title: subject, text: message, contactId: key, refId: key, link: '/manage/inbox/' + key, createdAt, handled: false, handledAt: null, handledBy: null } },
    ]);
    return;
  }
  const base = apiBase();
  if (!base) throw new Error('כדי לשלוח פנייה צריך חיבור לשרת החווה.');
  const response = await fetch(base + '/v1/contact', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ id, subject, message, method, reply }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'התקבלו פניות רבות. אפשר לנסות שוב בעוד דקה.' : 'הפנייה לא אושרה. אפשר לנסות שוב.');
}

export const useContactGuest = (id: string) => useDoc<ContactGuest>('contact_people/' + (id || '_'), !!id);
export const useContactGuests = () => useList<ContactGuest>('contact_people', { where: [['accountUid', '==', '']] });
/** Display projection for the manager directory. A correspondence record cannot sign in or acquire roles. */
export function directoryGuest(c: ContactGuest): Profile {
  return { uid: c.id, customerNumber: c.customerNumber ?? 0, displayName: 'אורח מפנייה', phone: c.method === 'phone' ? c.reply : '',
    email: c.method === 'email' ? c.reply : '', role: 'guest', status: 'active', acceptedTermsAt: '', createdAt: c.createdAt, updatedAt: c.createdAt };
}
