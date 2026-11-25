// מפתחות API on a computer (K14): the keys as a table, and beside it what the selected key may do, its use and its
// expiry. The same loads and the same server actions as the phone's (../Keys.tsx).
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ConfirmSheet } from '../../app/v2/kit';
import { ROLE_LABELS } from '../../app/types';
import { dayName, ddmm, daysFromToday } from '../../app/v2/format';
import { nowMs } from '../../app/clock';
import { ago, until, useLoad } from '../shared';
import { errorText, source, type KeyView, type LastUse, type Person } from '../source';
import { allLevels, DESK_AREAS, deskLevels, deskScopes, levelHe, scopesFrom, scopesShort, type DeskArea, type Level, type Levels } from '../scopes';
import { ACCESS, type Access, accessOf, EXPIRY, type Expiry, GRACE, type Grace, inDays, type Notify, teamOf, unusedText, usageText, useLastUse } from '../Keys';
import { Act, Btn, Check, Chips, Cols, DTag, Dialog, EmptyPanel, Fact, Facts, Failed, Input, LoadingPanel, Mono, Notice, Page, Panel, Seg, Select, Skeleton, SubTitle, Table, TableCard, Toolbar } from './desk';
import { useLeaveGuard, useSelected } from './route';

const DAY = 86400_000;
/** An inactive key stays beside the active ones for a month: whoever cancelled it by mistake finds it and puts it back. */
const recent = (k: KeyView) => { const at = k.status === 'expired' ? k.expiresAt : k.updatedAt; return !!at && nowMs() - Date.parse(at) < 30 * DAY; };
const endsSoon = (k: KeyView) => !!k.expiresAt && Date.parse(k.expiresAt) - nowMs() < 7 * DAY;
function endsText(iso: string) {
  const d = daysFromToday(iso);
  const day = dayName(iso);
  return d <= 0 ? 'פג היום' : d === 1 ? 'פג מחר' : day === 'שבת' ? 'פג בשבת' : `פג ביום ${day}`;
}
function StatusTag({ k }: { k: KeyView }) {
  if (k.status === 'revoked') return <DTag tone="red">בוטל</DTag>;
  if (k.status === 'expired') return <DTag>פג תוקף</DTag>;
  if (k.rotating) return <DTag tone="warm">בהחלפה</DTag>;
  if (endsSoon(k)) return <DTag tone="amber">{endsText(k.expiresAt!)}</DTag>;
  return <DTag tone="green">פעיל</DTag>;
}
const expiryText = (k: KeyView) => (!k.expiresAt ? 'בלי תאריך סיום' : Date.parse(k.expiresAt) > nowMs() ? `עד ${ddmm(k.expiresAt)}` : `פג ב־${ddmm(k.expiresAt)}`);
const SOON = 'בדרך כלל תוך דקה, ולכל היותר תוך דקה וחצי';

export function KeysDesk({ keys, error, reload, lastUsed, people, notify }: { keys: KeyView[] | null; error: string | null; reload: () => void; lastUsed: LastUse | null; people: Person[]; notify: Notify }) {
  const [view, setView] = useState<'active' | 'inactive'>('active');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ title: string; key: string } | null>(null);
  const byUid = useMemo(() => new Map(people.map((p) => [p.uid, p])), [people]);
  const personOf = (k: KeyView) => byUid.get((k.actors[0] || '').replace(/^user:/, ''));
  const whoName = (k: KeyView) => personOf(k)?.displayName || (k.actors[0]?.startsWith('user:') ? 'אדם שלא נמצא' : 'מפתח בדיקות');
  const roleName = (k: KeyView) => { const p = personOf(k); return p ? ROLE_LABELS[p.role] : ''; };
  const active = (keys || []).filter((k) => k.status === 'active');
  const inactive = (keys || []).filter((k) => k.status !== 'active');
  const rows = keys && (view === 'active' ? [...active, ...inactive.filter(recent)] : inactive);
  // what the open key's panel is in the middle of: choices that were not saved are not dropped without asking
  const work = useRef<Work | null>(null);
  const [leave, setLeave] = useState<{ go: () => void } | null>(null);
  const guard = (go: () => void) => { if (work.current?.dirty) setLeave({ go }); else go(); };
  useLeaveGuard(() => !!work.current?.dirty, (go) => setLeave({ go }));
  const [sel, select] = useSelected('keys', (rows || []).map((k) => k.id), true, (name) => rows?.find((k) => k.label === name)?.id);
  const drop = () => { const w = work.current; const x = leave; work.current = null; w?.drop(); setLeave(null); x?.go(); };
  const open = rows?.find((k) => k.id === sel) || null;
  return (
    <Page group="גישה ואבטחה" title="מפתחות API" sub="כל מפתח פועל בשם אדם מהצוות, ולא יכול לעשות יותר ממה שמותר לאותו אדם"
      actions={<Btn kind="primary" icon="plus" onClick={() => guard(() => setCreating(true))}>מפתח חדש</Btn>}>
      <Toolbar end={<span className="da-note">מפתח חדש מוצג פעם אחת בלבד. ביטול נכנס לתוקף תוך דקה.</span>}>
        <Chips label="אילו מפתחות" value={view} onChange={(v) => { if (v !== view) guard(() => setView(v)); }} options={[
          { value: 'active', label: keys ? `פעילים · ${active.length}` : 'פעילים' }, { value: 'inactive', label: keys ? `לא פעילים · ${inactive.length}` : 'לא פעילים' }]} />
      </Toolbar>
      <Cols>
        <TableCard style={{ containerType: 'inline-size' }}>
          <Table<KeyView> label="מפתחות API" rows={rows} rowKey={(k) => k.id} selected={sel} onSelect={(id) => { if (id !== sel) guard(() => select(id)); }} onEnter={(k) => { if (k.id === sel) work.current?.save(); }} error={error && `לא הצלחנו לקרוא את המפתחות. ${error}`} retry={reload} skeleton={4}
            empty={view === 'active' ? 'אין מפתחות פעילים. "מפתח חדש" יוצר אחד.' : 'אין מפתחות לא פעילים.'}
            columns={[
              { key: 'name', head: 'מפתח', strong: true, cell: (k) => (
                <>{k.label || <Mono>{k.id}</Mono>}<span className="da-under da-under--who">{whoName(k)}</span><span className="da-under da-under--may">{scopesShort(k.scopes, roleName(k))}</span></>
              ) },
              { key: 'who', head: 'של מי', cell: whoName, width: 154 },
              { key: 'may', head: 'מה מותר', cell: (k) => { const t = scopesShort(k.scopes, roleName(k)); return <span className="da-clip" title={t}>{t}</span>; }, width: 234 },
              { key: 'used', head: 'שימוש אחרון', cell: (k) => (!lastUsed ? '' : lastUsed.at[k.id] ? ago(lastUsed.at[k.id]) : unusedText(lastUsed)), width: 154, soft: true },
              { key: 'status', head: 'מצב', cell: (k) => <StatusTag k={k} />, width: 134, align: 'end' },
            ]} />
        </TableCard>
        {open
          ? <KeyPanel key={open.id} work={work} k={open} who={whoName(open)} role={roleName(open)} lastUsed={lastUsed} notify={notify}
            onChanged={(key) => { reload(); if (key) setRevealed({ title: `המפתח החדש של "${open.label || open.id}"`, key }); }} />
          : !keys && !error ? <LoadingPanel /> : <EmptyPanel>בחרו מפתח מהטבלה.</EmptyPanel>}
      </Cols>
      <CreateDialog open={creating} onClose={() => setCreating(false)} people={people} notify={notify}
        onCreated={(label, id, key) => { setCreating(false); setView('active'); select(id); setRevealed({ title: `המפתח "${label}" מוכן`, key }); reload(); }} />
      <RevealDialog shown={revealed} onClose={() => setRevealed(null)} notify={notify} />
      <ConfirmSheet open={!!leave} title="יש שינויים שלא נשמרו" text={`מה שסימנתם ב"${open?.label || open?.id || 'מפתח'}" לא יישמר.`} confirmLabel="לצאת בלי לשמור" cancelLabel="חזרה לעריכה" onClose={() => setLeave(null)} onConfirm={drop} />
    </Page>
  );
}

/** One area: a box (may or may not), and at the end what it may there, changed in place. */
function AreaRow({ a, level, onChange }: { a: DeskArea; level: Level; onChange: (l: Level) => void }) {
  return (
    <Check on={level !== 'none'} onChange={(on) => onChange(on ? 'read' : 'none')} label={a.he}
      aside={level === 'none' ? undefined : (
        <select className="da-level" aria-label={`${a.he}: מה מותר`} value={level} onChange={(e) => onChange(e.target.value as Level)}>
          {(['read', 'write'] as Level[]).map((l) => <option key={l} value={l}>{levelHe(a, l)}</option>)}
        </select>
      )} />
  );
}
type Draft = { access: Access; levels: Levels };
const draftOf = (scopes: string[] | null): Draft => ({ access: accessOf(scopes), levels: deskLevels(scopes) });
const draftScopes = (d: Draft, before: string[] | null) => (d.access === 'all' ? null : d.access === 'read' ? scopesFrom(allLevels('read')) : deskScopes(before, d.levels));
const toAccess = (d: Draft, access: Access, scopes: string[] | null): Draft => ({
  access, levels: access === 'all' ? deskLevels(null) : access === 'read' ? deskLevels(scopesFrom(allLevels('read'))) : scopes && accessOf(scopes) === 'custom' ? deskLevels(scopes) : d.levels });
const AccessSelect = ({ value, onChange }: { value: Access; onChange: (a: Access) => void }) =>
  <span className="da-access"><Select bare label="מה המפתח יכול" value={value} onChange={(v) => onChange(v as Access)} options={ACCESS} /></span>;
function Areas({ d, set, main }: { d: Draft; set: (d: Draft) => void; main: boolean }) {
  return <>{DESK_AREAS.filter((a) => !!a.main === main).map((a) => <AreaRow key={a.id} a={a} level={d.levels[a.id] || 'none'} onChange={(l) => set({ access: 'custom', levels: { ...d.levels, [a.id]: l } })} />)}</>;
}

/** What the panel tells the page: is something not saved, how to save it, how to let it go. */
type Work = { dirty: boolean; save: () => void; drop: () => void };
function KeyPanel({ work, k, who, role, lastUsed, notify, onChanged }: { work: MutableRefObject<Work | null>; k: KeyView; who: string; role: string; lastUsed: LastUse | null; notify: Notify; onChanged: (newKey?: string) => void }) {
  const scopesKey = JSON.stringify(k.scopes);
  const [d, setD] = useState<Draft>(() => draftOf(k.scopes));
  useEffect(() => { setD(draftOf(k.scopes)); }, [scopesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const usage = useLoad(() => source.keyUsage(k.id), [k.id]);
  const last = useLastUse(k.id, lastUsed);
  const [ask, setAsk] = useState<null | 'save' | 'revoke' | 'restore' | 'rename' | 'rotate' | 'expire'>(null);
  const [label, setLabel] = useState('');
  const [grace, setGrace] = useState<Grace>('24');
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [busy, setBusy] = useState(false);
  const run = async (action: Parameters<typeof source.changeKey>[1], body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await source.changeKey(k.id, action, body);
      setAsk(null);
      if (!r.key) notify(done); // a new key opens its own window, which says it
      onChanged(r.key);
    } catch (e) { setAsk(null); notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const next = draftScopes(d, k.scopes);
  const dirty = JSON.stringify(next && [...next].sort()) !== JSON.stringify(k.scopes && [...k.scopes].sort());
  const save = () => {
    if (!dirty) return notify('לא השתנה כלום');
    if (next && !next.length) return notify('בחרו לפחות תחום אחד שהמפתח יכול לראות', 'alert');
    setAsk('save');
  };
  useEffect(() => { work.current = { dirty, save: () => { if (!busy) save(); }, drop: () => setD(draftOf(k.scopes)) }; });
  useEffect(() => () => { work.current = null; }, [work]);
  const more = DESK_AREAS.filter((a) => !a.main);
  const moreOn = d.access === 'custom' ? more.filter((a) => d.levels[a.id] && d.levels[a.id] !== 'none').length : 0;
  const name = k.label || k.id;
  return (
    <>
      <Panel label={name} title={name} aside={<button type="button" className="da-edit" onClick={() => { setLabel(k.label); setAsk('rename'); }}>שינוי שם</button>}
        sub={`מפתח של ${who} · ${k.createdAt ? `נוצר ב־${ddmm(k.createdAt)}` : 'הוגדר בשרת לפני הקונסולה'}`}
        footer={<>
          <Btn kind="primary" onClick={save} disabled={busy}>שמירה</Btn>
          <Btn onClick={() => { setGrace('24'); setAsk('rotate'); }}>החלפת המפתח</Btn>
          {k.status === 'revoked' ? <Btn kind="action" onClick={() => setAsk('restore')}>החזרת המפתח</Btn> : <Btn kind="danger" onClick={() => setAsk('revoke')}>ביטול</Btn>}
        </>}>
        {k.status === 'active' && k.rotating && k.previousUntil && Date.parse(k.previousUntil) > nowMs() && <Notice><b>בהחלפה.</b> המפתח הישן עובד {until(k.previousUntil)}, כדי שיהיה זמן לעדכן את אינסטינקט.</Notice>}
        {k.status === 'revoked' && <Notice tone="red"><b>בוטל.</b> השרת לא מקבל אותו. אפשר להחזיר אותו לעבודה מכאן.</Notice>}
        {k.status === 'expired' && <Notice><b>פג תוקף.</b> השרת לא מקבל אותו. תאריך חדש מחזיר אותו לעבודה.</Notice>}
        <div className="da-sub"><SubTitle>מה מותר לו</SubTitle><AccessSelect value={d.access} onChange={(a) => setD(toAccess(d, a, k.scopes))} /></div>
        <Areas d={d} set={setD} main />
        <Facts style={{ marginTop: 8 }}>
          {usage.loading ? <Fact label="שימוש"><Skeleton lines={1} /></Fact>
            : usage.error ? <Fact label="שימוש">לא נקרא. <Act onClick={usage.reload}>לנסות שוב</Act></Fact>
              : usage.data && <Fact label="שימוש">{usageText(usage.data)}</Fact>}
          <Fact label="תוקף"><span className="da-row"><span>{expiryText(k)}</span><button type="button" className="da-edit" onClick={() => setAsk('expire')}>שינוי</button></span></Fact>
        </Facts>
        <details key={`${k.id}${moreOn > 0}`} className="da-more" open={moreOn > 0}>
          <summary>תחומים נוספים{moreOn ? ` · ${moreOn} מותרים` : ''}</summary>
          <Areas d={d} set={setD} main={false} />
        </details>
        <details className="da-more">
          <summary>פרטי המפתח</summary>
          <Fact label="פועל בשם">{who}{role && ` · ${role}`}</Fact>
          <Fact label="שימוש אחרון">{last}</Fact>
          <Fact label="נוצר">{k.createdAt ? `${ddmm(k.createdAt)}${k.createdBy ? ` · ${k.createdBy}` : ''}` : 'הוגדר בשרת לפני הקונסולה'}</Fact>
          <Fact label="מזהה"><Mono>{k.id}</Mono></Fact>
        </details>
      </Panel>

      <ConfirmSheet open={ask === 'save'} tone="primary" title="לשמור את ההרשאות?" confirmLabel="כן, לשמור" cancelLabel="חזרה" onClose={() => setAsk(null)}
        text={<>{`"${name}" יוכל: ${scopesShort(next, role)}.`} מפתח לעולם לא מקבל יותר ממה שהתפקיד של {who} מאפשר. השינוי נכנס לתוקף {SOON}.</>}
        onConfirm={() => run('scopes', { scopes: next }, 'ההרשאות נשמרו')} />
      <ConfirmSheet open={ask === 'revoke'} title="לבטל את המפתח?" confirmLabel="כן, לבטל" cancelLabel="חזרה" onClose={() => setAsk(null)}
        text={`"${name}" יפסיק לעבוד, ${SOON}. אפשר להחזיר אותו אחר כך מכאן.`} onConfirm={() => run('revoke', {}, 'המפתח בוטל')} />
      <ConfirmSheet open={ask === 'restore'} tone="primary" title="להחזיר את המפתח לעבודה?" confirmLabel="כן, להחזיר" cancelLabel="חזרה" onClose={() => setAsk(null)}
        text={`"${name}" יחזור לפעול בשם ${who}, עם מה שהיה מותר לו.`} onConfirm={() => run('restore', {}, 'המפתח הוחזר לעבודה')} />
      <Dialog open={ask === 'rename'} onClose={() => setAsk(null)} title="שינוי שם" width={440}
        footer={<><Btn kind="primary" disabled={busy || !label.trim() || label.trim() === k.label} onClick={() => run('rename', { label: label.trim() }, 'השם נשמר')}>שמירה</Btn><Btn onClick={() => setAsk(null)}>חזרה</Btn></>}>
        <form onSubmit={(e) => { e.preventDefault(); if (label.trim() && label.trim() !== k.label && !busy) run('rename', { label: label.trim() }, 'השם נשמר'); }}>
          <Input label="שם המפתח" value={label} onChange={(v) => setLabel(v.slice(0, 60))} hint="השם שמופיע ביומן" />
        </form>
      </Dialog>
      <Dialog open={ask === 'rotate'} onClose={() => setAsk(null)} title="החלפת המפתח" sub="נוצר מפתח חדש שמוצג פעם אחת." width={440}
        footer={<><Btn kind="primary" disabled={busy} onClick={() => run('rotate', { graceHours: Number(grace) }, 'נוצר מפתח חדש')}>{busy ? 'מחליף…' : 'יצירת מפתח חדש'}</Btn><Btn onClick={() => setAsk(null)}>חזרה</Btn></>}>
        <div className="d-field"><span className="d-field__label">כמה זמן המפתח הנוכחי ימשיך לעבוד?</span><Seg label="כמה זמן המפתח הנוכחי ימשיך לעבוד" options={GRACE} value={grace} onChange={setGrace} /></div>
        {grace === '0' && <Notice tone="red">המפתח הנוכחי יפסיק לעבוד מיד. האינסטינקט ייעצר עד שתעדכנו אצלו את החדש.</Notice>}
      </Dialog>
      <Dialog open={ask === 'expire'} onClose={() => setAsk(null)} title="תוקף המפתח" sub="אחרי התאריך המפתח מפסיק לעבוד מעצמו." width={440}
        footer={<><Btn kind="primary" disabled={busy} onClick={() => run('expire', { expiresAt: inDays(expiry) }, expiry === 'none' ? 'התאריך הוסר' : 'התוקף נשמר')}>שמירה</Btn><Btn onClick={() => setAsk(null)}>חזרה</Btn></>}>
        <Seg label="תוקף" options={EXPIRY} value={expiry} onChange={setExpiry} />
      </Dialog>
    </>
  );
}

function CreateDialog({ open, onClose, people, onCreated, notify }: { open: boolean; onClose: () => void; people: Person[]; onCreated: (label: string, id: string, key: string) => void; notify: Notify }) {
  const team = teamOf(people);
  const [label, setLabel] = useState('');
  const [uid, setUid] = useState('');
  const [expiry, setExpiry] = useState<Expiry>('none');
  const [d, setD] = useState<Draft>({ access: 'all', levels: allLevels('none') });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const person = team.find((p) => p.uid === uid);
  const close = () => { setLabel(''); setUid(''); setExpiry('none'); setD({ access: 'all', levels: allLevels('none') }); setErr(''); onClose(); };
  const create = async () => {
    if (!label.trim()) return setErr('צריך שם למפתח');
    if (!person) return setErr('בחרו בשם מי המפתח פועל');
    const scopes = draftScopes(d, null);
    if (scopes && !scopes.length) return setErr('בחרו לפחות תחום אחד שהמפתח יכול לראות');
    setBusy(true); setErr('');
    try {
      const made = await source.createKey({ label: label.trim(), actor: 'user:' + person.uid, expiresAt: inDays(expiry), scopes });
      const name = label.trim();
      close();
      onCreated(name, made.id, made.key);
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={close} title="מפתח חדש" sub="המפתח מוצג פעם אחת, מיד אחרי היצירה."
      footer={<><Btn kind="primary" disabled={busy} onClick={create}>{busy ? 'יוצר…' : 'יצירת המפתח'}</Btn><Btn onClick={close}>חזרה</Btn></>}>
      <Input label="שם המפתח" required value={label} onChange={(v) => setLabel(v.slice(0, 60))} hint="השם שיופיע ביומן, למשל: האינסטינקט של בני" error={err === 'צריך שם למפתח' ? err : undefined} />
      <div className="d-field"><span className="d-field__label">פועל בשם · חובה</span>
        <Select label="פועל בשם" value={uid} onChange={setUid} options={[{ value: '', label: 'לבחור אדם מהצוות' }, ...team.map((p) => ({ value: p.uid, label: `${p.displayName} · ${ROLE_LABELS[p.role]}` }))]} width="100%" />
        {person && <span className="d-field__hint">המפתח יקבל את ההרשאות של {person.displayName} ({ROLE_LABELS[person.role]}), או חלק מהן. כשהתפקיד משתנה, גם ההרשאות של המפתח משתנות.</span>}
      </div>
      <div className="d-field"><span className="d-field__label">מה המפתח יכול</span>
        <Seg label="מה המפתח יכול" options={ACCESS} value={d.access} onChange={(a) => setD(a === 'custom' ? { ...d, access: a } : { access: a, levels: d.levels })} />
        {d.access === 'read' && <span className="d-field__hint">המפתח יוכל לקרוא הכל ולא לשנות כלום.</span>}
      </div>
      {d.access === 'custom' && <div className="da-areas"><Areas d={d} set={setD} main /><Areas d={d} set={setD} main={false} /></div>}
      <div className="d-field"><span className="d-field__label">תוקף</span><Seg label="תוקף" options={EXPIRY} value={expiry} onChange={setExpiry} /></div>
      {err && err !== 'צריך שם למפתח' && <Failed text={err} />}
    </Dialog>
  );
}

/** The new key, shown once. Closing it before copying asks first: the key would be gone for good. */
function RevealDialog({ shown, onClose, notify }: { shown: { title: string; key: string } | null; onClose: () => void; notify: Notify }) {
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const done = () => { setCopied(false); setSure(false); onClose(); };
  const close = () => (copied ? done() : setSure(true));
  const copy = async () => { try { await navigator.clipboard.writeText(shown!.key); setCopied(true); } catch { notify('ההעתקה לא הצליחה. סמנו את המפתח והעתיקו ידנית', 'alert'); } };
  return (
    <>
      <Dialog open={!!shown} onClose={close} title={shown?.title || ''} width={520}
        footer={<><Btn kind={copied ? 'neutral' : 'primary'} icon={copied ? 'check' : undefined} onClick={copy}>{copied ? 'הועתק' : 'העתקת המפתח'}</Btn><Btn onClick={close}>סיימתי</Btn></>}>
        <Notice>זו הפעם היחידה שהמפתח מוצג. מעתיקים אותו עכשיו ושומרים בכספת של האינסטינקט, לא בצ'אט ולא במייל.</Notice>
        <code className="da-key" dir="ltr">{shown?.key}</code>
      </Dialog>
      <ConfirmSheet open={sure && !!shown} title="לסגור בלי להעתיק?" text="המפתח לא יוצג שוב. אם לא שמרתם אותו, צריך להחליף אותו בחדש." confirmLabel="כן, לסגור" cancelLabel="חזרה" onClose={() => setSure(false)} onConfirm={done} />
    </>
  );
}
