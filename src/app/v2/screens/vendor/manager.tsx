// Manager side of vendors: V1 pool (+ new/edit form), V2 vendor card, V6 app access, N8 vendors of an event, V7 vendors on the day.
import { useMemo, useState } from 'react';
import {
  Avatar, BottomBar, Button, ChoiceChip, DetailList, DetailRow, Dot, EmptyState, Field, FormHeader, IconButton, ListCard, PageTitle, Quote, Row,
  SearchField, Sheet, StatRow, StatTile, Tag, TextAreaField, TextLink, Toggle, TopBar,
} from '../../kit';
import { AppScreen, useToast, useExternal, waUrl, telUrl } from '../../core';
import { navigate, back, useParam } from '../../../router';
import { nowMs } from '../../../clock';
import { isConflict } from '../../../db';
import { ddmm, hhmm, ago } from '../../format';
import {
  useVendorDoc, useVendorPool, useEventDoc, useEventVendorList, useEventRequests, useVendorInvites, useVendorInfo, useVendorBundles, useEvents,
  peopleOf, inviteToEvent, remindVendor, inviteMany, savePoolVendor, addPerson, removeAccess, closeRequest, helperText, inviteLink,
  needsText, requestLabel, phaseOf, femName, first, g, andList, NEED_ORDER, type VendorDoc, type EventVendorDoc, type PoolForm, type VendorPerson,
} from '../../data/vendor';
import { NEED_LABELS, type FarmEvent, type VendorNeed } from '../../../types';
import { Sees } from './stall';
import { Quiet } from './parts';
import type { ScreenProps, V2Ctx } from '../../ctx';

const errText = (e: unknown) => (isConflict(e) ? (e as Error).message : `לא נשמר. ${(e as Error).message}`);
const phoneOk = (p: string) => /^0\d{8,9}$/.test(p.replace(/[^\d]/g, ''));
const contactOf = (v: VendorDoc) => v.contact || '';
const fem = (v: VendorDoc) => v.fem ?? (v.contact ? femName(v.contact) : false);
const sellsShort = (v: VendorDoc | EventVendorDoc | null | undefined) => ((v as VendorDoc)?.sells || (v as VendorDoc)?.product || '').split(',')[0].trim();

// ---------- V1 ----------
export function VendorPool({ ctx }: ScreenProps) {
  const isNew = useParam('new') === '1';
  const pool = useVendorPool(true);
  const [q, setQ] = useState('');
  if (isNew) return <PoolEdit ctx={ctx} existing={null} />;
  const s = q.trim();
  const list = pool.items.filter((v) => !s || [v.name, v.contact, v.phone, v.sells, v.product].some((x) => (x || '').includes(s)));
  const meta = (v: VendorDoc) => {
    if (v.external === false) return v.sells || v.product || '';
    const n = (v.events || []).length; const f = fem(v);
    const took = n === 0 ? g(f, 'עוד לא השתתף', 'עוד לא השתתפה') : n === 1 ? g(f, 'היה באירוע אחד', 'היתה באירוע אחד') : `${g(f, 'היה', 'היתה')} ב־${n} אירועים`;
    return [contactOf(v), took].filter(Boolean).join(' · ');
  };
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar back={{ label: 'אירועים', onClick: () => navigate('/manage/events') }} end={<Button icon="plus" iconSize={18} onClick={() => navigate('/manage/vendors?new=1')}>חדש</Button>} />
      <PageTitle>בעלי דוכנים · {pool.items.length}</PageTitle>
      <SearchField label="שם, טלפון או מה מוכרים" value={q} onChange={(e) => setQ(e.target.value)} />
      {pool.loading ? <Quiet text="טוען..." /> : !list.length ? (
        <EmptyState variant="card" icon="stall" title={s ? 'לא מצאנו' : 'עוד אין בעלי דוכנים'} text={s ? 'נסו שם אחר או מספר טלפון.' : 'מוסיפים בכפתור "חדש", ואז מזמינים לאירוע.'} />
      ) : (
        <ListCard>
          {list.map((v) => (
            <Row key={v.id} minHeight={56} title={v.name} tags={v.external === false ? <Tag tone="warm">של החווה</Tag> : <Tag>חיצוני</Tag>} meta={meta(v)} onClick={() => navigate(`/manage/vendors/${v.id}`)} />
          ))}
        </ListCard>
      )}
    </AppScreen>
  );
}

/** New vendor (V1 "חדש") and edit (V2 "עריכה"). Not in the designs: built from N11's form pattern. */
function PoolEdit({ ctx, existing }: { ctx: V2Ctx; existing: VendorDoc | null }) {
  const toast = useToast();
  const [f, setF] = useState<PoolForm>({
    name: existing?.name || '', contact: existing?.contact || '', phone: existing?.phone || '', sells: existing?.sells || existing?.product || '',
    needs: existing?.needs || [], notes: existing?.notes || '', external: existing?.external !== false, fem: !!existing?.fem,
  });
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const toggle = (n: VendorNeed) => setF((s) => ({ ...s, needs: s.needs.includes(n) ? s.needs.filter((x) => x !== n) : [...s.needs, n] }));
  const cancel = () => (existing ? navigate(`/manage/vendors/${existing.id}`, true) : navigate('/manage/vendors', true));
  const save = async () => {
    const e: typeof errs = {};
    if (!f.name.trim()) e.name = 'צריך שם לדוכן';
    if (f.phone.trim() && !phoneOk(f.phone)) e.phone = 'מספר טלפון לא תקין';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { const id = await savePoolVendor(ctx, f, existing); toast.show({ text: existing ? 'נשמר' : `${f.name.trim()} נוסף למאגר`, check: true }); navigate(`/manage/vendors/${id}`, true); }
    catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar><Button size="bar" grow onClick={save} disabled={busy}>{existing ? 'שמירה' : 'הוספה למאגר'}</Button></BottomBar>}>
      <FormHeader title={existing ? 'עריכת בעל דוכן' : 'בעל דוכן חדש'} onCancel={cancel} />
      <Field label="שם הדוכן" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} error={errs.name} maxLength={80} />
      <Field label="איש קשר" value={f.contact} onChange={(x) => setF({ ...f, contact: x.target.value, fem: existing ? f.fem : femName(x.target.value) })} maxLength={80} />
      <div className="k-group">
        <span className="k-group__label" id="vendor-fem">פונים</span>
        <div className="k-chips k-chips--wrap" role="group" aria-labelledby="vendor-fem">
          <ChoiceChip selected={!f.fem} onClick={() => setF({ ...f, fem: false })}>אליו</ChoiceChip>
          <ChoiceChip selected={f.fem} onClick={() => setF({ ...f, fem: true })}>אליה</ChoiceChip>
        </div>
      </div>
      <Field label="טלפון" ltr inputMode="tel" value={f.phone} onChange={(x) => setF({ ...f, phone: x.target.value })} error={errs.phone} maxLength={20} />
      <Field label="מה מוכר" value={f.sells} onChange={(x) => setF({ ...f, sells: x.target.value })} maxLength={120} />
      <div className="k-group">
        <span className="k-group__label" id="vendor-pool-needs">צריך</span>
        <div className="k-chips k-chips--wrap" role="group" aria-labelledby="vendor-pool-needs">
          {NEED_ORDER.map((n) => <ChoiceChip key={n} selected={f.needs.includes(n)} onClick={() => toggle(n)}>{NEED_LABELS[n]}</ChoiceChip>)}
        </div>
      </div>
      <div className="vendor-togglecard">
        <div className="vendor-togglecard__body"><span className="vendor-togglecard__title">דוכן חיצוני</span><span className="vendor-togglecard__meta">כבוי: דוכן של החווה</span></div>
        <Toggle checked={f.external} onChange={(external) => setF({ ...f, external })} label="דוכן חיצוני" />
      </div>
      <TextAreaField label="הערות לצוות" placeholder="מה חשוב לדעת עליו" value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} maxLength={1000} />
    </AppScreen>
  );
}

// ---------- V2 ----------
export function VendorCard({ ctx, params }: ScreenProps) {
  const v = useVendorDoc(params.id || '');
  const edit = useParam('edit') === '1';
  if (v.loading) return <AppScreen variant="detail" gap={12} noNav><TopBar back={{ label: 'בעלי דוכנים', onClick: () => navigate('/manage/vendors') }} /><Quiet text="טוען..." /></AppScreen>;
  if (!v.item) return <AppScreen variant="detail" gap={12} noNav><TopBar back={{ label: 'בעלי דוכנים', onClick: () => navigate('/manage/vendors') }} /><EmptyState variant="card" icon="stall" title="בעל הדוכן לא נמצא" text="אולי הוא נמחק מהמאגר." /></AppScreen>;
  return edit ? <PoolEdit ctx={ctx} existing={v.item} /> : <Card ctx={ctx} v={v.item} />;
}
function Card({ ctx, v }: { ctx: V2Ctx; v: VendorDoc }) {
  const open = useExternal(); const toast = useToast();
  const b = useVendorBundles(v.id, v.events);
  const all = useEvents(true);
  const [pick, setPick] = useState(false);
  const f = fem(v);
  const items = [...b.items].reverse();
  const upcoming = all.items.filter((e) => e.stall !== false && !(e as { closed?: unknown }).closed && new Date(e.end || e.start).getTime() > nowMs()).sort((a, c) => a.start.localeCompare(c.start));
  const meta = (x: { event: FarmEvent; record: EventVendorDoc | null; phase: string }) => {
    const r = x.record;
    if (!r) return '';
    if (x.phase === 'past') return r.status === 'confirmed' ? g(f, 'השתתף', 'השתתפה') : r.status === 'declined' ? g(f, 'לא הגיע', 'לא הגיעה') : g(f, 'לא ענה', 'לא ענתה');
    return r.invitedAt ? `${g(f, 'הוזמן', 'הוזמנה')} ב־${ddmm(r.invitedAt)}` : '';
  };
  const tag = (x: { record: EventVendorDoc | null; phase: string }) => {
    if (x.phase === 'past' || !x.record) return undefined;
    if (x.record.status === 'confirmed') return <Tag tone="paid">{g(f, 'אישר', 'אישרה')}</Tag>;
    if (x.record.status === 'declined') return <Tag>{g(f, 'לא מגיע', 'לא מגיעה')}</Tag>;
    return <Tag tone="waiting">{g(f, 'לא ענה', 'לא ענתה')}</Tag>;
  };
  const invite = async (e: FarmEvent) => {
    try {
      const existing = b.items.find((x) => x.id === e.id)?.record || null;
      const r = await inviteToEvent(ctx, v, e, null, existing);
      setPick(false);
      if (v.phone) open(waUrl(v.phone, r.text));
      toast.show({ text: `${v.name} ${g(f, 'הוזמן', 'הוזמנה')} ל${e.title}`, check: true });
    } catch (x) { toast.refused(errText(x)); }
  };
  return (
    <AppScreen variant="detail" gap={12} bar={<BottomBar><Button size="bar" grow icon="message" onClick={() => setPick(true)}>הזמנה לאירוע</Button></BottomBar>}>
      <TopBar back={{ label: 'בעלי דוכנים', onClick: () => back('/manage/vendors') }} end={<Button variant="outline" icon="edit" iconSize={16} onClick={() => navigate(`/manage/vendors/${v.id}?edit=1`)}>עריכה</Button>} />
      <div className="vendor-titlerow"><PageTitle size="detail">{v.name}</PageTitle>{v.external === false ? <Tag tone="warm">של החווה</Tag> : <Tag>חיצוני</Tag>}</div>
      {v.phone && (
        <div className="vendor-actions">
          <Button size="tall" icon="message" iconSize={18} onClick={() => open(waUrl(v.phone))}>וואטסאפ</Button>
          <Button variant="outline" size="tall" icon="phone" iconSize={18} onClick={() => open(telUrl(v.phone))}>התקשרות</Button>
        </div>
      )}
      <DetailList>
        {v.contact && <DetailRow term="איש קשר" action={v.external !== false ? <TextLink onClick={() => navigate(`/manage/vendors/${v.id}/access`)}>גישה</TextLink> : undefined}>{v.contact}</DetailRow>}
        {v.phone && <DetailRow term="טלפון"><span dir="ltr">{v.phone}</span></DetailRow>}
        {(v.sells || v.product) && <DetailRow term="מוכר">{v.sells || v.product}</DetailRow>}
        {!!v.needs?.length && <DetailRow term="צריך">{needsText(v.needs, 'and')}</DetailRow>}
      </DetailList>
      {(v.notes || v.note) && <Quote>{v.notes || v.note}</Quote>}
      {items.length > 0 && (
        <ListCard title="באירועים שלנו">
          {items.map((x) => <Row key={x.id} title={`${x.event.title} · ${ddmm(x.event.start)}`} tags={tag(x)} meta={meta(x)} onClick={() => navigate(`/manage/events/${x.id}/vendors`)} />)}
        </ListCard>
      )}
      <Sheet open={pick} onClose={() => setPick(false)} title="הזמנה לאירוע" aside={v.phone ? 'נפתח בוואטסאפ' : 'אין טלפון'}>
        {upcoming.length ? (
          <ul className="k-card k-card--list k-list k-list--flush" style={{ margin: 0, padding: 0 }}>
            {upcoming.map((e) => {
              const r = b.items.find((x) => x.id === e.id)?.record;
              return <Row key={e.id} title={`${e.title} · ${ddmm(e.start)}`} tags={r ? <Tag tone={r.status === 'confirmed' ? 'paid' : 'waiting'}>{r.status === 'confirmed' ? g(f, 'אישר', 'אישרה') : 'הוזמן'}</Tag> : undefined}
                meta={r ? 'לשלוח שוב את ההזמנה' : e.published === false ? 'עוד לא פורסם' : undefined} onClick={() => invite(e)} />;
            })}
          </ul>
        ) : <span className="vendor-note">אין אירוע קרוב עם דוכנים. יוצרים אירוע במסך האירועים.</span>}
      </Sheet>
    </AppScreen>
  );
}

// ---------- V6 ----------
const SEE6: [boolean, string][] = [
  [true, 'האירוע שהוזמנו אליו, השעות והמקום'], [true, 'הודעות לבעלי הדוכנים'], [true, 'הסיכום שלהם אחרי האירוע'],
  [false, 'משימות, קניות והצוות'], [false, 'נרשמים, תשלומים ודוחות'],
];
export function VendorAccess({ ctx, params }: ScreenProps) {
  const v = useVendorDoc(params.id || '');
  const invites = useVendorInvites(params.id || '', true);
  const open = useExternal(); const toast = useToast();
  const [add, setAdd] = useState(false); const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role: 'helper' as 'owner' | 'helper' });
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  if (v.loading) return <AppScreen variant="detail" gap={12}><Quiet text="טוען..." /></AppScreen>;
  if (!v.item) return <AppScreen variant="detail" gap={12}><TopBar back={{ label: 'בעלי דוכנים', onClick: () => navigate('/manage/vendors') }} /><EmptyState variant="card" icon="stall" title="בעל הדוכן לא נמצא" /></AppScreen>;
  const vd = v.item;
  const people = peopleOf(vd, invites.items);
  const byName = (uid?: string) => (uid ? ctx.peopleByUid.get(uid)?.displayName || people.find((p) => p.uid === uid)?.name || (uid === ctx.user.uid ? ctx.actor.name : '') : '');
  const metaOf = (p: VendorPerson & { uid?: string }) => {
    const pf = p.fem ?? femName(p.name);
    const role = p.role === 'owner' ? g(pf, 'בעל הדוכן', 'בעלת הדוכן') : g(pf, 'עוזר', 'עוזרת');
    if (p.entered) {
      const seen = p.lastSeenAt || (p.uid ? (ctx.peopleByUid.get(p.uid) as { updatedAt?: string } | undefined)?.updatedAt : '');
      return seen ? `${role} · לאחרונה ${ago(seen).replace('לפני ', 'לפני ')}` : role;
    }
    const adder = byName(p.addedBy);
    return adder && p.addedAt ? `${role} · ${first(adder)} ${g(femName(adder), 'צירף', 'צירפה')} ב־${ddmm(p.addedAt)}` : role;
  };
  const resend = (p: VendorPerson) => {
    if (!p.phone || !p.code) { toast.show({ text: 'אין קישור לשלוח. אפשר לקשר מחדש' }); return; }
    open(waUrl(p.phone, helperText(vd, p.name, inviteLink('', p.code), p.role)));
  };
  const link = async () => {
    const e: typeof errs = {};
    if (form.name.trim().length < 2) e.name = 'כתבו את השם';
    if (!phoneOk(form.phone)) e.phone = 'צריך מספר נייד';
    setErrs(e); if (Object.keys(e).length) return;
    try {
      const r = await addPerson(ctx, vd, { ...form, fem: femName(form.name) });
      open(waUrl(form.phone, r.text)); setAdd(false); setForm({ name: '', phone: '', role: 'helper' });
      toast.show({ text: `${first(form.name)} ${g(femName(form.name), 'קושר', 'קושרה')} לדוכן`, check: true });
    } catch (x) { toast.refused(errText(x)); }
  };
  const revoke = async () => {
    try { await removeAccess(ctx, vd, invites.items, ctx.peopleByUid); setConfirm(false); toast.show({ text: 'הגישה הוסרה. הקישורים כבר לא עובדים', check: true }); }
    catch (x) { toast.refused(errText(x)); }
  };
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar back={{ label: vd.name, onClick: () => back(`/manage/vendors/${vd.id}`) }} />
      <PageTitle>גישה לאפליקציה</PageTitle>
      {people.length ? (
        <ListCard title="מי מקושר לדוכן" count={people.length}>
          {people.map((p, i) => {
            const pf = p.fem ?? femName(p.name);
            return <Row key={p.code || i} minHeight={58} leading={<Avatar name={p.name} />} title={p.name}
              tags={p.entered ? <Tag tone="paid">{g(pf, 'נכנס', 'נכנסה')}</Tag> : <Tag tone="waiting">{g(pf, 'עוד לא נכנס', 'עוד לא נכנסה')}</Tag>}
              meta={metaOf(p)} onClick={p.entered && p.uid ? () => navigate(`/manage/people/${p.uid}`) : undefined}
              actions={!p.entered ? <Button variant="outline" icon="message" iconSize={16} onClick={() => resend(p)}>שוב</Button> : undefined} />;
          })}
        </ListCard>
      ) : <EmptyState variant="card" icon="people" title="אף אחד עוד לא מקושר" text="מקשרים את בעל הדוכן, והוא מצרף בעצמו את העוזרים." />}
      <Button variant="dashed" size="tall" block icon="plus" iconSize={18} onClick={() => setAdd(true)}>לקשר עוד מישהו לדוכן</Button>
      <Sees title="מה הם רואים" rows={SEE6} />
      <span className="vendor-note">בעל הדוכן מעדכן בעצמו מה הוא מוכר ומה הוא צריך, וזה מתעדכן אצלך.</span>
      {people.length > 0 && (
        <div>
          {!confirm ? <Button variant="quiet" onClick={() => setConfirm(true)}>הסרת הגישה</Button>
            : <Button variant="danger" onClick={revoke}>כן, להסיר את הגישה של כולם</Button>}
        </div>
      )}
      <Sheet open={add} onClose={() => setAdd(false)} title="לקשר לדוכן">
        <div className="vendor-sheet">
          <Field label="שם" placeholder="שם פרטי ומשפחה" value={form.name} onChange={(x) => setForm({ ...form, name: x.target.value })} error={errs.name} maxLength={80} />
          <Field label="טלפון" placeholder="05" ltr inputMode="tel" value={form.phone} onChange={(x) => setForm({ ...form, phone: x.target.value })} error={errs.phone} maxLength={20} />
          <div className="k-chips k-chips--wrap" role="group" aria-label="תפקיד">
            <ChoiceChip selected={form.role === 'helper'} onClick={() => setForm({ ...form, role: 'helper' })}>עוזר בדוכן</ChoiceChip>
            <ChoiceChip selected={form.role === 'owner'} onClick={() => setForm({ ...form, role: 'owner' })}>בעל הדוכן</ChoiceChip>
          </div>
          <Button size="lg" block icon="message" onClick={link}>שליחת קישור בוואטסאפ</Button>
        </div>
      </Sheet>
    </AppScreen>
  );
}

// ---------- N8 ----------
export function EventVendors({ ctx, params }: ScreenProps) {
  const eid = params.id || '';
  const e = useEventDoc(eid); const recs = useEventVendorList(eid); const pool = useVendorPool(true); const info = useVendorInfo(eid);
  const all = useEvents(true);
  const open = useExternal(); const toast = useToast();
  const [pick, setPick] = useState(false); const [busy, setBusy] = useState(false);
  const prev = useMemo(() => {
    const ev = e.item; if (!ev) return null;
    return all.items.filter((x) => x.id !== ev.id && x.stall !== false && phaseOf(x) === 'past' && x.start < ev.start).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
  }, [all.items, e.item]);
  const prevRecs = useEventVendorList(prev?.id || '');
  if (e.loading || recs.loading) return <AppScreen variant="detail" gap={12}><Quiet text="טוען..." /></AppScreen>;
  if (!e.item) return <AppScreen variant="detail" gap={12}><TopBar back={{ label: 'אירועים', onClick: () => navigate('/manage/events') }} /><EmptyState variant="card" icon="calendar" title="האירוע לא נמצא" /></AppScreen>;
  const ev = e.item;
  const byId = new Map(pool.items.map((v) => [v.id, v]));
  const list = [...recs.items].sort((a, b) => rank(a) - rank(b) || (a.spot ?? 99) - (b.spot ?? 99));
  const confirmed = recs.items.filter((r) => r.status === 'confirmed').length;
  const waiting = recs.items.filter((r) => (r.status || 'invited') === 'invited').length;
  const invitedIds = new Set(recs.items.map((r) => r.vendorId || r.id));
  const rest = pool.items.filter((v) => !invitedIds.has(v.id));
  const fromPrev = prevRecs.items.filter((r) => r.status === 'confirmed' && !invitedIds.has(r.vendorId || r.id)).map((r) => byId.get(r.vendorId || r.id)).filter(Boolean) as VendorDoc[];
  const invite = async (v: VendorDoc) => {
    try { const r = await inviteToEvent(ctx, v, ev, info.item, null); if (v.phone) open(waUrl(v.phone, r.text)); toast.show({ text: `${v.name} ${g(fem(v), 'הוזמן', 'הוזמנה')}`, check: true }); }
    catch (x) { toast.refused(errText(x)); }
  };
  const inviteAll = async () => {
    setBusy(true);
    try { const n = await inviteMany(ctx, fromPrev, ev, info.item); toast.show({ text: n === 1 ? 'הוזמן בעל דוכן אחד. שולחים לו בוואטסאפ מהרשימה' : `הוזמנו ${n} בעלי דוכנים. שולחים להם בוואטסאפ מהרשימה`, check: true }); }
    catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  const remind = async (v: VendorDoc) => {
    try { const text = await remindVendor(ctx, v, ev); if (v.phone) open(waUrl(v.phone, text)); }
    catch (x) { toast.refused(errText(x)); }
  };
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar back={{ label: ev.title, onClick: () => back(`/manage/events/${eid}`) }} />
      <PageTitle>בעלי דוכנים</PageTitle>
      <StatRow>
        <StatTile value={recs.items.length} label="הוזמנו" />
        <StatTile value={confirmed} label="אישרו" />
        <StatTile value={waiting} label="לא ענו" />
      </StatRow>
      {list.length > 0 ? (
        <ListCard>
          {list.map((r) => {
            const v = byId.get(r.vendorId || r.id); const f = v ? fem(v) : false;
            const st = r.status || (r.confirmed ? 'confirmed' : 'invited');
            const who = v?.contact || '';
            const phone = v?.phone || '';
            return <Row key={r.id} minHeight={58} title={r.name || v?.name}
              tags={st === 'confirmed' ? <Tag tone="paid">{g(f, 'אישר', 'אישרה')}</Tag> : st === 'declined' ? <Tag>{g(f, 'לא מגיע', 'לא מגיעה')}</Tag> : <Tag tone="waiting">לא ענו</Tag>}
              meta={[who, sellsShort(r) || sellsShort(v)].filter(Boolean).join(' · ')}
              onClick={() => navigate(`/manage/vendors/${r.vendorId || r.id}`)} chevron={false}
              actions={!phone || !v ? undefined : st === 'invited'
                ? <Button variant="outline" icon="message" iconSize={16} onClick={() => remind(v)}>תזכורת</Button>
                : <IconButton icon="message" variant="outline" label={`וואטסאפ ל${first(who || v.name)}`} onClick={() => open(waUrl(phone))} />} />;
          })}
        </ListCard>
      ) : <EmptyState variant="card" icon="stall" title="עוד לא הזמנו דוכנים" text="מזמינים מהמאגר, וכל אחד מקבל קישור בוואטסאפ." />}
      <Button variant="dashed" size="tall" block icon="plus" iconSize={18} onClick={() => setPick(true)} disabled={!rest.length}>{rest.length ? `הזמנה מהמאגר · עוד ${rest.length}` : 'כל המאגר הוזמן'}</Button>
      {prev && fromPrev.length > 0 && <Button variant="dashed" size="tall" block onClick={inviteAll} disabled={busy}>{`להזמין את מי שהיה ב${prev.title}`}</Button>}
      <Sheet open={pick} onClose={() => setPick(false)} title="הזמנה מהמאגר" aside={`${rest.length} לא הוזמנו`}>
        <ul className="k-card k-card--list k-list k-list--flush" style={{ margin: 0, padding: 0 }}>
          {rest.map((v) => <Row key={v.id} title={v.name} meta={[v.contact, sellsShort(v)].filter(Boolean).join(' · ')} onClick={() => invite(v)} />)}
        </ul>
        <Button variant="secondary" size="lg" block onClick={() => setPick(false)}>סגירה</Button>
      </Sheet>
    </AppScreen>
  );
}
const rank = (r: EventVendorDoc) => (r.status === 'confirmed' ? 0 : (r.status || 'invited') === 'invited' ? 1 : 2);

// ---------- V7 ----------
export function VendorsToday({ ctx, params }: ScreenProps) {
  const eid = params.id || '';
  const e = useEventDoc(eid); const recs = useEventVendorList(eid); const pool = useVendorPool(true); const reqs = useEventRequests(eid);
  const open = useExternal(); const toast = useToast();
  if (e.loading || recs.loading) return <AppScreen variant="detail" gap={12}><Quiet text="טוען..." /></AppScreen>;
  if (!e.item) return <AppScreen variant="detail" gap={12}><TopBar back={{ label: 'אירועים', onClick: () => navigate('/manage/events') }} /><EmptyState variant="card" icon="calendar" title="האירוע לא נמצא" /></AppScreen>;
  const byId = new Map(pool.items.map((v) => [v.id, v]));
  const coming = recs.items.filter((r) => r.status === 'confirmed');
  const arrived = coming.filter((r) => r.arrivedAt);
  const openReqs = reqs.items.filter((r) => !r.closedAt);
  const sortedList = [...coming.filter((r) => r.arrivedAt), ...coming.filter((r) => !r.arrivedAt)];
  const names = (v: VendorDoc | undefined) => {
    const ppl = (v?.people || []).map((p) => first(p.name));
    return andList(ppl.length ? ppl : v?.contact ? [first(v.contact)] : []);
  };
  const done = async (rid: string, by?: string) => {
    try { await closeRequest(ctx, eid, rid, by); toast.show({ text: 'סומן שטופל', check: true }); }
    catch (x) { toast.refused(errText(x)); }
  };
  return (
    <AppScreen variant="detail" gap={12}>
      <TopBar back={{ label: 'האירוע חי', onClick: () => back(`/manage/events/${eid}/live`) }}
        end={<Button icon="megaphone" iconSize={18} onClick={() => navigate(`/manage/broadcasts/new?audience=vendors&event=${eid}`)}>הודעה</Button>} />
      <PageTitle>הדוכנים היום</PageTitle>
      <StatRow>
        <StatTile value={coming.length} label="אישרו" />
        <StatTile value={arrived.length} label="הגיעו" />
        <StatTile value={openReqs.length} label={openReqs.length === 1 ? 'בקשה פתוחה' : 'בקשות פתוחות'} />
      </StatRow>
      {openReqs.length > 0 && (
        <ListCard title="ביקשו משהו" count={openReqs.length}>
          {openReqs.map((r) => (
            <Row key={r.id} minHeight={60} leading={<Dot />} title={r.vendorName}
              meta={[requestLabel(r), hhmm(r.createdAt), r.takenBy ? `${first(r.takenBy.name)} ${g(femName(r.takenBy.name), 'לקח', 'לקחה')}` : 'עוד לא נלקח'].join(' · ')}
              actions={<Button onClick={() => done(r.id, r.by?.uid)}>טופל</Button>} />
          ))}
        </ListCard>
      )}
      {sortedList.length > 0 ? (
        <ListCard>
          {sortedList.map((r) => {
            const v = byId.get(r.vendorId || r.id); const f = v ? fem(v) : false;
            const meta = [r.spot ? `דוכן ${r.spot}` : 'בלי מספר דוכן', names(v)].filter(Boolean).join(' · ');
            if (r.arrivedAt) return <Row key={r.id} minHeight={56} title={r.name} tags={<Tag tone="paid">{`${g(f, 'הגיע', 'הגיעה')} ${hhmm(r.arrivedAt)}`}</Tag>} meta={meta} onClick={() => navigate(`/manage/vendors/${r.vendorId || r.id}`)} />;
            const who = first(v?.contact || r.name);
            return <Row key={r.id} minHeight={56} title={r.name} tags={<Tag tone="waiting">{g(f, 'עוד לא הגיע', 'עוד לא הגיעה')}</Tag>} meta={meta}
              actions={v?.phone ? <IconButton icon="message" variant="outline" label={`וואטסאפ ל${who}`} onClick={() => open(waUrl(v.phone))} /> : undefined} />;
          })}
        </ListCard>
      ) : <EmptyState variant="card" icon="stall" title="אין דוכנים שאישרו" text="מזמינים בעלי דוכנים ממסך האירוע." />}
    </AppScreen>
  );
}
