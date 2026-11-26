import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { androidOtaAsset } from '../src/app/android-ota-manifest.ts';
import { androidOtaPublicKey } from '../src/app/android-ota-key.ts';

const [nativeBuild, revisionArg, keyPath] = process.argv.slice(2);
const revision = Number(revisionArg);
if (!/^[1-9][0-9]*$/.test(nativeBuild ?? '') || !/^[1-9][0-9]*$/.test(revisionArg ?? '')
  || !Number.isSafeInteger(revision) || !keyPath) {
  throw Error('Usage: npm run build:android:ota -- <Play versionCode> <revision> <private-key-path>');
}
const gradle = await readFile('android/app/build.gradle', 'utf8');
if (gradle.match(/\bversionCode\s+(\d+)/)?.[1] !== nativeBuild) {
  throw Error('Build from the Android release branch for the selected Play versionCode.');
}
const key = await readFile(keyPath);
const publicKey = createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64');
if (publicKey !== androidOtaPublicKey) throw Error('Signing key does not match the Android app.');

const output = resolve(`.build/android-ota/${nativeBuild}/${revision}`);
await mkdir(resolve(output, '..'), { recursive: true });
await mkdir(output);
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build-native.mjs'], { stdio: 'inherit' });
const zip = resolve(output, androidOtaAsset(revision));
execFileSync('zip', ['-qr', zip, '.'], { cwd: '.build/native' });
const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
const payload = JSON.stringify({ app: 'com.menis10tec.havatravve', nativeBuild, revision, sha256 });
const signature = sign('sha256', Buffer.from(payload), key).toString('base64');
await writeFile(resolve(output, 'current.json'), JSON.stringify({ payload, signature }) + '\n', { flag: 'wx' });
console.log(output);
