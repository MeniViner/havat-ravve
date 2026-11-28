import { useState } from 'react';
import { newId } from '../../../db';
import { useCalendar } from '../../../data';
import type { Visit } from '../../../types';
import { Button, Field, Sheet, TextAreaField } from '../../kit';
import { CheckboxSelect } from '../../kit/CheckboxSelect';
import { useExternal } from '../../core';
import type { V2Ctx } from '../../ctx';
import { deliverOperationalMessage, visitRecipient, type MessageChannel } from '../../data/operationalMessages';

type Props = { ctx: V2Ctx; visit: Visit; managerNote?: string; choice: 'approved' | 'rejected'; close: () => void };

export function VisitDecision({ ctx, visit, managerNote, choice, close }: Props) {
  const approved = choice === 'approved';
  const [date, setDate] = useState((visit.status === 'approved' && visit.approvedDate) || visit.date);
  const [time, setTime] = useState((visit.status === 'approved' && visit.approvedTime) || '');
  const [text, setText] = useState<string | null>(null);
  const [channels, setChannels] = useState<MessageChannel[]>([]);
  const [id] = useState(() => newId('operational_notices'));
  const [expectedUpdatedAt] = useState(visit.updatedAt);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof deliverOperationalMessage>> | null>(null);
  const calendar = useCalendar(approved && !!date, date || visit.date, date || visit.date);
  const sameDay = calendar.items.filter(item => item.refId !== visit.id);
  const external = useExternal();
  const target = visitRecipient(visit, ctx.peopleByUid.get(visit.uid));
  const body =
    text ??
    (approved
      ? `שלום ${visit.name}, הביקור בחוות רווה אושר ל־${date.split('-').reverse().join('.')}${time ? ' בשעה ' + time : ''}.`
      : `שלום ${visit.name}, תודה שפנית לחוות רווה. המועד שביקשת אינו מתאים לנו הפעם.`);
  const options: { key: MessageChannel; title: string; available: boolean; hint: string }[] = [
    { key: 'email', title: 'באפליקציה וגם במייל', available: !!target.email, hint: target.email || 'אין כתובת מייל' },
    { key: 'push', title: 'פוש למכשיר', available: target.push, hint: target.push ? '' : 'לא הופעל במכשיר' },
    {
      key: 'whatsapp',
      title: 'פתיחת WhatsApp ישירות למבקש',
      available: !!target.phone,
      hint: target.phone || 'אין מספר טלפון',
    },
  ];
  const valid =
    !!body.trim() &&
    (!approved || /^\d{4}-\d{2}-\d{2}$/.test(date)) &&
    !options.some(option => channels.includes(option.key) && !option.available);
  const selectedLabels = [
    ...(target.uid ? [channels.length ? 'באפליקציה' : 'הודעה באפליקציה בלבד'] : []),
    ...(channels.includes('email') ? ['מייל'] : []),
    ...(channels.includes('push') ? ['פוש'] : []),
    ...(channels.includes('whatsapp') ? ['WhatsApp'] : []),
  ];
  async function confirm() {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const decision = { status: choice, managerNote, ...(approved ? { date, time } : {}), expectedUpdatedAt };
      setReceipt(
        await deliverOperationalMessage(ctx.actor, {
          id,
          source: 'visit',
          sourceId: visit.id,
          text: body,
          channels,
          people: [target],
          decision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open onClose={close} title={approved ? 'אישור הביקור ליומן' : 'לא מתאים'}>
      <div className="events-sheet">
        {receipt ? (
          <>
            <b role="status">{approved ? 'הביקור אושר ליומן' : 'הבקשה נדחתה'}</b>
            <p>
              {receipt.created ? 'ההודעה נשמרה בתיבה של המבקש.' : 'למבקש אין תיבה פעילה באפליקציה.'}
              {receipt.queued > 0 && ` ${receipt.queued} מסירות נוספו לתור.`}
            </p>
            {receipt.drafts.map(draft => (
              <Button key={draft.url} onClick={() => external(draft.url)}>
                פתיחת WhatsApp ל{draft.name}
              </Button>
            ))}
            <Button variant="outline" onClick={close}>
              סגירה
            </Button>
          </>
        ) : (
          <>
            {approved && (
              <>
                <Field label="תאריך הביקור" type="date" value={date} onChange={e => setDate(e.target.value)} />
                <Field label="שעה" type="time" value={time} onChange={e => setTime(e.target.value)} />
                {date !== visit.date && <b>מועד שונה מהבקשה</b>}
                <h3>ביומן בתאריך שנבחר</h3>
                {sameDay.map(item => (
                  <p key={item.id}>
                    {item.time} {item.title}
                  </p>
                ))}
                {calendar.error ? (
                  <p role="alert">לא ניתן לטעון את היומן.</p>
                ) : (
                  !calendar.loading && !sameDay.length && <p>היום הזה פנוי ביומן</p>
                )}
              </>
            )}
            <TextAreaField
              label="נוסח ההודעה למבקש"
              value={body}
              onChange={e => setText(e.target.value)}
              maxLength={240}
            />
            <CheckboxSelect label="איך להשיב" summary={selectedLabels.join(' · ')}>
              <p>{target.uid ? 'הודעה באפליקציה נשמרת למבקש.' : 'למבקש אין תיבה פעילה באפליקציה.'}</p>
              {options.map(option => (
                <label className="events-checkline" key={option.key}>
                  <input
                    type="checkbox"
                    disabled={!option.available || busy}
                    checked={channels.includes(option.key)}
                    onChange={() =>
                      setChannels(old =>
                        old.includes(option.key) ? old.filter(x => x !== option.key) : [...old, option.key],
                      )
                    }
                  />
                  <span>
                    {option.title}
                    {option.hint && (
                      <small className="k-meta" dir="auto">
                        {' '}
                        {option.hint}
                      </small>
                    )}
                  </span>
                </label>
              ))}
            </CheckboxSelect>
            <Button size="bar" disabled={!valid || busy} onClick={confirm}>
              {approved ? 'אישור סופי ליומן' : 'אישור סופי של הדחייה'}
            </Button>
            {error && <p role="alert">{error}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
