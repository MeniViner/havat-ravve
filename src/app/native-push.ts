import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeAndroid, openSitePage } from './native';
import { navigate } from './router';

const CHANNEL = 'farm_updates';
const Settings = registerPlugin<{
  allowed(): Promise<{ allowed: boolean }>;
  open(): Promise<void>;
}>('AndroidNotificationSettings');
export const openAndroidNotificationSettings = () => Settings.open();

export async function androidPushPermission(): Promise<NotificationPermission> {
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === 'denied') return 'denied';
  if (receive !== 'granted') return 'default';
  return (await Settings.allowed()).allowed ? 'granted' : 'denied';
}

let registering: Promise<string> | undefined;
function token() {
  return registering ??= (async () => {
    const handles: PluginListenerHandle[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let complete!: (value: string) => void;
    let fail!: (error: Error) => void;
    const response = new Promise<string>((resolve, reject) => { complete = resolve; fail = reject; });
    const unavailable = () => fail(new Error('לא הצלחנו לרשום את המכשיר. אפשר לנסות שוב.'));
    try {
      handles.push(await PushNotifications.addListener('registration', ({ value }) => complete(value)));
      handles.push(await PushNotifications.addListener('registrationError', unavailable));
      timer = setTimeout(unavailable, 8000);
      return await Promise.all([response, PushNotifications.register()]).then(([value]) => value);
    } finally {
      clearTimeout(timer);
      await Promise.allSettled(handles.map((handle) => handle.remove()));
    }
  })().finally(() => { registering = undefined; });
}

export async function registerAndroidPush(prompt: boolean) {
  const permission = prompt ? (await PushNotifications.requestPermissions()).receive : await androidPushPermission();
  if (permission !== 'granted') return { permission: permission === 'denied' ? 'denied' as const : 'default' as const };
  // Channel options are also used when the system displays the message while the app is closed.
  await PushNotifications.createChannel({
    id: CHANNEL, name: 'הודעות מחוות רווה', importance: 4, visibility: 0, vibration: true,
  }).catch(() => {}); // Android versions older than 8 have no channels.
  if (!(await Settings.allowed()).allowed) return { permission: 'denied' as const };
  return { permission: 'granted' as const, token: await token() };
}

export async function unregisterAndroidPush() {
  if (registering) await registering.catch(() => {});
  await PushNotifications.unregister();
  await PushNotifications.removeAllDeliveredNotifications();
}

export async function installAndroidPushLinks() {
  if (!isNativeAndroid) return;
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const path = notification?.data?.link;
    if (typeof path !== 'string' || !/^\/(?!\/)[\w\-./?=&%#]*$/.test(path)) return;
    if (path === '/admin' || path.startsWith('/admin#') || path.startsWith('/admin?')) openSitePage(path);
    else navigate(path === '/app' ? '/' : path.startsWith('/app/') ? path.slice(4) : path);
  });
}
