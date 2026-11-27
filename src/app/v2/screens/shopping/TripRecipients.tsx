import { useState, useRef, useEffect } from 'react';
import { Button } from '../../kit';
import type { Profile } from '../../../types';

function Check({ label, ids, included, onChange }: { label: string; ids: string[]; included: Set<string>; onChange: (ids: string[], select: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const count = ids.filter(uid => included.has(uid)).length;
  useEffect(() => { if (input.current) input.current.indeterminate = count > 0 && count < ids.length; }, [count, ids.length]);
  return <label className="shopping-recipients-check"><input ref={input} type="checkbox" checked={!!count && count === ids.length} disabled={!ids.length}
    onChange={e => onChange(ids, e.target.checked)} />{label}</label>;
}

export function TripRecipients({ team, ids, setIds }: { team: Profile[]; ids: string[]; setIds: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const included = new Set(ids);
  const people = team.filter(p => p.status === 'active' && ['owner', 'manager', 'staff'].includes(p.role))
    .sort((a,b) => a.displayName.localeCompare(b.displayName,'he'));
  const toggle = (affected: string[], checked: boolean) => {
    const next = new Set(included);
    affected.forEach(uid => checked ? next.add(uid) : next.delete(uid));
    setIds([...next]);
  };
  return <div className="shopping-recipient-picker">
    <Button variant="outline" aria-expanded={open} aria-controls="trip-recipient-options" onClick={() => setOpen(!open)} aria-label={`בחירת נמענים, ${ids.length} נבחרו`}>נמענים · {ids.length}</Button>
    <section id="trip-recipient-options" hidden={!open} aria-label="למי להודיע?">
      <div className="shopping-recipient-list">
        <Check label="כולם" ids={people.map(p => p.uid)} included={included} onChange={toggle} />
        {[{ key: 'managers', title: 'מנהלים (כולל בעלים)', members: people.filter(p => p.role !== 'staff') }, { key: 'staff', title: 'מתנדבים', members: people.filter(p => p.role === 'staff') }].map(group =>
          <div className="shopping-recipient-group" key={group.key}>
            <Check label={group.title} ids={group.members.map(p => p.uid)} included={included} onChange={toggle} />
            <details><summary>שמות · {group.members.length}</summary><div>{group.members.map(p => <Check key={p.uid} label={p.displayName} ids={[p.uid]} included={included} onChange={toggle} />)}</div></details>
          </div>)}
      </div>
    </section>
  </div>;
}
