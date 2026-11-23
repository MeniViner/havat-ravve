// The iPhone app (Capacitor, docs/app-store.md). The same bundle runs on the website and inside the app;
// everything native is behind `isNative`, so the website behaves exactly as before.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { FirebaseAuthenticationPlugin } from '@capacitor-firebase/authentication';
import config from '../../site.config.json';

/** Inside the App Store app (iOS), not a browser. */
export const isNative = Capacitor.isNativePlatform();
export const isNativeIos = isNative && Capacitor.getPlatform() === 'ios';

/** The address people can open: the app's own page origin is capacitor://localhost, which means nothing outside the phone. */
export const publicOrigin = () => (isNative || typeof location === 'undefined' ? config.origin : location.origin);

export function openSitePage(path: string) {
  window.open(publicOrigin() + path, '_blank', 'noopener');
}

/**
 * The native sign-in sheets (Google, Apple). Registered by name only, so the website bundle does not carry the
 * plugin's web code; the native side answers only inside the app. `skipNativeAuth` (capacitor.config.json) keeps
 * the session in the Firebase JavaScript SDK, which the whole app already uses.
 */
export const NativeAuth = registerPlugin<FirebaseAuthenticationPlugin>('FirebaseAuthentication');

/**
 * Links to the farm's website ("/", "/archive", files under /assets) point at the site, not at the app's own pages,
 * which inside the app would open the app again. Inside the app they open in Safari. Links to other sites already leave the app
 * (Capacitor sends any other host to the system browser).
 */
export function installNativeLinks() {
  if (!isNative) return;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const url = new URL(a.getAttribute('href') || '', location.href);
    // protocol + host, not .origin: a custom scheme (capacitor://) has an opaque origin in the URL parser; blob: and tel: links stay as they are
    if (url.protocol !== location.protocol || url.host !== location.host) return;
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) return;
    e.preventDefault();
    openSitePage(url.pathname + url.search + url.hash);
  }, true);
}
