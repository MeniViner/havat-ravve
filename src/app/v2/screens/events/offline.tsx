import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { V2Ctx } from '../../ctx';
import { useSync } from '../../../db';
import { Button, DataTable, Icon, type IconName } from '../../kit';
import { dayTime } from '../../format';
import { useEventOffline } from '../../data/eventOffline';
import './offline.css';

const statusIcons: Record<ReturnType<typeof useEventOffline>['status'], IconName> = {
  checking: 'clock', ready: 'check', offline: 'offline', partial: 'download', denied: 'blocked', error: 'help',
};

type EventCopy = { status:ReturnType<typeof useEventOffline>; refresh:() => void };
const EventCopyContext = createContext<(EventCopy & {eventId:string}) | null>(null);

/** Moving between sections in one event reuses its verification and its refresh timer. */
export function EventOfflineProvider({eventId,ctx,children}:{eventId:string;ctx:V2Ctx;children:ReactNode}) {
  const [revision, setRevision] = useState(0);
  const status = useEventOffline(eventId, ctx.user.uid, ctx.manager, revision);
  return <EventCopyContext.Provider value={{eventId,status,refresh:() => setRevision(n => n + 1)}}>{children}</EventCopyContext.Provider>;
}

export function OfflineStatus() {
  const copy = useContext(EventCopyContext);
  return copy?.eventId ? <OfflineDetails key={copy.eventId} status={copy.status} refresh={copy.refresh} /> : null;
}

function OfflineDetails({status,refresh}:EventCopy) {
  const { pending } = useSync();
  const [open, setOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const waiting = pending > 0 && status.status === 'ready';
  const title = waiting ? 'שינויים במכשיר ממתינים לאישור השרת' : status.title;

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (event.target instanceof Node && !wrap.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="event-sync" ref={wrap}>
    <button ref={trigger} type="button" className="event-sync__trigger" data-state={waiting ? 'checking' : status.status}
      aria-label={'סנכרון האירוע · ' + title} title={title} aria-haspopup="dialog" aria-controls={open ? id : undefined}
      aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="event-sync__glyph"><Icon name={waiting ? 'clock' : statusIcons[status.status]} size={17} /></span>
    </button>
    {open && <div ref={panel} id={id} tabIndex={-1} role="dialog" aria-labelledby={id + '-title'} className="event-sync__panel">
      <div className="event-sync__heading">
        <h2 id={id + '-title'}>סנכרון האירוע</h2>
        <button className="event-sync__close" type="button" aria-label="סגירה" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" size={16} /></button>
      </div>
      <p role="status">{status.title}</p>
      {pending > 0 && <p className="k-note">{pending === 1 ? 'שינוי אחד במכשיר מחכה לאישור השרת.' : `${pending} שינויים במכשיר מחכים לאישור השרת.`}</p>}
      {status.at && <p className="k-note">עדכון אחרון · {dayTime(status.at)}</p>}
      {status.counts.length > 0 && <details open={listsOpen} onToggle={e => setListsOpen(e.currentTarget.open)}><summary>הרשימות במכשיר</summary>
        <DataTable headers={['רשימה','פריטים','מצב']} rows={status.counts.map(c => [c.label,c.denied ? '—' : c.count,c.denied ? 'אין גישה' : c.valid ? 'נשמר' : 'חלקי'])} />
        {status.names.length > 0 && <details open={namesOpen} onToggle={e => setNamesOpen(e.currentTarget.open)}><summary>בעלי הכרטיסים השמורים</summary><ul>{status.names.map((name,index) => <li key={index}>{name}</li>)}</ul></details>}
      </details>}
      <Button variant="outline" disabled={!status.online || status.status === 'checking'} onClick={refresh}>
        {status.status === 'checking' ? 'בודקים את הרשימות…' : 'רענון הרשימות'}
      </Button>
      {!status.online && <p className="k-note">הרשימות יתעדכנו כשהחיבור יחזור.</p>}
    </div>}
  </div>;
}
