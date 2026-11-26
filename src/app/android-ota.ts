import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { CapacitorUpdaterPlugin } from '@capgo/capacitor-updater';
import { isNativeAndroid } from './native';
import { androidOtaPublicKey } from './android-ota-key';
import { androidOtaAsset, androidOtaRelease, verifyAndroidOtaManifest } from './android-ota-manifest';

const updater = registerPlugin<CapacitorUpdaterPlugin>('CapacitorUpdater');
const VERSION_PREFIX = 'web-';
let started = false;

export function startAndroidOta() {
  if (!isNativeAndroid || started) return;
  started = true;
  // Readiness is independent of network availability and is called only after React commits.
  void updater.notifyAppReady().then(() => checkForUpdate()).catch(() => {});
}

async function checkForUpdate() {
  const { build } = await App.getInfo();
  if (!/^[1-9][0-9]*$/.test(build)) return;
  // Retry on a later foreground after an offline start without checking on every app switch.
  let lastCheck = 0;
  let checking = false;
  const check = async () => {
    if (checking || Date.now() - lastCheck < 5 * 60_000) return;
    lastCheck = Date.now();
    checking = true;
    try {
      const base = androidOtaRelease(build);
      const response = await CapacitorHttp.get({
        url: base + '/current.json', responseType: 'text', connectTimeout: 5000, readTimeout: 5000,
      });
      if (response.status !== 200) return;
      const update = await verifyAndroidOtaManifest(response.data, androidOtaPublicKey, build);
      if (!update) return;
      const version = VERSION_PREFIX + update.revision;
      const { bundle } = await updater.current();
      const previous = Number(localStorage.getItem(`android-ota-${build}`)) || 0;
      const current = bundle.version.startsWith(VERSION_PREFIX) ? Number(bundle.version.slice(VERSION_PREFIX.length)) : 0;
      if (update.revision <= Math.max(previous, current)) return;
      const downloaded = await updater.download({
        url: `${base}/${androidOtaAsset(update.revision)}`, version, checksum: update.sha256,
      });
      // Do not retry a faulty release after the native updater rolls back; publish a new revision.
      await updater.next({ id: downloaded.id });
      localStorage.setItem(`android-ota-${build}`, String(update.revision));
    } catch {
      // Stay on the last working bundle when no verified update can be scheduled.
    } finally {
      checking = false;
    }
  };
  await App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
  await check();
}
