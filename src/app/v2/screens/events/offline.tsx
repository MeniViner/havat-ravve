import { useCallback, useState } from 'react';
import type { V2Ctx } from '../../ctx';
import { Sheet, DataTable, Button } from '../../kit';
import { dayTime } from '../../format';
import { useEventOffline } from '../../data/eventOffline';

export function OfflineStatus({ eventId, ctx }: {eventId:string; ctx:V2Ctx}) {
  const [refresh, setRefresh] = useState(0);
  const status = useEventOffline(eventId, ctx.user.uid, ctx.manager, refresh);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button type="button" className={'events-cache events-cache--' + status.tone} onClick={() => { setOpen(true); if (status.tone !== 'good') setRefresh(n => n + 1); }} aria-haspopup="dialog">
      <span aria-hidden="true" />{status.title}
    </button>
    <Sheet open={open} onClose={close} title="מה נשמר במכשיר">
      <div className="events-sheet"><b>{status.title}</b>
        {status.at && <p>העדכון האחרון התקבל ב־{dayTime(status.at)}</p>}
        {!!status.counts.length && <DataTable headers={['רשימה','פריטים במכשיר','מצב']} rows={status.counts.map((c) => [c.label,c.denied ? '—' : c.count,c.denied ? 'אין גישה' : c.valid ? 'נשמר' : 'חלקי'])} />}
        {!!status.names.length && <DataTable headers={['בעלי כרטיסים השמורים במכשיר']} rows={status.names.map((s) => [s])} />}
        <Button variant="outline" onClick={() => setRefresh(n => n + 1)}>עדכון העותק במכשיר</Button>
        <p className="k-note">כשיש חיבור הרשימות מתעדכנות. כרטיס שנוסף אחר כך יגיע למכשיר בחיבור הבא.</p>
      </div>
    </Sheet>
  </>;
}
