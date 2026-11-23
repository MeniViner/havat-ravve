// מפתחות API: every key the server accepts, what it is called, whose permissions it carries, when it was last used.
// A new or rotated key is shown once, in this browser only; the server keeps only its hash.
import { useMemo, useState } from 'react';
import { Button, Card, ChoiceGroup, DetailList, DetailRow, Field, IconTile, ListCard, Row, Segmented, Sheet, Tag } from '../app/v2/kit';
import { ROLE_LABELS } from '../app/types';
import { ddmm } from '../app/v2/format';
import { ago, Section, until, useLoad } from './shared';
import { errorText, source, type KeyView, type Person } from './source';
import { AREAS, areaLevel, LEVELS, PRESETS, PRESET_LABELS, presetOf, SCOPE_ROWS, scopesText, setAreaLevel, type Preset } from './scopes';

const STATUS: Record<KeyView['status'], { l: string; tone: 'paid' | 'urgent' | 'neutral' }> = {
  active: { l: 'פעיל', tone: 'paid' }, revoked: { l: 'בוטל', tone: 'urgent' }, expired: { l: 'פג תוקף', tone: 'neutral' },
};
type Expiry = 'none' | '30' | '90' | '365';
const EXPIRY: { value: Expiry; label: string }[] = [{ value: 'none', label: 'בלי תאריך' }, { value: '30', label: '30 יום' }, { value: '90', label: '90 יום' }, { value: '365', label: 'שנה' }];
const inDays = (d: Expiry) => (d === 'none' ? null : new Date(Date.now() + Number(d) * 86400_000).toISOString());
/** "בשימוש לפני 3 דקות", "בשימוש ב־21.11", "לא היה בשימוש" */
const usedText = (at: string | null | undefined) => { if (!at) return 'לא היה בשימוש'; const t = ago(at); return `בשימוש ${/^\d/.test(t) ? 'ב־' + t : t}`; };
type Grace = '0' | '24' | '72';
const GRACE: { value: Grace; label: string }[] = [{ value: '24', label: 'יום' }, { value: '72', label: '3 ימים' }, { value: '0', label: 'מיד' }];
const PRESET_OPTIONS = (Object.keys(PRESET_LABELS) as Preset[]).map((value) => ({ value, label: PRESET_LABELS[value] }));
type Grant = { preset: Preset; scopes: string[] | null };
const grantOf = (scopes: string[] | null): Grant => ({ preset: presetOf(scopes), scopes });
const changedScopes = (before: string[] | null, after: string[] | null) => {
  if (!before || !after) return before !== after;
  return before.length !== after.length || before.some((scope) => !after.includes(scope));
};

function Permissions({ grant, onChange }: { grant: Grant; onChange: (g: Grant) => void }) {
  const scopes = grant.scopes ?? SCOPE_ROWS.map((row) => row.scope);
  const update = (scopes: string[]) => onChange({ preset: 'custom', scopes });
  return <>
    <ChoiceGroup label="מה המפתח יכול" options={PRESET_OPTIONS} value={grant.preset} onChange={(preset) => {
      if (preset === 'custom') update(grant.scopes ?? []);
      else onChange({ preset, scopes: preset === 'owner' ? null : [...PRESETS[preset]] });
    }} />
    {grant.preset === 'volunteer' && <p className="c-note">למתנדב שמשתמש באינסטינקט בוחרים אותו בשדה ״פועל בשם״ ויוצרים עבורו מפתח אישי.</p>}
    <details className="c-permissions" open={grant.preset === 'custom' || undefined}>
      <summary>הרשאות לפי תחום</summary>
      <div className="c-areas">
        {AREAS.map((area) => {
          const level = areaLevel(area, scopes);
          return <div key={area.id} className="c-area">
            <span className="c-area__name">{area.he}{level === '' && <small> · בחירה חלקית</small>}</span>
            <Segmented mode="radio" label={area.he} options={LEVELS} value={level} onChange={(value) => { if (value) update(setAreaLevel(area, scopes, value)); }} />
          </div>;
        })}
      </div>
    </details>
    <details className="c-permissions">
      <summary>הרשאות מפורטות לפי תפקיד</summary>
      <table className="c-scope-table">
        <thead><tr><th>הרשאה</th><th>מה היא מאפשרת</th><th>תפקידים</th></tr></thead>
        <tbody>{SCOPE_ROWS.map(({ scope, description, roles }) => (
          <tr key={scope}>
            <td><label><input type="checkbox" checked={scopes.includes(scope)} aria-label={scope}
              onChange={(e) => update(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))} />
              <code dir="ltr">{scope}</code></label></td>
            <td>{description}</td><td>{roles}</td>
          </tr>
        ))}</tbody>
      </table>
    </details>
  </>;
}

export function KeysScreen({ people, notify }: { people: Person[]; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const list = useLoad(() => source.keys());
  const ids = (list.data || []).map((k) => k.id).join(',');
  const used = useLoad(() => (ids ? source.lastUse(ids.split(',')) : Promise.resolve({} as Record<string, string | null>)), [ids]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ title: string; key: string } | null>(null);
  const byUid = useMemo(() => new Map(people.map((p) => [p.uid, p])), [people]);
  const who = (k: KeyView) => {
    const uid = (k.actors[0] || '').replace(/^user:/, '');
    const p = byUid.get(uid);
    return p ? `${p.displayName} · ${ROLE_LABELS[p.role]}` : k.actors[0]?.startsWith('user:') ? 'אדם שלא נמצא' : 'מפתח בדיקות';
  };
  const keys = list.data || [];
  const active = keys.filter((k) => k.status === 'active');
  const inactive = keys.filter((k) => k.status !== 'active');
  const open = keys.find((k) => k.id === openId) || null;
  const row = (k: KeyView) => (
    <Row key={k.id} leading={<IconTile icon="key" tone={k.status === 'active' ? 'pine' : 'ink'} />} title={k.label || k.id}
      tags={<>{k.status !== 'active' && <Tag tone={STATUS[k.status].tone}>{STATUS[k.status].l}</Tag>}{k.rotating && <Tag tone="warm">בהחלפה</Tag>}{k.scopes && <Tag tone="outline">{scopesText(k.scopes)}</Tag>}</>}
      meta={<>{who(k).split(' · ')[0]}{used.data && <> · {usedText(used.data[k.id])}</>}</>}
      chevron onClick={() => setOpenId(k.id)} muted={k.status !== 'active'} />
  );
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מפתחות API</h1>
          <p className="c-sub">כל מפתח פועל בשם מישהו מהצוות (בעלים, מנהל/ת או מתנדב/ת), עם ההרשאות שלו, וכל מה שהוא עושה נרשם ביומן בשם המפתח.</p>
        </div>
        <Button icon="plus" onClick={() => setCreating(true)}>מפתח חדש</Button>
      </div>
      {list.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את המפתחות. {list.error}</Card>}
      {list.loading && !list.data && <Card pad="md" className="c-soft">טוען…</Card>}
      {!!active.length && <Section title={`פעילים · ${active.length}`}><ListCard>{active.map(row)}</ListCard></Section>}
      {!!inactive.length && <Section title={`לא פעילים · ${inactive.length}`}><ListCard>{inactive.map(row)}</ListCard></Section>}
      <p className="c-note">ביטול מפתח נכנס לתוקף בדרך כלל תוך כדקה וחצי.</p>

      <CreateSheet open={creating} onClose={() => setCreating(false)} people={people}
        onCreated={(label, key) => { setCreating(false); setRevealed({ title: `המפתח "${label}" מוכן`, key }); list.reload(); }} notify={notify} />
      {open && (
        <KeySheet k={open} who={who(open)} lastUsed={used.data?.[open.id] ?? null} onClose={() => setOpenId(null)} notify={notify}
          onChanged={(key) => { list.reload(); if (key) { setOpenId(null); setRevealed({ title: `המפתח החדש של "${open.label || open.id}"`, key }); } }} />
      )}
      <RevealSheet shown={revealed} onClose={() => setRevealed(null)} />
    </>
  );
}

function CreateSheet({ open, onClose, people, onCreated, notify }: { open: boolean; onClose: () => void; people: Person[]; onCreated: (label: string, key: string) => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const team = people.filter((p) => p.status === 'active' && ['owner', 'manager', 'staff'].includes(p.role))
    .sort((a, b) => ['owner', 'manager', 'staff'].indexOf(a.role) - ['owner', 'manager', 'staff'].indexOf(b.role) || a.displayName.localeCompare(b.displayName, 'he'));
  const [label, setLabel] = useState('');
  const [uid, setUid] = useState('');
  const [expiry, setExpiry] = useState<Expiry>('none');
  const [grant, setGrant] = useState<Grant>(() => grantOf(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const person = team.find((p) => p.uid === uid);
  const reset = () => { setLabel(''); setUid(''); setExpiry('none'); setGrant(grantOf(null)); setErr(''); };
  const close = () => { reset(); onClose(); };
  const create = async () => {
    if (!label.trim()) return setErr('צריך שם למפתח');
    if (!person) return setErr('בחרו בשם מי המפתח פועל');
    const { scopes } = grant;
    if (scopes && !scopes.length) return setErr('בחרו לפחות הרשאה אחת למפתח');
    setBusy(true); setErr('');
    try {
      const made = await source.createKey({ label: label.trim(), actor: 'user:' + person.uid, expiresAt: inDays(expiry), scopes });
      const name = label.trim();
      reset();
      onCreated(name, made.key);
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={close} title="מפתח חדש">
      <div className="c-form">
        <Field label="שם המפתח" hint="השם שיופיע ביומן, למשל: האינסטינקט של בני" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <ChoiceGroup label="פועל בשם" options={team.map((p) => ({ value: p.uid, label: p.displayName }))} value={uid} onChange={(uid) => {
          setUid(uid);
          if (grant.preset === 'owner' && team.find((p) => p.uid === uid)?.role === 'staff') {
            setGrant({ preset: 'volunteer', scopes: [...PRESETS.volunteer] });
          }
        }} />
        {person && <p className="c-note">המפתח יקבל את ההרשאות של {person.displayName} ({ROLE_LABELS[person.role]}), או חלק מהן. כשהתפקיד משתנה, גם ההרשאות של המפתח משתנות.</p>}
        <Permissions grant={grant} onChange={setGrant} />
        <ChoiceGroup label="תוקף" options={EXPIRY} value={expiry} onChange={setExpiry} />
        {err && <p className="c-err" role="alert">{err}</p>}
        <Button size="lg" block onClick={create} disabled={busy}>{busy ? 'יוצר…' : 'יצירת המפתח'}</Button>
      </div>
    </Sheet>
  );
}

function RevealSheet({ shown, onClose }: { shown: { title: string; key: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(shown!.key); setCopied(true); } catch { setCopied(false); } };
  const close = () => { setCopied(false); onClose(); };
  return (
    // a tap outside does not close it: the key would be gone for good; only "סיימתי" does
    <Sheet open={!!shown} onClose={() => {}} title={shown?.title || ''}>
      {shown && (
        <div className="c-form">
          <p className="c-warn">זו הפעם היחידה שהמפתח מוצג. מעתיקים אותו עכשיו ושומרים בכספת של האינסטינקט, לא בצ'אט ולא במייל.</p>
          <code className="c-key k-ltr" dir="ltr">{shown.key}</code>
          <Button size="lg" variant={copied ? 'secondary' : 'primary'} icon={copied ? 'check' : 'file'} block onClick={copy}>{copied ? 'הועתק' : 'העתקת המפתח'}</Button>
          <Button variant="quiet" block onClick={close}>סיימתי</Button>
        </div>
      )}
    </Sheet>
  );
}

type Mode = 'view' | 'rename' | 'rotate' | 'expire' | 'revoke' | 'scopes';
function KeySheet({ k, who, lastUsed, onClose, onChanged, notify }: { k: KeyView; who: string; lastUsed: string | null; onClose: () => void; onChanged: (newKey?: string) => void; notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const [mode, setMode] = useState<Mode>('view');
  const [label, setLabel] = useState(k.label);
  const [grace, setGrace] = useState<Grace>('24');
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [grant, setGrant] = useState<Grant>(() => grantOf(k.scopes));
  const [busy, setBusy] = useState(false);
  const run = async (action: Parameters<typeof source.changeKey>[1], body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await source.changeKey(k.id, action, body);
      setMode('view');
      if (!r.key) notify(done); // a new key opens its own sheet, which says it
      onChanged(r.key);
    } catch (e) { notify(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const title = mode === 'scopes' ? 'מה המפתח יכול' : mode === 'rename' ? 'שינוי שם' : mode === 'rotate' ? 'החלפת המפתח' : mode === 'expire' ? 'תוקף המפתח' : mode === 'revoke' ? 'לבטל את המפתח?' : (k.label || k.id);
  return (
    <Sheet open onClose={onClose} title={title} aside={mode === 'view' ? <Tag tone={STATUS[k.status].tone}>{STATUS[k.status].l}</Tag> : undefined}>
      {mode === 'view' && (
        <div className="c-form">
          <DetailList>
            <DetailRow term="פועל בשם">{who}</DetailRow>
            <DetailRow term="מה מותר לו">{scopesText(k.scopes)}</DetailRow>
            <DetailRow term="שימוש אחרון">{lastUsed ? ago(lastUsed) : 'עוד לא היה בשימוש'}</DetailRow>
            <DetailRow term="תוקף">{k.expiresAt ? (Date.parse(k.expiresAt) > Date.now() ? `עד ${ddmm(k.expiresAt)}` : `פג ב־${ddmm(k.expiresAt)}`) : 'בלי תאריך'}</DetailRow>
            <DetailRow term="נוצר">{k.createdAt ? `${ddmm(k.createdAt)}${k.createdBy ? ` · ${k.createdBy}` : ''}` : 'הוגדר בשרת לפני הקונסולה'}</DetailRow>
            <DetailRow term="מזהה"><span className="k-ltr" dir="ltr">{k.id}</span></DetailRow>
          </DetailList>
          {k.rotating && k.previousUntil && <p className="c-note">המפתח הקודם ממשיך לעבוד {until(k.previousUntil)}, כדי שהאינסטינקט יספיק לעבור לחדש.</p>}
          <div className="c-grid2">
            <Button variant="neutral" icon="edit" onClick={() => { setLabel(k.label); setMode('rename'); }}>שינוי שם</Button>
            <Button variant="neutral" icon="sliders" onClick={() => { setGrant(grantOf(k.scopes)); setMode('scopes'); }}>מה מותר לו</Button>
            <Button variant="neutral" icon="key" onClick={() => setMode('rotate')}>החלפת המפתח</Button>
            <Button variant="neutral" icon="calendar" onClick={() => setMode('expire')}>תוקף</Button>
            {k.status === 'revoked'
              ? <Button variant="outline" onClick={() => run('restore', {}, 'המפתח הוחזר לעבודה')} disabled={busy}>החזרת המפתח</Button>
              : <Button variant="danger" className="c-danger" icon="blocked" onClick={() => setMode('revoke')}>ביטול המפתח</Button>}
          </div>
        </div>
      )}
      {mode === 'scopes' && (
        <div className="c-form">
          <Permissions grant={grant} onChange={setGrant} />
          <p className="c-note">מפתח לעולם לא מקבל יותר ממה שהתפקיד של {who.split(' · ')[0]} מאפשר. השינוי נכנס לתוקף בדרך כלל תוך כדקה וחצי.</p>
          <Button size="lg" block disabled={busy || grant.scopes?.length === 0 || !changedScopes(k.scopes, grant.scopes)}
            onClick={() => run('scopes', { scopes: grant.scopes }, 'ההרשאות נשמרו')}>{busy ? 'שומר…' : 'שמירה'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'rename' && (
        <div className="c-form">
          <Field label="שם המפתח" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoFocus />
          <Button size="lg" block disabled={busy || !label.trim() || label.trim() === k.label} onClick={() => run('rename', { label: label.trim() }, 'השם נשמר')}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'rotate' && (
        <div className="c-form">
          <p className="c-sub">נוצר מפתח חדש שמוצג פעם אחת. כמה זמן המפתח הנוכחי ימשיך לעבוד?</p>
          <ChoiceGroup options={GRACE} value={grace} onChange={setGrace} />
          {grace === '0' && <p className="c-warn">המפתח הנוכחי יפסיק לעבוד מיד. האינסטינקט ייעצר עד שתעדכנו אצלו את החדש.</p>}
          <Button size="lg" block disabled={busy} onClick={() => run('rotate', { graceHours: Number(grace) }, 'נוצר מפתח חדש')}>{busy ? 'מחליף…' : 'יצירת מפתח חדש'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'expire' && (
        <div className="c-form">
          <p className="c-sub">אחרי התאריך המפתח מפסיק לעבוד מעצמו.</p>
          <ChoiceGroup options={EXPIRY} value={expiry} onChange={setExpiry} />
          <Button size="lg" block disabled={busy} onClick={() => run('expire', { expiresAt: inDays(expiry) }, expiry === 'none' ? 'התאריך הוסר' : 'התוקף נשמר')}>שמירה</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
      {mode === 'revoke' && (
        <div className="c-form">
          <p className="c-sub">"{k.label || k.id}" יפסיק לעבוד תוך דקה וחצי. אפשר להחזיר אותו אחר כך מכאן.</p>
          <Button size="lg" variant="danger" className="c-danger" block disabled={busy} onClick={() => run('revoke', {}, 'המפתח בוטל')}>{busy ? 'מבטל…' : 'כן, לבטל'}</Button>
          <Button variant="quiet" block onClick={() => setMode('view')}>חזרה</Button>
        </div>
      )}
    </Sheet>
  );
}
