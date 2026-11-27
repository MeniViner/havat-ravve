import { useState } from 'react';
import { useRoute, useParam, navigate } from '../router';
import type { Profile } from '../types';
import { Button, Sheet } from './kit';
import { enablePush, entryPushOptedOut, usePush } from './data/push';

/** The device permission can only be requested by the person's tap. Deferral lasts for this browser session. */
export function PushEntryPrompt({ profile }: { profile: Profile }) {
  const push = usePush(profile);
  const route = useRoute();
  const setup = useParam('notifications') === '1';
  const key = 'farm-push-entry:' + profile.uid;
  const [closed, setClosed] = useState(() => { try { return !!sessionStorage.getItem(key); } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const later = () => { setClosed(true); try { sessionStorage.setItem(key, '1'); } catch { /* current mount still closes */ } };
  const action = async () => {
    if (push.state === 'needs-install') { later(); navigate('/install?notifications=1'); return; }
    if (busy || push.state !== 'ask') return;
    setBusy(true);
    try {
      const state = await enablePush(profile, push.config);
      push.refresh();
      if (state === 'on' || state === 'denied') later();
      else setError('ההתראות עדיין כבויות. אפשר לנסות שוב או להמשיך.');
    } catch { setError('ההפעלה לא הושלמה. אפשר לנסות שוב.'); }
    finally { setBusy(false); }
  };
  const open = push.config.mode !== 'off' && !closed && !setup && !entryPushOptedOut(profile.uid) && !['/install', '/notifications'].includes(route) && (push.state === 'ask' || push.state === 'needs-install');
  return <Sheet title="התראות במכשיר הזה" open={open} onClose={later}>
    <div className="manage-sheet"><p className="k-note">{push.state === 'needs-install' ? 'כדי לקבל התראות באייפון, מוסיפים את האפליקציה למסך הבית.' : 'כדי לקבל הודעות מהחווה גם כשהאפליקציה סגורה, אפשר להפעיל התראות במכשיר.'}</p>
      <Button disabled={busy} onClick={action}>{push.state === 'needs-install' ? 'הוראות התקנה' : 'הפעלה במכשיר'}</Button>
      <Button variant="quiet" onClick={later}>אחר כך</Button>
      {error && <span className="k-field__error" role="alert">{error}</span>}
    </div>
  </Sheet>;
}
