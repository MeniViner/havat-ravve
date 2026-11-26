// Only the exact Play build can install a signed WebView update for its channel.
export const androidOtaRelease = (build: string) =>
  `https://github.com/MeniViner/havat-ravve/releases/download/android-ota-${build}`;
export const androidOtaAsset = (revision: number) => `web-${revision}.zip`;

const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function verifyAndroidOtaManifest(value: unknown, publicKey: string, build: string) {
  if (typeof value === 'string' && value.length > 4096) return null;
  try {
    const envelope: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (typeof envelope !== 'object' || envelope === null) return null;
    const { payload, signature } = envelope as Record<string, unknown>;
    if (typeof payload !== 'string' || payload.length > 1024
      || typeof signature !== 'string' || signature.length > 1024) return null;
    const algorithm = 'RSASSA-PKCS1-v1_5';
    const key = await crypto.subtle.importKey('spki', decode(publicKey), { name: algorithm, hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify(algorithm, key, decode(signature), new TextEncoder().encode(payload))) return null;
    const { app, nativeBuild, revision, sha256 } = JSON.parse(payload);
    if (app !== 'com.menis10tec.havatravve' || nativeBuild !== build
      || !Number.isSafeInteger(revision) || revision < 1
      || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    return { revision: revision as number, sha256 };
  } catch {
    return null;
  }
}
