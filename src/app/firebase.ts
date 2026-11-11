import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence, signInWithPopup, signInWithRedirect, signOut, connectAuthEmulator, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import config from '../../site.config.json';

const useEmulator = location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator');
export const app = getApps()[0] || initializeApp(config.firebase);
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const auth = getAuth(app);
export const ownerEmail = config.ownerEmail;

// Local development against the Firebase emulators: http://localhost:5000/app?emulator
if (useEmulator) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
export { config };

export const authReady = setPersistence(auth, browserLocalPersistence).catch(() => {});


export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (useEmulator) await signInWithRedirect(auth, provider);
  else await signInWithPopup(auth, provider);
}

export async function signOutUser() {
  await signOut(auth);
}

export function isGoogleUser(user: User | null) {
  return !!user && !!user.email && user.providerData.some((p) => p.providerId === 'google.com');
}

export const nowIso = () => new Date().toISOString();
export const todayKey = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(new Date());
export const dateKeyOf = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(d);
export const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const authErrorMessage = (e: any) =>
  ({
    'auth/unauthorized-domain': 'דומיין האתר עדיין אינו מאושר ב־Firebase.',
    'auth/popup-blocked': 'אפשרו חלוניות קופצות לאתר ונסו שוב.',
    'auth/popup-closed-by-user': 'חלונית Google נסגרה. אפשר לנסות שוב.',
    'permission-denied': 'אין לך הרשאה לפעולה הזו.',
    'auth/network-request-failed': 'אין חיבור כרגע. נסו שוב כשיש קליטה.',
  })[e?.code as string] || e?.message || 'הפעולה לא הושלמה';
