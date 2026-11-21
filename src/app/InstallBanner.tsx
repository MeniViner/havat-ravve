import { useEffect, useState, useSyncExternalStore } from 'react';
import { depth } from './router';
import { Btn, Icon } from './ui';
import './install-banner.css';
import { nowMs } from './clock';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const seenKey = 'farm-app-install-seen';
const dismissedKey = 'farm-app-install-dismissed-until';
const installedKey = 'farm-app-installed';
const twoWeeks = 14 * 24 * 60 * 60 * 1000;

function readFlag(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeFlag(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Installation still works for this visit. */ }
}

const seenOnArrival = readFlag(seenKey) === 'yes';
const standalone = window.matchMedia?.('(display-mode: standalone)');
const isInstalled = () => !!(standalone?.matches || (navigator as Navigator & { standalone?: boolean }).standalone || readFlag(installedKey) === 'yes');
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let installState = { prompt: null as InstallPrompt | null, installed: isInstalled() };
const listeners = new Set<() => void>();
function updateInstallState(patch: Partial<typeof installState>) {
  installState = { ...installState, ...patch };
  listeners.forEach((listener) => listener());
}

// Capture the prompt while auth or the first screen is still loading.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (!installState.installed) updateInstallState({ prompt: event as InstallPrompt });
});
window.addEventListener('appinstalled', () => {
  writeFlag(installedKey, 'yes');
  updateInstallState({ prompt: null, installed: true });
});
standalone?.addEventListener?.('change', () => updateInstallState({ installed: isInstalled() }));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const snapshot = () => installState;

export function InstallBanner() {
  const { prompt, installed } = useSyncExternalStore(subscribe, snapshot);
  const [dismissedUntil, setDismissedUntil] = useState(() => Number(readFlag(dismissedKey)) || 0);

  useEffect(() => writeFlag(seenKey, 'yes'), []);
  useEffect(() => {
    const remaining = dismissedUntil - nowMs();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setDismissedUntil(0), Math.min(twoWeeks, remaining));
    return () => window.clearTimeout(timer);
  }, [dismissedUntil]);

  if (installed || (!seenOnArrival && depth() === 0) || dismissedUntil > nowMs() || (!prompt && !isIos)) return null;

  const dismiss = () => {
    const until = nowMs() + twoWeeks;
    writeFlag(dismissedKey, String(until));
    setDismissedUntil(until);
  };
  const install = async () => {
    if (!prompt || installState.prompt !== prompt) return;
    updateInstallState({ prompt: null });
    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'dismissed') dismiss();
    } catch { /* The browser will make another prompt available if installation becomes eligible again. */ }
  };

  return (
    <aside className="install-banner" aria-label="התקנה למסך הבית">
      <div className="install-banner-copy">
        <strong>חוות רווה במסך הבית</strong>
        {!prompt && <p>ב־Safari לחצו על <b>שיתוף</b>, ואז על <b>הוספה למסך הבית</b>.</p>}
      </div>
      {prompt && <Btn size="sm" onClick={install}>הוספה למסך הבית</Btn>}
      <button type="button" className="install-banner-dismiss" aria-label="סגירת הזמנת התקנה" onClick={dismiss}>
        <Icon name="x" size={20} />
      </button>
    </aside>
  );
}
