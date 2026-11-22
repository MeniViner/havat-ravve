// N5 settings index and its pages: N6 payments, N7 messages, G1 amounts, G2 visit types, G3 questions, G4 contact, G5 managers.
// Storage stays compatible with the guest app: payment.bit/paybox/cash/note, donationPresets, visitTypes, registrationFields,
// templates, guestIntro and contact.phone/whatsapp keep their meaning. New keys (donationOptions, contactMore, payment.bitNumber,
// payment.payboxLink) are optional extras (see docs/redesign-data/manage.md).
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useToast } from '../../core';
import {
  Avatar, BottomBar, Button, Card, EmptyState, Field, FormHeader, IconButton, Icon, ListCard, PageTitle, Row, Segmented, Sheet, Tag, TextAreaField,
  TextLink, Toggle, TopBar,
} from '../../kit';
import { dayTime, daysFromToday, firstName } from '../../format';
import { useRoute } from '../../../router';
import { getDemo } from '../../../demo/store';
import type { RegistrationField, Settings } from '../../../types';
import {
  usePeople, useRoleInvites, useActivityAll, useActivityByKind, saveSettings, useRun, donationOptionsOf, contactMoreOf, paymentForm, paymentPatch, numberOk,
  cleanPresets, cleanTypes, templateParts, questionMeta, fieldId, settingsLines, gw, isFemale, emailOk, type ManageSettings, type PresetRow, type PaymentForm,
} from '../../data/manage';
import { lnk, useReorder, Grip } from './shared';

const back = { label: 'הגדרות', ...lnk('/manage/settings') };
const closeTo = () => go('/manage/settings');

// ---------- N5 ----------
export function SettingsScreen({ ctx }: ScreenProps) {
  const s = ctx.settings as ManageSettings;
  const people = usePeople(true).items;
  const invites = useRoleInvites(true).items;
  const toast = useToast();
  const owners = people.filter((p) => p.role === 'owner' && p.status === 'active').length + invites.filter((i) => i.role === 'owner').length;
  const managers = people.filter((p) => p.role === 'manager' && p.status === 'active').length + invites.filter((i) => i.role === 'manager').length;
  const l = settingsLines(s, owners, managers);
  const site = () => { if (getDemo().on) toast.show({ text: 'עריכת האתר זמינה בחשבון האמיתי', duration: 3000 }); else window.open('/admin', '_blank', 'noopener'); };
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} />
      <PageTitle>הגדרות</PageTitle>
      <ListCard aria-label="הגדרות">
        <Row {...lnk('/manage/settings/payments')} title="תשלומים" meta={l.payments} />
        <Row {...lnk('/manage/settings/donation-amounts')} title="סכומי תרומה" meta={l.amounts} />
        <Row {...lnk('/manage/settings/visit-types')} title="סוגי ביקור" meta={l.types} />
        <Row {...lnk('/manage/settings/questions')} title="שאלות הרשמה" meta={l.questions} />
        <Row {...lnk('/manage/settings/messages')} title="הודעות מוכנות" meta={l.messages} />
        <Row {...lnk('/manage/settings/contact')} title="פרטי קשר לחווה" meta={<span dir="ltr">{l.contact}</span>} />
        {ctx.owner && <Row {...lnk('/manage/settings/managers')} title="מנהלים ובעלים" meta={l.managers} />}
      </ListCard>
      <ListCard aria-label="עוד">
        {ctx.cmsEditor && <Row onClick={site} title="עריכת אתר החווה" meta="נפתח בחלון נפרד" />}
        <Row {...lnk('/terms')} title="תנאי שימוש ופרטיות" meta="הנוסח שהאורחים מאשרים" />
      </ListCard>
    </AppScreen>
  );
}

// ---------- the page switch ----------
export function SettingsPage(p: ScreenProps) {
  const route = useRoute();
  const page = p.params.page || route.split('/')[3] || '';
  if (page === 'payments') return <PaymentsPage {...p} />;
  if (page === 'messages') return <MessagesPage {...p} />;
  if (page === 'donation-amounts') return <AmountsPage {...p} />;
  if (page === 'visit-types') return <VisitTypesPage {...p} />;
  if (page === 'questions') return <QuestionsPage {...p} />;
  if (page === 'contact') return <ContactPage {...p} />;
  if (page === 'managers') return <ManagersPage {...p} />;
  return (
    <AppScreen variant="detail">
      <TopBar back={back} />
      <EmptyState variant="fill" icon="sliders" title="אין הגדרה כזו" />
    </AppScreen>
  );
}

/** Saves and goes back to the settings index. */
function useSave() {
  const run = useRun();
  return async (fn: () => Promise<unknown>, text: string) => { if (await run(fn, text)) closeTo(); };
}

// ---------- N6 ----------
function PaymentsPage({ ctx }: ScreenProps) {
  const s = ctx.settings as ManageSettings;
  const [f, setF] = useState<PaymentForm>(() => paymentForm(s.payment));
  const [err, setErr] = useState('');
  const save = useSave();
  // Only owners may change payment details (firestore.rules); managers see them as they are.
  const ro = !ctx.owner;
  const set = (patch: Partial<PaymentForm>) => { if (ro) return; setF((x) => ({ ...x, ...patch })); setErr(''); };
  const submit = () => {
    if (f.bitOn && (!f.bit.trim() || !numberOk(f.bit.trim()))) { setErr('מספר לביט: 9 עד 15 ספרות'); return; }
    if (f.payboxOn && !f.paybox.trim()) { setErr('צריך קישור לקבוצת PayBox'); return; }
    save(() => saveSettings(ctx.actor, { payment: paymentPatch(f) }, 'פרטי התשלום עודכנו'), 'פרטי התשלום נשמרו');
  };
  return (
    <AppScreen variant="detail" bar={ro ? undefined : <BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <TopBar back={back} />
      <PageTitle>איך משלמים</PageTitle>
      {ro && <span className="manage-hint">רק בעלים יכולים לשנות את פרטי התשלום.</span>}
      <ListCard aria-label="אמצעי תשלום">
        <Row minHeight={58} title="ביט" actions={<Toggle label="ביט" disabled={ro} checked={f.bitOn} onChange={(v) => set({ bitOn: v })} />} />
        {f.bitOn && <li className="manage-fieldrow"><Field label="מספר לביט" ltr inputMode="tel" readOnly={ro} value={f.bit} onChange={(e) => set({ bit: e.target.value })} error={err.startsWith('מספר') ? err : undefined} /></li>}
        <Row minHeight={58} title="PayBox" actions={<Toggle label="PayBox" disabled={ro} checked={f.payboxOn} onChange={(v) => set({ payboxOn: v })} />} />
        {f.payboxOn && <li className="manage-fieldrow"><Field label="קישור לקבוצת PayBox" ltr inputMode="url" readOnly={ro} value={f.paybox} onChange={(e) => set({ paybox: e.target.value })} error={err.startsWith('צריך') ? err : undefined} /></li>}
        <Row minHeight={58} title="מזומן בשער" meta='המתנדב מסמן "שולם" בסריקה' actions={<Toggle label="מזומן בשער" disabled={ro} checked={f.cash} onChange={(v) => set({ cash: v })} />} />
        <Row minHeight={58} title="אשראי באתר" meta="עוד לא מחובר לספק" actions={<Toggle label="אשראי באתר" checked={false} disabled onChange={() => {}} />} />
      </ListCard>
      <Field label="שורה שהאורח רואה ליד התשלום" readOnly={ro} value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} />
    </AppScreen>
  );
}

// ---------- N7 ----------
type TplKey = keyof Settings['templates'] | 'guestIntro';
const TEMPLATES: { k: TplKey; t: string; ph: string[] }[] = [
  { k: 'visitApproved', t: 'אישור ביקור', ph: ['שם', 'תאריך', 'שעה', 'הערה'] },
  { k: 'donationThanks', t: 'תודה על תרומה', ph: ['שם', 'סכום'] },
  { k: 'debtReminder', t: 'תזכורת חוב', ph: ['שם', 'אירוע', 'סכום', 'ביט'] },
  { k: 'paymentConfirmation', t: 'אישור תשלום', ph: ['שם', 'סכום', 'אירוע'] },
  { k: 'ticketReminder', t: 'תזכורת לאירוע', ph: ['שם', 'אירוע', 'תאריך'] },
  { k: 'vendorInvite', t: 'הזמנת בעל דוכן', ph: ['שם', 'אירוע', 'תאריך'] },
  { k: 'guestIntro', t: 'משפט פתיחה לאורחים', ph: [] },
];
/** A placeholder whose name repeats the word before it ("עבור [עבור]" in the default text) gets a clearer chip. */
const PH_LABEL: Record<string, string> = { 'עבור': 'מה שולם' };
function MessagesPage({ ctx }: ScreenProps) {
  const s = ctx.settings;
  const [edit, setEdit] = useState<TplKey | null>(null);
  const [text, setText] = useState('');
  const run = useRun();
  const value = (k: TplKey) => (k === 'guestIntro' ? s.guestIntro : s.templates[k] || '');
  const open = (k: TplKey) => { setEdit(k); setText(value(k)); };
  const cur = TEMPLATES.find((x) => x.k === edit);
  const save = async () => {
    if (!edit) return;
    const t = text.trim();
    const patch: Partial<Settings> = edit === 'guestIntro' ? { guestIntro: t } : { templates: { ...s.templates, [edit]: t } };
    if (await run(() => saveSettings(ctx.actor, patch, `הודעה מוכנה עודכנה: ${cur?.t}`), 'ההודעה נשמרה')) setEdit(null);
  };
  return (
    <AppScreen variant="detail">
      <TopBar back={back} />
      <PageTitle>הודעות מוכנות</PageTitle>
      {TEMPLATES.map((x) => (
        <Card key={x.k} as="section" pad="md" layout="col">
          <div className="manage-tpl__head">
            <h2 className="manage-tpl__title">{x.t}</h2>
            <TextLink onClick={() => open(x.k)}>עריכה</TextLink>
          </div>
          <p className="manage-tpl__text">
            {templateParts(value(x.k)).map((part, i) => (typeof part === 'string' ? <span key={i}>{part}</span> : <span key={i} className="manage-ph">{PH_LABEL[part.ph] || part.ph}</span>))}
          </p>
        </Card>
      ))}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={cur ? `עריכה: ${cur.t}` : ''}>
        <div className="manage-sheet">
          <TextAreaField label="נוסח ההודעה" value={text} onChange={(e) => setText(e.target.value)} height={140} maxLength={2000}
            hint={cur?.ph.length ? `מילים בסוגריים מתחלפות לבד: ${cur.ph.map((p) => `[${p}]`).join(' ')}` : 'מופיע בראש דף הבית של האורח.'} />
          <Button size="lg" block onClick={save} disabled={!text.trim()}>שמירה</Button>
        </div>
      </Sheet>
    </AppScreen>
  );
}

// ---------- G1 ----------
let rowSeq = 0;
const rowKey = () => `r${++rowSeq}`;
function AmountsPage({ ctx }: ScreenProps) {
  const s = ctx.settings as ManageSettings;
  const [rows, setRows] = useState<PresetRow[]>(() => s.donationPresets.map((p) => ({ key: rowKey(), amount: String(p.amount), label: p.label })));
  const [opts, setOpts] = useState(() => donationOptionsOf(s));
  const save = useSave();
  const toast = useToast();
  const { grip, rowStyle } = useReorder(rows, setRows);
  const upd = (i: number, patch: Partial<PresetRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = () => {
    const presets = cleanPresets(rows);
    if (!presets.length && !opts.custom) { toast.refused('לא נשמר. צריך לפחות סכום אחד, או "סכום אחר".'); return; }
    save(() => saveSettings(ctx.actor, { donationPresets: presets, donationOptions: opts }, 'סכומי התרומה עודכנו'), 'סכומי התרומה נשמרו');
  };
  const bad = (r: PresetRow) => r.amount.trim() !== '' && !(Number(r.amount) > 0);
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <FormHeader title="סכומי תרומה" onCancel={closeTo} />
      {rows.length > 0 && (
        <section className="k-card k-card--list">
          <ul className="manage-list">
            {rows.map((r, i) => (
              <li key={r.key} className="manage-editrow" style={rowStyle(i)}>
                <button {...grip(i, r.amount || 'סכום')}><Grip /></button>
                <label className="k-sr" htmlFor={`${r.key}-a`}>סכום</label>
                <input id={`${r.key}-a`} className="manage-editinput manage-editinput--amount" dir="ltr" inputMode="numeric" value={r.amount} aria-invalid={bad(r) || undefined} onChange={(e) => upd(i, { amount: e.target.value.replace(/[^\d]/g, '') })} />
                <label className="k-sr" htmlFor={`${r.key}-l`}>כותרת</label>
                <input id={`${r.key}-l`} className="manage-editinput" value={r.label} maxLength={100} onChange={(e) => upd(i, { label: e.target.value })} />
                <IconButton variant="quiet" icon="close" label={`הסרה: ${r.amount || r.label}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => setRows((x) => [...x, { key: rowKey(), amount: '', label: '' }])}>סכום נוסף</Button>
      <ListCard aria-label="אפשרויות בטופס התרומה">
        <Row minHeight={58} title="סכום אחר" meta="האורח כותב סכום בעצמו" actions={<Toggle label="סכום אחר" checked={opts.custom} onChange={(v) => setOpts((o) => ({ ...o, custom: v }))} />} />
        <Row minHeight={58} title="הנצחה" meta='שדה "לזכר" בטופס התרומה' actions={<Toggle label="הנצחה" checked={opts.memorial} onChange={(v) => setOpts((o) => ({ ...o, memorial: v }))} />} />
        <Row minHeight={58} title="בקשת קבלה" meta="האורח יכול לבקש קבלה על שמו" actions={<Toggle label="בקשת קבלה" checked={opts.receipt} onChange={(v) => setOpts((o) => ({ ...o, receipt: v }))} />} />
      </ListCard>
    </AppScreen>
  );
}

// ---------- G2 ----------
function VisitTypesPage({ ctx }: ScreenProps) {
  const [rows, setRows] = useState(() => ctx.settings.visitTypes.map((t) => ({ key: rowKey(), text: t })));
  const save = useSave();
  const toast = useToast();
  const { grip, rowStyle } = useReorder(rows, setRows);
  const submit = () => {
    const types = cleanTypes(rows.map((r) => r.text));
    if (!types.length) { toast.refused('לא נשמר. צריך לפחות סוג ביקור אחד.'); return; }
    save(() => saveSettings(ctx.actor, { visitTypes: types }, 'סוגי הביקור עודכנו'), 'סוגי הביקור נשמרו');
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <FormHeader title="סוגי ביקור" onCancel={closeTo} />
      {rows.length > 0 && (
        <section className="k-card k-card--list">
          <ul className="manage-list">
            {rows.map((r, i) => (
              <li key={r.key} className="manage-editrow" style={rowStyle(i)}>
                <button {...grip(i, r.text || 'סוג ביקור')}><Grip /></button>
                <label className="k-sr" htmlFor={r.key}>סוג ביקור</label>
                <input id={r.key} className="manage-editinput" value={r.text} maxLength={60} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
                <IconButton variant="quiet" icon="close" label={`הסרה: ${r.text}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => setRows((x) => [...x, { key: rowKey(), text: '' }])}>סוג נוסף</Button>
      <span className="manage-hint">הסדר כאן הוא הסדר שהאורח רואה.</span>
    </AppScreen>
  );
}

// ---------- G3 ----------
type Draft = { id: string; label: string; type: RegistrationField['type']; options: string; required: boolean };
function QuestionsPage({ ctx }: ScreenProps) {
  const fields = ctx.settings.registrationFields;
  const people = usePeople(true).items;
  const answered = (f: RegistrationField) => {
    const n = people.filter((p) => String(p.fields?.[f.id] || '').trim()).length;
    return n ? `ענו: ${n} מתוך ${people.length}` : 'חדש, עוד לא נשאל';
  };
  const run = useRun();
  const [draft, setDraft] = useState<Draft | null>(null);
  const store = (next: RegistrationField[], what: string, toast?: string) => run(() => saveSettings(ctx.actor, { registrationFields: next }, what), toast);
  const { grip, rowStyle } = useReorder(fields, (next) => { store(next, 'סדר שאלות ההרשמה שונה'); });
  const open = (f?: RegistrationField) => setDraft(f ? { id: f.id, label: f.label, type: f.type, options: f.options.join('\n'), required: f.required } : { id: '', label: '', type: 'text', options: '', required: false });
  const saveDraft = async () => {
    if (!draft || !draft.label.trim()) return;
    const f: RegistrationField = { id: draft.id || fieldId(draft.label, fields.map((x) => x.id)), label: draft.label.trim(), type: draft.type, options: draft.type === 'choice' ? draft.options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : [], required: draft.required };
    const next = draft.id ? fields.map((x) => (x.id === draft.id ? f : x)) : [...fields, f];
    if (await store(next, draft.id ? `שאלת הרשמה עודכנה: ${f.label}` : `שאלת הרשמה נוספה: ${f.label}`, 'השאלה נשמרה')) setDraft(null);
  };
  const remove = async () => {
    if (!draft?.id) return;
    const old = fields;
    if (await run(() => saveSettings(ctx.actor, { registrationFields: fields.filter((x) => x.id !== draft.id) }, `שאלת הרשמה הוסרה: ${draft.label}`), { text: 'השאלה הוסרה', undo: () => saveSettings(ctx.actor, { registrationFields: old }, 'שאלת הרשמה הוחזרה') })) setDraft(null);
  };
  return (
    <AppScreen variant="detail">
      <TopBar back={back} />
      <PageTitle>שאלות הרשמה</PageTitle>
      <ListCard title="תמיד נשאלים">
        <Row title="שם בעברית, טלפון, מייל" meta="המייל מגיע מחשבון Google" />
      </ListCard>
      <ListCard title="השאלות שלכם" count={fields.length}>
        {fields.map((f, i) => (
          <li key={f.id} className="manage-qrow" style={rowStyle(i)}>
            <button {...grip(i, f.label)}><Grip /></button>
            <button type="button" className="manage-qrow__hit" onClick={() => open(f)}>
              <span className="manage-qrow__body">
                <span className="manage-qrow__title">{f.label}</span>
                <span className="k-meta">{questionMeta(f)} · {answered(f)}</span>
              </span>
              {f.required ? <Tag tone="warm">חובה</Tag> : <Tag>רשות</Tag>}
              <span className="manage-chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
            </button>
          </li>
        ))}
      </ListCard>
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => open()}>שאלה נוספת</Button>
      <span className="manage-hint">שאלת רשות מופיעה גם ב"השלמת פרטים" למי שכבר רשום.</span>
      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'עריכת שאלה' : 'שאלה חדשה'}>
        {draft && (
          <div className="manage-sheet">
            <Field label="השאלה" value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <div className="manage-group">
              <span className="manage-group__label">סוג תשובה</span>
              <Segmented className="manage-seg" label="סוג תשובה" value={draft.type} onChange={(t) => setDraft({ ...draft, type: t })}
                options={[{ value: 'text', label: 'טקסט' }, { value: 'choice', label: 'בחירה' }, { value: 'date', label: 'תאריך' }]} />
            </div>
            {draft.type === 'choice' && <TextAreaField label="אפשרויות, אחת בכל שורה" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} height={110} />}
            <ul className="k-list k-card k-card--list"><Row minHeight={54} title="חובה" meta="בלי תשובה אי אפשר להירשם" actions={<Toggle label="חובה" checked={draft.required} onChange={(v) => setDraft({ ...draft, required: v })} />} /></ul>
            <Button size="lg" block onClick={saveDraft} disabled={!draft.label.trim()}>שמירה</Button>
            {draft.id && <Button variant="danger" block onClick={remove}>הסרת השאלה</Button>}
            {draft.id && <span className="manage-hint">תשובות שכבר נשמרו נשארות בכרטיס של כל אדם.</span>}
          </div>
        )}
      </Sheet>
    </AppScreen>
  );
}

// ---------- G4 ----------
function ContactPage({ ctx }: ScreenProps) {
  const s = ctx.settings as ManageSettings;
  const more = contactMoreOf(s);
  const [phone, setPhone] = useState(s.contact?.phone || '');
  const [whatsapp, setWhatsapp] = useState(s.contact?.whatsapp || '');
  const [email, setEmail] = useState(more.email);
  const [address, setAddress] = useState(more.address);
  const [inquiries, setInquiries] = useState(more.inquiries);
  const save = useSave();
  const phoneBad = !numberOk(phone.trim()), waBad = !numberOk(whatsapp.trim()), mailBad = !!email.trim() && !emailOk(email);
  const submit = () => {
    if (phoneBad || waBad || mailBad) return;
    save(() => saveSettings(ctx.actor, { contact: { phone: phone.trim(), whatsapp: whatsapp.trim() }, contactMore: { email: email.trim(), address: address.trim(), inquiries } }, 'פרטי הקשר עודכנו'), 'פרטי הקשר נשמרו');
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <FormHeader title="פרטי קשר לחווה" onCancel={closeTo} />
      <Field label="טלפון" ltr inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneBad ? 'מספר טלפון: 9 עד 15 ספרות' : undefined} />
      <Field label="וואטסאפ" ltr inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} error={waBad ? 'מספר וואטסאפ: 9 עד 15 ספרות' : undefined} />
      <Field label="מייל" ltr type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={mailBad ? 'כתובת מייל לא תקינה' : undefined} />
      <Field label="כתובת לניווט" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
      <ListCard aria-label="פניות">
        <Row minHeight={58} title="פניות מאורחים" meta='מגיעות ל"לטיפול" של כל המנהלים' actions={<Toggle label="פניות מאורחים" checked={inquiries} onChange={setInquiries} />} />
      </ListCard>
    </AppScreen>
  );
}

// ---------- G5 ----------
function ManagersPage({ ctx }: ScreenProps) {
  const people = usePeople(true).items;
  const invites = useRoleInvites(true).items;
  const activity = useActivityAll(true, 600).items;
  const lastSeen = useMemo(() => { const m = new Map<string, string>(); for (const a of activity) if (!m.has(a.by.uid) || m.get(a.by.uid)! < a.at) m.set(a.by.uid, a.at); return m; }, [activity]);
  const seen = (uid: string, name: string, email: string) => {
    const at = lastSeen.get(uid); if (!at) return email;
    const d = -daysFromToday(at);
    return `${gw(name, 'נכנס', 'נכנסה')} ${d <= 0 ? 'היום' : d === 1 ? 'אתמול' : `לפני ${d} ימים`}`;
  };
  const sortMe = <T extends { uid: string; displayName: string }>(xs: T[]) => [...xs].sort((a, b) => (a.uid === ctx.actor.uid ? -1 : b.uid === ctx.actor.uid ? 1 : a.displayName.localeCompare(b.displayName, 'he')));
  const owners = sortMe(people.filter((p) => p.role === 'owner' && p.status === 'active'));
  // Managers: most recently active first (G5 shows who is around).
  const managers = people.filter((p) => p.role === 'manager' && p.status === 'active').sort((a, b) => (lastSeen.get(b.uid) || '').localeCompare(lastSeen.get(a.uid) || '') || a.displayName.localeCompare(b.displayName, 'he'));
  const pending = (role: 'owner' | 'manager') => invites.filter((i) => i.role === role).map((i) => (
    <Row key={i.id} minHeight={56} {...lnk('/manage/people/invite')} leading={<Avatar initials="?" />} title={i.email} meta="הוגדר, עוד לא נכנס" />
  ));
  const personRow = (p: typeof people[number], owner: boolean) => {
    const self = p.uid === ctx.actor.uid;
    return self
      ? <Row key={p.uid} minHeight={56} leading={<Avatar name={p.displayName} tone="me" />} title={p.displayName} meta={isFemale(p.displayName) ? 'את' : 'אתה'} />
      : <Row key={p.uid} minHeight={56} {...lnk(`/manage/people/${p.uid}`)} leading={<Avatar name={p.displayName} />} title={p.displayName} meta={owner ? p.email : seen(p.uid, p.displayName, p.email)} />;
  };
  const ownerPending = pending('owner'), managerPending = pending('manager');
  const staff = people.filter((p) => p.role === 'staff' && p.status === 'active');
  const changes = useActivityByKind('user', true, 40).items.filter((a) => ['role', 'invited', 'blocked', 'unblocked'].includes(a.action)).slice(0, 8);
  return (
    <AppScreen variant="detail">
      <TopBar back={back} />
      <PageTitle>מנהלים ובעלים</PageTitle>
      <ListCard title="בעלים" count={owners.length + ownerPending.length}>{owners.map((p) => personRow(p, true))}{ownerPending}</ListCard>
      <ListCard title="מנהלים" count={managers.length + managerPending.length}>
        {managers.map((p) => personRow(p, false))}{managerPending}
        {!managers.length && !managerPending.length && <Row title={<span className="k-soft" style={{ fontWeight: 400 }}>עוד אין מנהלים</span>} />}
      </ListCard>
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block {...lnk('/manage/people/invite')}>תפקיד לפי כתובת מייל</Button>
      <span className="manage-hint">בעלים יכולים למנות מנהלים ובעלים. מנהלים יכולים למנות מתנדבים.</span>
      <ListCard title="צוות ומתנדבים" count={staff.length} end={<TextLink {...lnk('/manage/people?filter=team')}>כולם באנשים</TextLink>}>
        <Row title={<span style={{ fontWeight: 400 }}>{staff.length ? staff.map((p) => firstName(p.displayName)).slice(0, 8).join(' · ') + (staff.length > 8 ? ` + ${staff.length - 8}` : '') : '—'}</span>} />
      </ListCard>
      {changes.length > 0 && (
        <ListCard title="שינויים אחרונים">
          {changes.map((a) => <Row key={a.id} title={<span style={{ fontWeight: 500 }}>{firstName(a.by.name)} · {a.text}</span>} meta={dayTime(a.at)} />)}
        </ListCard>
      )}
    </AppScreen>
  );
}
