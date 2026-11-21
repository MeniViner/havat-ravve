// D7 the stall (with its edit mode, ?edit=1) and D8 adding a helper.
import { useEffect, useRef, useState } from 'react';
import {
  Avatar, BottomBar, Button, Card, ChoiceChip, DetailList, DetailRow, EmptyState, Field, FormHeader, Icon, ListCard, Row, Sheet, TextAreaField,
} from '../../kit';
import { AppScreen, useToast, useExternal, waUrl } from '../../core';
import { navigate, back, useParam } from '../../../router';
import { isConflict } from '../../../db';
import { compressPhoto } from '../../../store';
import { ddmm } from '../../format';
import {
  useVendorDoc, useVendorInvites, peopleOf, saveStall, addPerson, removePerson, needsText, inviteLink, helperText, femName, g, first,
  NEED_ORDER, type StallForm, type VendorDoc, type VendorPerson,
} from '../../data/vendor';
import { NEED_LABELS, type VendorNeed } from '../../../types';
import { VendorHead, Quiet } from './parts';
import type { ScreenProps, V2Ctx } from '../../ctx';

const errText = (e: unknown) => (isConflict(e) ? undefined : `לא נשמר. ${(e as Error).message}`);
const phoneOk = (p: string) => /^0\d{8,9}$/.test(p.replace(/[^\d]/g, ''));

export function VendorStall({ ctx }: ScreenProps) {
  const v = useVendorDoc(ctx.vendorId);
  const edit = useParam('edit') === '1' && !ctx.helper;
  if (v.loading) return <AppScreen variant="root" gap={10}><VendorHead title="הדוכן שלי" /><Quiet text="טוען את הדוכן..." /></AppScreen>;
  if (!v.item) return <AppScreen variant="root" gap={10}><VendorHead title="הדוכן שלי" /><EmptyState variant="card" icon="stall" title="החשבון עוד לא מקושר לדוכן" text="בקשו מהחווה קישור חדש בוואטסאפ." /></AppScreen>;
  return edit ? <StallEdit v={v.item} /> : <Stall ctx={ctx} v={v.item} />;
}

function Stall({ ctx, v }: { ctx: V2Ctx; v: VendorDoc }) {
  const invites = useVendorInvites(v.id, !ctx.helper);
  const toast = useToast(); const open = useExternal();
  const people = peopleOf(v, invites.items);
  const [sel, setSel] = useState<(VendorPerson & { uid?: string }) | null>(null);
  const [confirm, setConfirm] = useState(false);
  const owner = people.find((p) => p.role === 'owner');
  const n = (v.events || []).length;
  const helperMeta = (p: VendorPerson) => `${g(p.fem ?? femName(p.name), 'עוזר', 'עוזרת')} · ${p.entered ? g(p.fem ?? femName(p.name), 'נכנס לאפליקציה', 'נכנסה לאפליקציה') : g(p.fem ?? femName(p.name), 'עוד לא נכנס', 'עוד לא נכנסה')}`;
  const ownerMeta = (p: VendorPerson) => `${g(p.fem ?? v.fem, 'בעל הדוכן', 'בעלת הדוכן')}${p.uid === ctx.user.uid ? ` · ${g(p.fem ?? v.fem, 'אתה', 'את')}` : ''}`;
  const resend = (p: VendorPerson) => {
    if (!p.phone || !p.code) { toast.show({ text: 'אין קישור לשלוח. אפשר להסיר ולצרף מחדש' }); return; }
    open(waUrl(p.phone, helperText(v, p.name, inviteLink('', p.code))));
  };
  const remove = async (p: VendorPerson) => {
    try { await removePerson(v, p); toast.show({ text: `${first(p.name)} הוסר מהדוכן`, check: true }); setSel(null); setConfirm(false); }
    catch (e) { toast.refused(errText(e)); }
  };
  return (
    <AppScreen variant="root" gap={10}>
      <VendorHead overline={owner?.name || v.contact} title="הדוכן שלי" />
      <Card pad="md" as="section" className="vendor-stall">
        <span className="vendor-stall__photo">{v.photo ? <img src={v.photo} alt="" /> : <Icon name="stall" size={32} />}</span>
        <div className="vendor-stall__body">
          <b className="vendor-stall__name">{v.name}</b>
          <span className="vendor-stall__meta">{n === 0 ? 'עוד לא היה אירוע בחווה' : n === 1 ? 'אירוע אחד בחווה' : `${n} אירועים בחווה`}</span>
        </div>
        {!ctx.helper && <Button variant="outline" icon="edit" iconSize={16} onClick={() => navigate('/vendor/stall?edit=1')}>עריכה</Button>}
      </Card>
      <DetailList className="vendor-dl50">
        <DetailRow term="מוכרים">{v.sells || v.product || '—'}</DetailRow>
        {v.phone && <DetailRow term="טלפון"><span dir="ltr">{v.phone}</span></DetailRow>}
        <DetailRow term="צריך">{needsText(v.needs) || 'שום דבר מיוחד'}</DetailRow>
        {v.note && <DetailRow term="הערה" plain>{v.note}</DetailRow>}
      </DetailList>
      <ListCard title="מי עובד בדוכן" count={people.length}>
        {people.map((p, i) => p.role === 'owner'
          ? <Row key={p.code || i} minHeight={56} leading={<Avatar name={p.name} tone={p.uid === ctx.user.uid ? 'me' : 'default'} />} title={p.name} meta={ownerMeta(p)} />
          : <Row key={p.code || i} minHeight={56} leading={<Avatar name={p.name} tone={p.uid === ctx.user.uid ? 'me' : 'default'} />} title={p.name} meta={helperMeta(p)}
              onClick={ctx.helper ? undefined : () => setSel(p)} chevron={!ctx.helper} />)}
      </ListCard>
      {!ctx.helper && <>
        <Button variant="dashed" size="tall" block icon="plus" iconSize={18} onClick={() => navigate('/vendor/stall/helpers/new')}>לצרף עוזר</Button>
        <span className="vendor-note">מה שכתוב כאן מופיע אצל החווה, ונשמר להזמנות הבאות.</span>
      </>}
      {ctx.helper && <span className="vendor-note">את פרטי הדוכן מעדכן {owner ? first(owner.name) : 'בעל הדוכן'}.</span>}
      <Sheet open={!!sel} onClose={() => { setSel(null); setConfirm(false); }} title={sel?.name || ''} aside={sel ? (sel.entered ? g(sel.fem ?? femName(sel.name), 'נכנס', 'נכנסה') : g(sel.fem ?? femName(sel.name), 'עוד לא נכנס', 'עוד לא נכנסה')) : undefined}>
        {sel && <div className="vendor-sheet">
          <span className="vendor-note">{sel.phone ? <span dir="ltr">{sel.phone}</span> : null}{sel.addedAt ? ` · צורף ב־${ddmm(sel.addedAt)}` : ''}</span>
          <div className="vendor-sheet__actions">
            {!sel.entered && <Button size="lg" block icon="message" onClick={() => resend(sel)}>שליחת הקישור שוב</Button>}
            {!confirm
              ? <Button variant="secondary" size="lg" block onClick={() => setConfirm(true)}>הסרה מהדוכן</Button>
              : <Button variant="danger" size="lg" block onClick={() => remove(sel)}>{`כן, להסיר את ${first(sel.name)}`}</Button>}
          </div>
        </div>}
      </Sheet>
    </AppScreen>
  );
}

function StallEdit({ v }: { v: VendorDoc }) {
  const toast = useToast();
  const [f, setF] = useState<StallForm>({ name: v.name || '', sells: v.sells || v.product || '', phone: v.phone || '', needs: v.needs || [], note: v.note || '' });
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const toggle = (n: VendorNeed) => setF((s) => ({ ...s, needs: s.needs.includes(n) ? s.needs.filter((x) => x !== n) : [...s.needs, n] }));
  const pick = async (fl: File | undefined) => {
    if (!fl) return;
    try { setPhoto(await compressPhoto(fl, 640, 200_000)); } catch { toast.show({ text: 'התמונה לא נטענה. נסו תמונה אחרת' }); }
  };
  const save = async () => {
    const e: typeof errs = {};
    if (!f.name.trim()) e.name = 'צריך שם לדוכן';
    if (f.phone.trim() && !phoneOk(f.phone)) e.phone = 'מספר טלפון לא תקין';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { await saveStall(v.id, { ...f, ...(photo !== undefined ? { photo } : {}) }); toast.show({ text: 'הדוכן עודכן. החווה רואה את השינוי', check: true }); navigate('/vendor/stall', true); }
    catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  const shown = photo ?? v.photo;
  return (
    <AppScreen variant="form" gap={14} bar={<BottomBar><Button size="bar" grow onClick={save} disabled={busy}>שמירה</Button></BottomBar>}>
      <FormHeader title="עריכת הדוכן" onCancel={() => navigate('/vendor/stall', true)} />
      <div className="vendor-stall">
        <span className="vendor-stall__photo">{shown ? <img src={shown} alt="" /> : <Icon name="stall" size={32} />}</span>
        <Button variant="neutral" icon="camera" onClick={() => file.current?.click()}>{shown ? 'החלפת תמונה' : 'תמונה של הדוכן'}</Button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(x) => pick(x.target.files?.[0])} />
      </div>
      <Field label="שם הדוכן" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} error={errs.name} maxLength={80} />
      <Field label="מה מוכרים" value={f.sells} onChange={(x) => setF({ ...f, sells: x.target.value })} maxLength={120} />
      <Field label="טלפון" ltr inputMode="tel" value={f.phone} onChange={(x) => setF({ ...f, phone: x.target.value })} error={errs.phone} maxLength={20} />
      <div className="k-group">
        <span className="k-group__label" id="vendor-stall-needs">מה צריך מהחווה</span>
        <div className="k-chips k-chips--wrap" role="group" aria-labelledby="vendor-stall-needs">
          {NEED_ORDER.map((n) => <ChoiceChip key={n} selected={f.needs.includes(n)} onClick={() => toggle(n)}>{NEED_LABELS[n]}</ChoiceChip>)}
        </div>
      </div>
      <TextAreaField label="הערה לחווה" placeholder="למשל: מגיע עם מקרר" value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} maxLength={500} />
      <span className="vendor-note">מה שכתוב כאן מופיע אצל החווה, ונשמר להזמנות הבאות.</span>
    </AppScreen>
  );
}

// ---------- D8 ----------
const SEES: [boolean, string][] = [
  [true, 'את האירוע, השעות ומקום הדוכן'], [true, 'הודעות מהחווה לבעלי הדוכנים'], [true, 'כפתור "הגעתי" וכפתור "צריך משהו"'],
  [false, 'לא יכול לשנות את פרטי הדוכן או את התשובה'],
];
export function Sees({ title, rows }: { title: string; rows: [boolean, string][] }) {
  return (
    <section className="k-card k-card--list">
      <div className="k-cardhead"><h2 className="k-cardhead__title">{title}</h2></div>
      <ul className="k-list">
        {rows.map(([yes, t]) => (
          <li key={t} className="vendor-sees__li">
            <span className={yes ? 'vendor-sees__yes' : 'vendor-sees__no'}><Icon name={yes ? 'check' : 'close'} size={20} /></span>{t}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function HelperForm({ ctx }: ScreenProps) {
  const v = useVendorDoc(ctx.vendorId);
  const toast = useToast(); const open = useExternal();
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  // a helper never adds helpers: back to the stall (after render, not during it)
  useEffect(() => { if (ctx.helper) navigate('/vendor/stall', true); }, [ctx.helper]);
  if (ctx.helper) return null;
  const send = async () => {
    const e: typeof errs = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'כתבו את השם';
    if (!phoneOk(phone)) e.phone = 'צריך מספר נייד, למשל 052-1234567';
    setErrs(e); if (Object.keys(e).length || !v.item) return;
    setBusy(true);
    try {
      const fem = femName(name);
      const r = await addPerson(ctx, v.item, { name, phone, role: 'helper', fem });
      open(waUrl(phone, r.text));
      toast.show({ text: `${first(name)} ${g(fem, 'צורף', 'צורפה')} לדוכן. הקישור נפתח בוואטסאפ`, check: true });
      navigate('/vendor/stall', true);
    } catch (x) { toast.refused(errText(x)); } finally { setBusy(false); }
  };
  const bar = <BottomBar><Button size="bar" grow icon="message" onClick={send} disabled={busy || !v.item}>שליחת קישור בוואטסאפ</Button></BottomBar>;
  return (
    <AppScreen variant="form" gap={14} bar={bar}>
      <FormHeader title="לצרף עוזר לדוכן" onCancel={() => back('/vendor/stall')} />
      <Field label="שם" placeholder="שם פרטי ומשפחה" value={name} onChange={(x) => { setName(x.target.value); setErrs({ ...errs, name: undefined }); }} error={errs.name} maxLength={80} autoComplete="off" />
      <Field label="טלפון" placeholder="05" ltr inputMode="tel" value={phone} onChange={(x) => { setPhone(x.target.value); setErrs({ ...errs, phone: undefined }); }} error={errs.phone} maxLength={20} />
      <Sees title="מה העוזר רואה" rows={SEES} />
      <span className="vendor-note">העוזר מקבל קישור בוואטסאפ ונכנס עם חשבון Google שלו.</span>
    </AppScreen>
  );
}
