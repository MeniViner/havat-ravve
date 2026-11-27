// Images and event files go to R2 through the farm's Worker (api/src/files.ts): a short https link is stored
// in the document instead of the picture itself. Whenever that is not possible (demo mode, the emulators without
// a local Worker, offline, the Worker not deployed yet, any refusal) the caller keeps the data URL, exactly as
// before, so saving never fails because of storage. The same link prefix is allowed in firestore.rules.
import { getDemo } from './demo/store';
import { emulatorMode, readyAuth } from './firebase';

export const FILES_API = 'https://havat-ravve-api.meniviner.workers.dev';
export type FileKind = 'avatar' | 'task' | 'shopping' | 'place' | 'event' | 'eventfile' | 'stall';
const LOCAL_KEY = 'farm-files-api';

// Local testing only: /app?emulator&filesApi=http://127.0.0.1:8787 sends files to a Worker under `wrangler dev`.
try {
  const q = new URLSearchParams(location.search).get('filesApi');
  if (q && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(q)) sessionStorage.setItem(LOCAL_KEY, q);
} catch { /* storage blocked */ }

export function apiBase(): string | null {
  if (getDemo().on) return null;
  if (emulatorMode) { try { return sessionStorage.getItem(LOCAL_KEY); } catch { return null; } }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  return FILES_API;
}

/** A file this app stored (R2 through the Worker), as opposed to an inline data URL or an outside link. */
export const isStoredFile = (url: string) => /^https?:\/\/[^/]+\/v1\/files\/[a-z]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]{32}\.(jpg|webp|png|pdf)$/.test(url);

/** Uploads the bytes and returns their link, or null when the file could not be stored (the caller decides what then). */
export async function storeFile(blob: Blob, kind: FileKind): Promise<string | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const user = (await readyAuth()).currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    const res = await fetch(`${base}/v1/files?kind=${kind}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': blob.type }, body: blob,
      signal: AbortSignal.timeout(blob.size > 1_000_000 ? 60_000 : 20_000),
    });
    if (!res.ok) { console.warn('file upload refused', res.status); return null; }
    const j = await res.json() as { data?: { url?: string } };
    return j.data?.url && isStoredFile(j.data.url) ? j.data.url : null;
  } catch (e) {
    console.warn('file upload failed', (e as Error)?.name || e);
    return null;
  }
}

export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  return new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], { type });
}

/** A compressed photo (data URL) → its stored link, or the same data URL when storing was not possible. */
export async function storePhoto(dataUrl: string, kind: FileKind): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  return (await storeFile(dataUrlToBlob(dataUrl), kind)) || dataUrl;
}
