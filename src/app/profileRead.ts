// A cache miss (including a stale multi-tab listener) is not proof of a new account.
// The lightweight client checks the signed-in user's own document over HTTPS,
// independently of the streaming listener and the device's persistent cache.
import { doc, getDoc, getFirestore, connectFirestoreEmulator } from 'firebase/firestore/lite';
import { db } from './firebase';
import { useEmulator } from './firebaseTarget';

let client: ReturnType<typeof getFirestore> | undefined;
export async function readProfileFromServer(path: string) {
  if (!client) {
    client = getFirestore(db.app);
    if (useEmulator) connectFirestoreEmulator(client, 'localhost', 8080);
  }
  const snapshot = await getDoc(doc(client, path));
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
}
