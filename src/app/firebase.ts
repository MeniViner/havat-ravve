import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider, OAuthProvider, browserLocalPersistence, setPersistence, signInWithPopup, signInWithRedirect, signInWithCredential, signOut, connectAuthEmulator, type Auth, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import config from '../../site.config.json';
import { nowIso, todayKey, dateKeyOf, hoursAgoIso } from './clock';
import { isNative, isNativeIos, NativeAuth } from './native';

import { useEmulator } from './firebaseTarget';
export const emulatorMode = useEmulator;
export const app = getApps()[0] || initializeApp(config.firebase);
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const ownerEmail = config.ownerEmail;

// Local development against the Firebase emulators: http://localhost:5000/app?emulator
if (useEmulator) {
  connectFirestoreEmulator(db, 'localhost', 8080);
}
export { config };

let appAuth: Auth | undefined;
function getAppAuth() {
  if (!appAuth) {
    // Inside the installed app there is no popup or redirect (Google refuses embedded web views): the native sheets sign in
    // and hand the credential over. initializeAuth without the popup/redirect helper, which would load Google's iframe.
    appAuth = isNative ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
    if (useEmulator) connectAuthEmulator(appAuth, 'http://localhost:9099', { disableWarnings: true });
  }
  return appAuth;
}

export async function readyAuth() {
  const auth = getAppAuth();
  if (!isNative) await setPersistence(auth, browserLocalPersistence).catch(() => {});
  return auth;
}

/** Browsers inside other apps (a link opened from WhatsApp, Instagram, Facebook). Google refuses to sign in there, so the screen says so instead of offering a button that cannot work. */
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|; wv\)/i.test(navigator.userAgent);

const POPUP_UNAVAILABLE = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request', 'auth/web-storage-unsupported'];
export async function chooseNativeGoogleAccount(auth: Auth) {
  const credential = await nativeSheet(() => NativeAuth.signInWithGoogle({ skipNativeAuth: true }));
  if (!credential) return null;
  const result = await signInWithCredential(auth, GoogleAuthProvider.credential(credential.idToken, credential.accessToken));
  return result.user;
}
/** Popup first (the page and a half-filled form stay as they are). Where a popup cannot open, an installed app on iPhone for one, the whole page goes to Google and comes back. */
export async function signIn() {
  const auth = getAppAuth();
  if (isNative) {
    await chooseNativeGoogleAccount(auth);
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (useEmulator) { await signInWithRedirect(auth, provider); return; }
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (!POPUP_UNAVAILABLE.includes((e as { code?: string })?.code || '')) throw e;
    await signInWithRedirect(auth, provider);
  }
}

/** Sign in with Apple, offered inside the iPhone app next to Google (App Store guideline 4.8). Not on the website. */
export const appleSignInAvailable = isNativeIos;
export async function signInApple() {
  const auth = getAppAuth();
  const credential = await nativeSheet(() => NativeAuth.signInWithApple({ skipNativeAuth: true }));
  if (credential) await signInWithCredential(auth, new OAuthProvider('apple.com').credential({ idToken: credential.idToken, rawNonce: credential.nonce }));
}
/** A native sign-in sheet. Closing it is not an error (null, the screen stays as it was); other failures get a Hebrew line. */
async function nativeSheet(open: () => Promise<{ credential: { idToken?: string; accessToken?: string; nonce?: string } | null }>) {
  try {
    const { credential } = await open();
    return credential?.idToken ? { idToken: credential.idToken, accessToken: credential.accessToken, nonce: credential.nonce } : null;
  } catch (e) {
    if (/cancel|error 1001\b/i.test(String((e as { message?: string })?.message || e))) return null;
    throw { code: 'auth/native-failed' };
  }
}

export async function signOutUser() {
  if (getAppAuth().currentUser) {
    const { disconnectSurvey } = await import('./survey/native');
    await disconnectSurvey(getAppAuth().currentUser!.uid);
  }
  await signOut(getAppAuth());
  // the native Google session too, so the next sign-in offers the account picker again
  if (isNative) await NativeAuth.signOut().catch(() => {});
}

/** Accounts the app accepts: Google everywhere, and Apple inside the iPhone app. Both come with an email Google or Apple verified. */
export const ACCOUNT_PROVIDERS = ['google.com', 'apple.com'];
export function isAccountUser(user: User | null) {
  return !!user && !!user.email && user.providerData.some((p) => ACCOUNT_PROVIDERS.includes(p.providerId));
}

export { nowIso, todayKey, dateKeyOf, hoursAgoIso };

export const authErrorMessage = (e: any) =>
  ({
    'auth/unauthorized-domain': 'דומיין האתר עדיין אינו מאושר ב־Firebase.',
    'auth/popup-blocked': 'אפשרו חלוניות קופצות לאתר ונסו שוב.',
    'auth/popup-closed-by-user': 'חלונית Google נסגרה. אפשר לנסות שוב.',
    'auth/native-failed': 'הכניסה לא הושלמה. בדקו שיש קליטה ונסו שוב.',
    'auth/account-exists-with-different-credential': 'כבר יש חשבון עם המייל הזה. נכנסים עם Google.',
    'permission-denied': 'אין לך הרשאה לפעולה הזו.',
    'auth/network-request-failed': 'אין חיבור כרגע. נסו שוב כשיש קליטה.',
  })[e?.code as string] || e?.message || 'הפעולה לא הושלמה';

/** Who is using the app right now: a real Google account, or a demo persona. */
export type Session = { uid: string; email: string; displayName: string; bootstrapOwner?: boolean };
