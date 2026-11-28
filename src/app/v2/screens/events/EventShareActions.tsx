import { useCallback, useRef, useState } from 'react';
import { eventSharePath, eventShareTitle } from '../../../../../shared/event-share';
import { useDemo } from '../../../demo/store';
import { publicOrigin } from '../../../native';
import { emulatorMode } from '../../../firebase';
import type { FarmEvent } from '../../../types';
import { apiBase, FILES_API } from '../../../upload';
import { Button, IconButton, Sheet } from '../../kit';

type ShareEvent = FarmEvent & { shareWords?: string };

/** The guest icon and staff button share the same link, title and copy fallback. */
export function EventShareActions({ event, compact = false }: { event: ShareEvent; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const demo = useDemo().on;
  const close = useCallback(() => setOpen(false), []);
  const service = demo ? null : emulatorMode ? apiBase() : FILES_API;
  const localUrl = new URL('/app/events/' + encodeURIComponent(event.id), publicOrigin());
  if (emulatorMode) localUrl.searchParams.set('emulator', '');
  const url = service ? service + eventSharePath(event.id) : localUrl.href;
  const title = eventShareTitle(event);
  const start = () => { setFeedback(''); setOpen(true); };

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback('הקישור הועתק.');
      return;
    } catch { /* Selectable text also works when the browser has no clipboard permission. */ }
    const input = field.current;
    if (!input) return;
    input.focus();
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* manual copy is still possible */ }
    setFeedback(copied ? 'הקישור הועתק.' : 'הקישור מסומן. אפשר להעתיק אותו כעת.');
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    await copy();
  }

  return <>
    {compact
      ? <IconButton icon="share" label="שיתוף אירוע" variant="bordered" onClick={start} />
      : <Button variant="outline" size="tall" onClick={start}>שיתוף אירוע</Button>}
    <Sheet open={open} onClose={close} title="שיתוף אירוע">
      <strong>{title}</strong>
      {event.image && <img src={event.image} alt="" style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8 }} />}
      {event.published ? <>
        {demo && <p className="k-note">זהו אירוע לדוגמה. הקישור מקומי להדגמה.</p>}
        <label className="k-note">הקישור לאירוע
          <input ref={field} type="url" dir="ltr" readOnly value={url} style={{ display:'block', width:'100%', padding:8, font:'inherit' }} />
        </label>
        <Button size="tall" icon="share" onClick={() => void share()}>שיתוף אירוע</Button>
        <Button size="tall" variant="outline" onClick={() => void copy()}>העתקת קישור</Button>
        <span role="status" className="k-note">{feedback}</span>
      </> : <p className="k-note">הקישור יהיה זמין אחרי פרסום האירוע.</p>}
    </Sheet>
  </>;
}
