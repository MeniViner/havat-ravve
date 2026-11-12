// Pieces of the previous interface that the restored screens (Today, event management) still use.
// The tasks and shopping screens themselves are the new ones.
import { useRef, useState, type ReactNode } from 'react';
import type { Task, ShoppingItem } from '../types';
import type { TeamCtx } from '../ctx';
import { Chk, Pill, Btn, Icon, A, useToast, firstName, relTime, dayLabel, fmtTime } from '../ui';
import { setBought, compressPhoto } from '../store';

export function taskMeta(t: Task, ctx: TeamCtx, today: string, noOwner = false): ReactNode {
  const parts: ReactNode[] = [];
  if (t.templateId) { const tpl = ctx.templates.find((x) => x.id === t.templateId); parts.push(<span key="r"><Icon name="repeat" /> {tpl?.days.length ? 'חוזרת' : 'כל יום'}{tpl?.time ? ` עד ${tpl.time}` : ''}</span>); }
  else if (t.dueDate && t.dueDate < today) parts.push(<span key="d" style={{ color: 'var(--rust)', fontWeight: 600 }}>היה עד {dayLabel(t.dueDate)}</span>);
  else if (t.dueDate && t.dueDate !== today) parts.push(<span key="d">{dayLabel(t.dueDate)}</span>);
  if (!noOwner && t.assignee && t.assignee.uid !== ctx.actor.uid) parts.push(<span key="a">{firstName(t.assignee.name)}</span>);
  if (!t.templateId && t.createdBy.uid !== ctx.actor.uid && (!t.assignee || t.assignee.uid === ctx.actor.uid)) parts.push(<span key="c">{firstName(t.createdBy.name)}{t.assignee ? ' ביקש' : ''}{!t.assignee ? ` · ${relTime(t.createdAt)}` : ''}</span>);
  if (t.location) parts.push(<span key="l"><Icon name="pin" /> {t.location.placeName || 'נקודה'}</span>);
  if (t.note && !t.photo) parts.push(<Icon key="n" name="info" />);
  return parts;
}

export function PhotoPicker({ value, onChange, label = 'צילום', big }: { value: string; onChange: (v: string) => void; label?: string; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div style={{ padding: '0 20px', marginTop: 14 }}>
      {value && <div className="photo" style={{ margin: '0 0 10px' }}><img src={value} alt="" /></div>}
      <div className="inline">
        <Btn kind="ghost" size={big ? undefined : 'sm'} icon="camera" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'דוחס…' : value ? 'החלפת תמונה' : label}</Btn>
        {value && <Btn kind="quiet" size="sm" onClick={() => onChange('')}>הסרה</Btn>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { onChange(await compressPhoto(f)); } catch (err) { toast({ text: (err as Error).message, kind: 'error' }); } finally { setBusy(false); } }} />
    </div>
  );
}

export function useMarkBought(ctx: TeamCtx) {
  const toast = useToast();
  return (i: ShoppingItem, v: boolean) => setBought(ctx.actor, i, v).then(() => { if (v) toast({ text: `${i.title} · ${i.category === 'giveaway' ? 'נמצא' : 'נקנה'}`, action: { label: 'ביטול', onClick: () => { setBought(ctx.actor, i, false).catch(() => {}); } } }, 4000); }).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
}
/** One line on the shopping note: tick box in the margin, the item, and the quantity at the end of the line like on paper. */
export function ShopLine({ i, onMark, selected }: { i: ShoppingItem; onMark: (v: boolean) => void; selected?: boolean }) {
  const done = i.bought;
  return (
    <div className={`line${done ? ' done' : ''}${i.urgent && !done ? ' urgent' : ''}${selected ? ' sel' : ''}`}>
      <Chk on={done} onChange={onMark} label={done ? `להחזיר לרשימה: ${i.title}` : `נקנה: ${i.title}`} rust={i.urgent} />
      <A to={`/shopping/${i.id}`} className="body">
        <span className="tx">
          <span className="t">{i.title}{i.urgent && !done && <> <Pill tone="rust">דחוף</Pill></>}</span>
          <span className="m">{done ? <>{firstName(i.boughtBy?.name || '')} {i.category === 'giveaway' ? 'מצא/ה' : 'קנה/תה'} · {fmtTime(i.boughtAt)}</> : <>{firstName(i.createdBy.name)} · {relTime(i.createdAt)}{i.note ? ` · ${i.note}` : ''}{i.link && <> <Icon name="link" size={13} /></>}</>}</span>
        </span>
        {i.qty && <span className="q">{i.qty}</span>}
      </A>
    </div>
  );
}

