import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { androidOtaAsset, androidOtaRelease, verifyAndroidOtaManifest } from '../src/app/android-ota-manifest.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const trustedKey = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const sha256 = 'a'.repeat(64);
const signed = (updates = {}) => {
  const payload = JSON.stringify({ app: 'com.menis10tec.havatravve', nativeBuild: '7', revision: 2, sha256, ...updates });
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') });
};
assert.deepEqual(await verifyAndroidOtaManifest(signed(), trustedKey, '7'), { revision: 2, sha256 });
assert.deepEqual(await verifyAndroidOtaManifest(JSON.parse(signed()), trustedKey, '7'), { revision: 2, sha256 });
assert.equal(await verifyAndroidOtaManifest(signed(), trustedKey, '8'), null);
assert.equal(await verifyAndroidOtaManifest(signed().replace(sha256, 'b'.repeat(64)), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest(signed({ app: 'com.other.app' }), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest(signed({ revision: 0 }), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest(signed({ revision: '2' }), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest(signed({ sha256: 'invalid' }), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest(JSON.stringify({ payload: '{}', signature: 'invalid' }), trustedKey, '7'), null);
assert.equal(await verifyAndroidOtaManifest('a'.repeat(4097), trustedKey, '7'), null);
assert.equal(androidOtaRelease('7'), 'https://github.com/MeniViner/havat-ravve/releases/download/android-ota-7');
assert.equal(androidOtaAsset(2), 'web-2.zip');
console.log('PASS: OTA signatures, exact Play build, metadata validation and asset path.');
