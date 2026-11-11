import { useEffect, useState } from 'react';
import type { Profile, Template, RoleInvite, Actor, Role, Status, Place } from '../types';
import { ROLE_LABELS, STATUS_LABELS, DAY_LABELS } from '../types';
import { usePeople, setUserRole, useRoleInvites, inviteByEmail, removeRoleInvite, saveTemplate, deleteTemplate, addPlace, deletePlace, getPosition, type NewTemplate } from '../store';
import { useActivityForUser } from '../activity';
import { Timeline } from './Shopping';
import { Icon, Sheet, Button, Empty, Avatar, Segmented, useToast, fmtDate } from '../ui';
import { back, navigate } from '../router';
import { downloadCsv } from '../data';
import type { RegistrationField } from '../types';

type Ctx = { actor: Actor; owner: boolean; templates: Template[]; places: Place[]; fields?: RegistrationField[] };
type Tab = 'people' | 'templates' | 'places';

export function ManageScreen({ ctx, tab = 'people' }: { ctx: Ctx; tab?: Tab }) {
  const setTab = (t: Tab) => navigate('/manage/' + t, true);
  const titles: Record<Tab, string> = { people: 'אנשים', templates: 'משימות חוזרות', places: 'מקומות' };
  const subs: Record<Tab, string> = { people: 'צוות, אורחים וקודי הצטרפות', templates: 'מה חוזר כל יום ומי מסמן', places: 'נקודות שמורות בחווה' };
  return (
    <>
      <header className="topbar"><div><h1>{titles[tab]}</h1><div className="sub">{subs[tab]}</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/manage')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'people', label: 'אנשים' }, { value: 'templates', label: 'משימות חוזרות' }, { value: 'places', label: 'מקומות' }]} />
      {tab === 'people' && <People ctx={ctx} />}
      {tab === 'templates' && <Templates ctx={ctx} />}
      {tab === 'places' && <Places ctx={ctx} />}
    </>
  );
}

// ---------- people ----------
function People({ ctx }: { ctx: Ctx }) {
  const { items, loading } = usePeople(true);
  const invites = useRoleInvites(true);
  const toast = useToast();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleInvite['role']>('staff');
  const s = q.trim().toLowerCase();
  const match = (p: Profile) => !s || p.displayName.toLowerCase().includes(s) || p.email.includes(s) || p.phone.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '—') || String(p.customerNumber) === s;
  const team = items.filter((p) => p.role !== 'guest' && match(p)).sort((a, b) => ['owner', 'manager', 'staff'].indexOf(a.role) - ['owner', 'manager', 'staff'].indexOf(b.role) || a.displayName.localeCompare(b.displayName, 'he'));
  const guests = items.filter((p) => p.role === 'guest' && match(p));
  const pendingInvites = invites.items.filter((i) => !items.some((p) => p.email === i.email));
  const exportCsv = () => downloadCsv('אנשים.csv', ['מספר לקוח', 'שם', 'טלפון', 'מייל', 'תפקיד', 'מצב', 'תאריך הרשמה', ...(ctx.fields || []).map((f) => f.label)], [...items].sort((a, b) => a.customerNumber - b.customerNumber).map((p) => [p.customerNumber, p.displayName, p.phone, p.email, ROLE_LABELS[p.role], STATUS_LABELS[p.status], fmtDate(p.createdAt), ...(ctx.fields || []).map((f) => p.fields?.[f.id] || '')]));
  const PersonRow = ({ p }: { p: Profile }) => (
    <button type="button" className="row" onClick={() => setSelected(p)}>
      <Avatar name={p.displayName} size={38} />
      <div className="row-main"><div className="row-title">{p.displayName}</div><div className="row-meta"><span className={'tag ' + (p.role === 'owner' ? 'gold' : p.role === 'manager' ? 'ok' : '')}>{ROLE_LABELS[p.role]}</span>{p.phone && <span dir="ltr">{p.phone}</span>}<span>#{p.customerNumber}</span>{p.status === 'blocked' && <span className="tag bad">חסום</span>}</div></div>
      <span className="row-end"><Icon name="chev" size={18} /></span>
    </button>
  );
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label className="field" style={{ flex: 1, margin: 0 }}><span className="sr-only">חיפוש</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון, מייל או מספר" /></label>
        <Button kind="secondary" className="sm" onClick={exportCsv} aria-label="ייצוא לאקסל"><Icon name="download" /></Button>
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div><b style={{ fontWeight: 500 }}>תפקיד לפי חשבון גוגל</b><div className="hint">מי שנכנס עם הכתובת שהגדרתם מקבל את התפקיד אוטומטית. בלי קודים.</div></div>
          <Button kind="primary" className="sm" onClick={() => setInviting(true)}><Icon name="plus" />הוספה</Button>
        </div>
        {pendingInvites.length > 0 && <div className="list" style={{ marginTop: 12, boxShadow: 'none' }}>{pendingInvites.map((i) => (
          <div className="row" key={i.id} style={{ padding: '10px 12px' }}><div className="row-main"><div className="row-title" style={{ fontSize: 15 }} dir="ltr">{i.email}</div><div className="row-meta"><span className="tag">{ROLE_LABELS[i.role]}</span><span>עדיין לא נכנס/ה</span></div></div><button type="button" className="icon-btn ghost" aria-label="הסרה" onClick={() => removeRoleInvite(i.email)}><Icon name="x" size={18} /></button></div>
        ))}</div>}
      </div>
      <div className="section"><div className="section-head"><h2>הצוות · {team.length}</h2></div>{loading ? <div className="loading">טוען…</div> : team.length ? <div className="list">{team.map((p) => <PersonRow key={p.uid} p={p} />)}</div> : <Empty title="עדיין אין צוות" text="הוסיפו כתובת מייל של מתנדב או מנהל למעלה." icon="people" />}</div>
      {guests.length > 0 && <div className="section"><div className="section-head"><h2>אורחים · {guests.length}</h2></div><div className="list">{guests.map((p) => <PersonRow key={p.uid} p={p} />)}</div></div>}
      <PersonSheet person={selected} onClose={() => setSelected(null)} ctx={ctx} />
      <Sheet open={inviting} onClose={() => setInviting(false)} title="תפקיד לפי מייל">
        <p className="hint" style={{ marginBottom: 14 }}>כשהאדם ייכנס לראשונה עם חשבון הגוגל הזה, הוא יקבל את התפקיד מיד. אם כבר נרשם, שנו את התפקיד דרך הכרטיס שלו.</p>
        <label className="field"><span>כתובת גוגל</span><input data-autofocus value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} dir="ltr" inputMode="email" placeholder="name@gmail.com" /></label>
        <div className="field"><span>תפקיד</span><div className="chips">{(ctx.owner ? ['staff', 'manager', 'owner'] : ['staff']).map((r) => <button key={r} type="button" className={'chip ' + (inviteRole === r ? 'on' : '')} onClick={() => setInviteRole(r as RoleInvite['role'])}>{ROLE_LABELS[r as Role]}</button>)}</div></div>
        <div className="sheet-foot"><Button kind="primary" onClick={async () => { try { await inviteByEmail(ctx.actor, inviteEmail, inviteRole); setInviteEmail(''); setInviting(false); toast({ text: 'נשמר. התפקיד יחול בכניסה הראשונה.' }, 3000); } catch (e: any) { toast({ text: e.message || 'לא נשמר', kind: 'error' }); } }}>שמירה</Button><Button kind="quiet" onClick={() => setInviting(false)}>ביטול</Button></div>
      </Sheet>
    </>
  );
}

function PersonSheet({ person, onClose, ctx }: { person: Profile | null; onClose: () => void; ctx: Ctx }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>('staff');
  const [status, setStatus] = useState<Status>('active');
  const [notes, setNotes] = useState('');
  const activity = useActivityForUser(person?.uid || '', !!person);
  useEffect(() => { if (person) { setRole(person.role); setStatus(person.status); setNotes(person.notes || ''); } }, [person?.uid]);
  if (!person) return <Sheet open={false} onClose={onClose}><div /></Sheet>;
  const isSelf = person.uid === ctx.actor.uid;
  const roles: Role[] = ctx.owner ? ['guest', 'staff', 'manager', 'owner'] : ['guest', 'staff'];
  const locked = person.role === 'owner' && !ctx.owner;
  const dirty = role !== person.role || status !== person.status || notes !== (person.notes || '');
  return (
    <Sheet open={!!person} onClose={onClose} title={person.displayName}>
      <div className="detail-list">
        <div className="kv"><Icon name="user" size={18} /><div dir="ltr" style={{ textAlign: 'end' }}>{person.email}</div></div>
        <div className="kv"><Icon name="info" size={18} /><div>לקוח מספר {person.customerNumber} · נרשם/ה {fmtDate(person.createdAt)}</div></div>
        {person.phone && <div className="kv"><Icon name="phone" size={18} /><div dir="ltr" style={{ textAlign: 'end' }}>{person.phone}</div></div>}
        {(ctx.fields || []).filter((f) => person.fields?.[f.id]).map((f) => <div className="kv" key={f.id}><Icon name="info" size={18} /><div>{f.label}: {person.fields![f.id]}</div></div>)}
      </div>
      {person.phone && <div className="row-actions" style={{ marginTop: 10 }}><a className="btn secondary sm" href={`https://wa.me/${person.phone.replace(/\D/g, '').replace(/^0/, '972')}`} target="_blank" rel="noopener">וואטסאפ</a><a className="btn secondary sm" href={`tel:${person.phone}`}>התקשרות</a></div>}
      {locked ? <p className="hint" style={{ marginTop: 16 }}>רק בעלים יכולים לשנות בעלים.</p> : (
        <>
          <div className="section"><div className="section-head"><h2>תפקיד</h2></div><div className="chips">{roles.map((r) => <button key={r} type="button" className={'chip ' + (role === r ? 'on' : '')} onClick={() => setRole(r)} disabled={isSelf && r !== person.role}>{ROLE_LABELS[r]}</button>)}</div></div>
          <div className="section"><div className="section-head"><h2>מצב</h2></div><div className="chips">{(['active', 'blocked'] as Status[]).map((st) => <button key={st} type="button" className={'chip ' + (status === st ? (st === 'blocked' ? 'on bad' : 'on') : '')} onClick={() => setStatus(st)} disabled={isSelf}>{STATUS_LABELS[st]}</button>)}</div></div>
          <label className="field" style={{ marginTop: 16 }}><span>הערות פנימיות (רק מנהלים רואים)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {dirty && <div className="row-actions"><Button kind="primary" onClick={async () => { try { await setUserRole(ctx.actor, person, role, status, notes); toast({ text: 'נשמר' }, 2000); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button><Button kind="quiet" onClick={() => { setRole(person.role); setStatus(person.status); setNotes(person.notes || ''); }}>ביטול</Button></div>}
        </>
      )}
      {(person.log || []).length > 0 && <div className="section"><div className="section-head"><h2>שינויים</h2></div><ol className="timeline">{[...(person.log || [])].reverse().map((l, i) => <li key={i}><span className="tl-dot" /><div><b>{l.text}</b><small>{fmtDate(l.at)} · {l.by.name}</small></div></li>)}</ol></div>}
      <Timeline items={activity.items} title="פעילות" />
    </Sheet>
  );
}

// ---------- recurring templates ----------
const blank: NewTemplate = { title: '', note: '', days: [], time: '', active: true, managersOnly: false };
function Templates({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Template | null | 'new'>(null);
  const [form, setForm] = useState<NewTemplate>(blank);
  useEffect(() => { if (editing === 'new') setForm(blank); else if (editing) setForm({ title: editing.title, note: editing.note, days: editing.days, time: editing.time, active: editing.active, managersOnly: editing.managersOnly }); }, [editing]);
  const dayText = (t: Template) => t.days.length === 0 || t.days.length === 7 ? 'כל יום' : t.days.map((d) => DAY_LABELS[d]).join(' ');
  return (
    <>
      <p className="hint" style={{ margin: '0 0 12px' }}>משימה חוזרת נוצרת מחדש כל יום שבו היא פעילה, ומופיעה אצל כולם ב"היום". מי שסימן אותה נרשם.</p>
      {ctx.templates.length ? <div className="list">{ctx.templates.map((t) => (
        <button type="button" className="row" key={t.id} onClick={() => setEditing(t)}>
          <span className="icon-btn ghost" style={{ width: 30, height: 30, color: t.active ? 'var(--olive)' : 'var(--faint)' }}><Icon name="repeat" size={20} /></span>
          <div className="row-main"><div className="row-title" style={{ color: t.active ? undefined : 'var(--muted)' }}>{t.title}</div><div className="row-meta"><span>{dayText(t)}</span>{t.time && <span>{t.time}</span>}{!t.active && <span className="tag">מושהית</span>}{t.managersOnly && <span className="tag gold">מנהלים</span>}</div></div>
        </button>
      ))}</div> : <Empty title="אין משימות חוזרות" text="למשל: השקיית העציצים כל יום, סידור כלים בימי שישי." icon="repeat" />}
      <button type="button" className="fab" onClick={() => setEditing('new')}><Icon name="plus" />משימה חוזרת</button>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'משימה חוזרת חדשה' : 'עריכת משימה חוזרת'}>
        <label className="field"><span>מה צריך לעשות?</span><input data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="למשל: השקיית העציצים" /></label>
        <label className="field"><span>הסבר קצר (לא חובה)</span><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div className="field"><span>באילו ימים? (בלי בחירה = כל יום)</span><div className="chips">{DAY_LABELS.map((l, d) => <button key={d} type="button" className={'chip ' + (form.days.includes(d) ? 'on' : '')} onClick={() => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort() })}>{l}</button>)}</div></div>
        <label className="field"><span>שעה (לא חובה)</span><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} dir="ltr" /></label>
        <div className="toggle"><div>פעילה</div><button type="button" role="switch" aria-checked={form.active} className="switch" aria-label="פעילה" onClick={() => setForm({ ...form, active: !form.active })} /></div>
        <div className="toggle"><div>למנהלים בלבד</div><button type="button" role="switch" aria-checked={form.managersOnly} className="switch" aria-label="למנהלים בלבד" onClick={() => setForm({ ...form, managersOnly: !form.managersOnly })} /></div>
        <div className="sheet-foot">
          <Button kind="primary" onClick={async () => { if (!form.title.trim()) return toast({ text: 'מה צריך לעשות?', kind: 'error' }); try { await saveTemplate(ctx.actor, form, editing === 'new' ? undefined : editing!); setEditing(null); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button>
          {editing !== 'new' && editing && <Button kind="quiet" onClick={async () => { if (!confirm('למחוק את המשימה החוזרת? משימות שכבר נוצרו יישארו.')) return; await deleteTemplate(editing.id); setEditing(null); }}><Icon name="trash" />מחיקה</Button>}
        </div>
      </Sheet>
    </>
  );
}

// ---------- places ----------
function Places({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="hint" style={{ margin: '0 0 12px' }}>עמדו במקום, כתבו לו שם ולחצו "שמירה כאן". המקום יופיע לבחירה בכל משימה, ובעתיד על המפה.</p>
      <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 8 }}>
        <label className="field" style={{ flex: 1, margin: 0 }}><span className="sr-only">שם המקום</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: העץ מאחורי הביתן" /></label>
        <Button kind="primary" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); try { const p = await getPosition(); await addPlace(ctx.actor, name, p.lat, p.lng); setName(''); toast({ text: 'המקום נשמר' }, 2000); } catch (e: any) { toast({ text: e.message || 'לא נשמר', kind: 'error' }); } finally { setBusy(false); } }}><Icon name="pin" />שמירה כאן</Button>
      </div>
      {ctx.places.length ? <div className="list">{ctx.places.map((p) => (
        <div className="row" key={p.id}><span className="icon-btn ghost" style={{ width: 30, height: 30, color: 'var(--olive)' }}><Icon name="pin" size={20} /></span>
          <div className="row-main"><div className="row-title">{p.name}</div><div className="row-meta"><a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener" style={{ color: 'var(--olive)' }}>במפה ↗</a><span dir="ltr">{p.lat}, {p.lng}</span></div></div>
          <button type="button" className="icon-btn ghost" aria-label="מחיקה" onClick={async () => { if (confirm('למחוק את המקום?')) await deletePlace(p.id); }}><Icon name="x" size={18} /></button></div>
      ))}</div> : <Empty title="עדיין אין מקומות שמורים" icon="pin" />}
    </>
  );
}
