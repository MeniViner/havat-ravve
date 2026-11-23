// Q19 settings index and its pages: N6 payments, N7 messages, G1 amounts, "סוגי ביקור ושאלות הרשמה" (G2 visit types, G3
// questions), G4 contact, G5 managers.
// Storage stays compatible with the guest app: payment.bit/paybox/cash/note, donationPresets, visitTypes, registrationFields,
// templates, guestIntro and contact.phone/whatsapp keep their meaning. New keys (donationOptions, contactMore, payment.bitNumber,
// payment.payboxLink) are optional extras (see docs/redesign-data/manage.md).
// Tidy round: Q19 groups the index in two cards; recurring tasks (Tasks tab) and the Instinct log (Manage root) are not here.
// A sign-up question's removal is in its row sheet behind the Q8 confirmation (rule 6); a donation amount opens its edit sheet,
// whose ⋯ holds "מחיקה" (rules 4 and 6). The managers page lists owners and
// managers only: the team list lives in People (?filter=team) and role changes in Activity ("אנשים").
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, useToast } from '../../core';
import {
  ActionSheet, Avatar, BottomBar, Button, Card, DragHandle, EmptyState, Field, FormHeader, IconButton, Icon, ListCard, MoreMenu, PageTitle, Row, Segmented, Sheet, Tag, TextAreaField,
  TextLink, Toggle, TopBar, useReorder, type ActionItem,
} from '../../kit';
import { daysFromToday, money } from '../../format';
import { useRoute } from '../../../router';
import { getDemo } from '../../../demo/store';
import type { RegistrationField, Settings } from '../../../types';
import {
  usePeople, useRoleInvites, useActivityAll, saveSettings, useRun, donationOptionsOf, contactMoreOf, paymentForm, paymentPatch, numberOk,
  cleanPresets, cleanTypes, templateParts, questionMeta, fieldId, settingsLines, gw, isFemale, emailOk, type ManageSettings, type PresetRow, type PaymentForm,
} from '../../data/manage';
import { lnk } from './shared';

const back = { label: 'הגדרות', ...lnk('/manage/settings') };
const closeTo = () => go('/manage/settings');
const GUESTS = '/manage/settings/guests';

// ---------- Q19 ----------
export function SettingsScreen({ ctx }: ScreenProps) {
  const s = ctx.settings as ManageSettings;
  const people = usePeople(true).items;
  const invites = useRoleInvites(true).items;
  const toast = useToast();
  const [siteSheet, setSiteSheet] = useState(false);
  const owners = people.filter((p) => p.role === 'owner' && p.status === 'active').length + invites.filter((i) => i.role === 'owner').length;
  const managers = people.filter((p) => p.role === 'manager' && p.status === 'active').length + invites.filter((i) => i.role === 'manager').length;
  const l = settingsLines(s, owners, managers);
  const site = () => { if (getDemo().on) toast.show({ text: 'עריכת האתר זמינה בחשבון האמיתי', duration: 3000 }); else window.open('/edit', '_blank', 'noopener'); };
  const siteItems: ActionItem[] = [
    { label: 'עריכת אתר החווה', icon: 'globe', meta: 'נפתח בחלון נפרד', onSelect: site },
    { label: 'תנאי שימוש ופרטיות', icon: 'file', meta: 'הנוסח שהאורחים מאשרים', onSelect: () => go('/terms') },
  ];
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} />
      <PageTitle>הגדרות</PageTitle>
      <ListCard title="כסף ואורחים">
        <Row {...lnk('/manage/settings/payments')} title="תשלומים" meta={l.payments} />
        <Row {...lnk('/manage/settings/donation-amounts')} title="סכומי תרומה" meta={l.amounts} />
        <Row {...lnk(GUESTS)} title="סוגי ביקור ושאלות הרשמה" meta={l.typesQuestions} />
        <Row {...lnk('/manage/settings/messages')} title="הודעות מוכנות" meta={l.messages} />
      </ListCard>
      <ListCard title="מנהלים ומערכת">
        <Row {...lnk('/manage/settings/contact')} title="פרטי קשר לחווה" meta={<span dir="ltr">{l.contact}</span>} />
        {ctx.owner && <Row {...lnk('/manage/settings/managers')} title="מנהלים ובעלים" meta={l.managers} />}
        {ctx.cmsEditor
          ? <Row onClick={() => setSiteSheet(true)} title="אתר החווה ותנאי שימוש" meta="נפתח בחלון נפרד" />
          : <Row {...lnk('/terms')} title="תנאי שימוש ופרטיות" meta="הנוסח שהאורחים מאשרים" />}
      </ListCard>
      <ActionSheet open={siteSheet} onClose={() => setSiteSheet(false)} title="אתר החווה ותנאי שימוש" items={siteItems} />
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
  if (page === 'guests') return <GuestsPage {...p} />;
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

/** Saves and goes back (to the settings index, or to the page a sub-page belongs to). */
function useSave(to: () => void = closeTo) {
  const run = useRun();
  return async (fn: () => Promise<unknown>, text: string) => { if (await run(fn, text)) to(); };
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
  // the amount being edited in its sheet; key '' is a new one ("סכום נוסף")
  const [edit, setEdit] = useState<PresetRow | null>(null);
  const save = useSave();
  const toast = useToast();
  const { handle, rowStyle } = useReorder(rows, setRows);
  const submit = () => {
    const presets = cleanPresets(rows);
    if (!presets.length && !opts.custom) { toast.refused('לא נשמר. צריך לפחות סכום אחד, או "סכום אחר".'); return; }
    save(() => saveSettings(ctx.actor, { donationPresets: presets, donationOptions: opts }, 'סכומי התרומה עודכנו'), 'סכומי התרומה נשמרו');
  };
  const editOk = !!edit && Number(edit.amount) > 0;
  const keep = () => {
    if (!edit || !editOk) return;
    setRows((x) => (edit.key ? x.map((r) => (r.key === edit.key ? edit : r)) : [...x, { ...edit, key: rowKey() }]));
    setEdit(null);
  };
  const drop = (key: string) => { setRows((x) => x.filter((r) => r.key !== key)); setEdit(null); };
  const editMore = edit?.key ? (
    <MoreMenu title={`${money(Number(edit.amount) || 0)}`} items={[{
      label: 'מחיקה', icon: 'trash', tone: 'danger',
      confirm: { title: 'למחוק את הסכום?', text: `${money(Number(rows.find((r) => r.key === edit.key)?.amount) || 0)} יוסר מטופס התרומה כשתלחצו "שמירה".`, confirmLabel: 'מחיקה', onConfirm: () => drop(edit.key) },
    }]} />
  ) : undefined;
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <FormHeader title="סכומי תרומה" onCancel={closeTo} />
      {rows.length > 0 && (
        // rules 4 and 6: a row is the handle, the amount and its title; it opens its sheet, where ⋯ holds "מחיקה"
        <section className="k-card k-card--list">
          <ul className="manage-list">
            {rows.map((r, i) => (
              <li key={r.key} className="manage-qrow" style={rowStyle(i)}>
                <DragHandle {...handle(i, r.amount ? money(Number(r.amount)) : 'סכום')} />
                <button type="button" className="manage-qrow__hit" onClick={() => setEdit(r)} aria-haspopup="dialog">
                  <span className="manage-qrow__body">
                    <span className="manage-qrow__title">{money(Number(r.amount) || 0)}</span>
                    {r.label.trim() && <span className="k-meta">{r.label}</span>}
                  </span>
                  <span className="manage-chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="dashed" size="tall" icon="plus" iconSize={18} block onClick={() => setEdit({ key: '', amount: '', label: '' })}>סכום נוסף</Button>
      <ListCard aria-label="אפשרויות בטופס התרומה">
        <Row minHeight={58} title="סכום אחר" meta="האורח כותב סכום בעצמו" actions={<Toggle label="סכום אחר" checked={opts.custom} onChange={(v) => setOpts((o) => ({ ...o, custom: v }))} />} />
        <Row minHeight={58} title="הנצחה" meta='שדה "לזכר" בטופס התרומה' actions={<Toggle label="הנצחה" checked={opts.memorial} onChange={(v) => setOpts((o) => ({ ...o, memorial: v }))} />} />
        <Row minHeight={58} title="בקשת קבלה" meta="האורח יכול לבקש קבלה על שמו" actions={<Toggle label="בקשת קבלה" checked={opts.receipt} onChange={(v) => setOpts((o) => ({ ...o, receipt: v }))} />} />
      </ListCard>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.key ? 'עריכת סכום' : 'סכום חדש'} aside={editMore}>
        {edit && (
          <div className="manage-sheet">
            <Field label="סכום (₪)" ltr numeric inputMode="numeric" maxLength={7} value={edit.amount}
              error={edit.amount.trim() !== '' && !editOk ? 'סכום גדול מאפס' : undefined}
              onChange={(e) => setEdit({ ...edit, amount: e.target.value.replace(/[^\d]/g, '') })} />
            <Field label="כותרת" placeholder="למשל: חי" value={edit.label} maxLength={100} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
            <Button size="lg" block onClick={keep} disabled={!editOk}>{edit.key ? 'עדכון' : 'הוספה'}</Button>
          </div>
        )}
      </Sheet>
    </AppScreen>
  );
}

// ---------- Q19 "סוגי ביקור ושאלות הרשמה" ----------
function GuestsPage({ ctx }: ScreenProps) {
  const s = ctx.settings;
  const l = settingsLines(s, 0, 0);
  return (
    <AppScreen variant="detail">
      <TopBar back={back} />
      <PageTitle>סוגי ביקור ושאלות הרשמה</PageTitle>
      <ListCard aria-label="סוגי ביקור ושאלות הרשמה">
        <Row {...lnk('/manage/settings/visit-types')} title="סוגי ביקור" meta={s.visitTypes.join(', ') || l.types} />
        <Row {...lnk('/manage/settings/questions')} title="שאלות הרשמה" meta={l.questions} />
      </ListCard>
    </AppScreen>
  );
}

// ---------- G2 ----------
function VisitTypesPage({ ctx }: ScreenProps) {
  const [rows, setRows] = useState(() => ctx.settings.visitTypes.map((t) => ({ key: rowKey(), text: t })));
  const toGuests = () => go(GUESTS);
  const save = useSave(toGuests);
  const toast = useToast();
  const { handle, rowStyle } = useReorder(rows, setRows);
  const submit = () => {
    const types = cleanTypes(rows.map((r) => r.text));
    if (!types.length) { toast.refused('לא נשמר. צריך לפחות סוג ביקור אחד.'); return; }
    save(() => saveSettings(ctx.actor, { visitTypes: types }, 'סוגי הביקור עודכנו'), 'סוגי הביקור נשמרו');
  };
  return (
    <AppScreen variant="form" bar={<BottomBar><Button size="bar" grow onClick={submit}>שמירה</Button></BottomBar>}>
      <FormHeader title="סוגי ביקור" onCancel={toGuests} />
      {rows.length > 0 && (
        <section className="k-card k-card--list">
          <ul className="manage-list">
            {rows.map((r, i) => (
              <li key={r.key} className="manage-editrow" style={rowStyle(i)}>
                <DragHandle {...handle(i, r.text || 'סוג ביקור')} />
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
  const [rowOf, setRowOf] = useState<RegistrationField | null>(null);
  const store = (next: RegistrationField[], what: string, toast?: string) => run(() => saveSettings(ctx.actor, { registrationFields: next }, what), toast);
  const { handle, rowStyle } = useReorder(fields, (next) => { store(next, 'סדר שאלות ההרשמה שונה'); });
  const open = (f?: RegistrationField) => setDraft(f ? { id: f.id, label: f.label, type: f.type, options: f.options.join('\n'), required: f.required } : { id: '', label: '', type: 'text', options: '', required: false });
  const saveDraft = async () => {
    if (!draft || !draft.label.trim()) return;
    const f: RegistrationField = { id: draft.id || fieldId(draft.label, fields.map((x) => x.id)), label: draft.label.trim(), type: draft.type, options: draft.type === 'choice' ? draft.options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : [], required: draft.required };
    const next = draft.id ? fields.map((x) => (x.id === draft.id ? f : x)) : [...fields, f];
    if (await store(next, draft.id ? `שאלת הרשמה עודכנה: ${f.label}` : `שאלת הרשמה נוספה: ${f.label}`, 'השאלה נשמרה')) setDraft(null);
  };
  const remove = (q: RegistrationField) => {
    const old = fields;
    return run(() => saveSettings(ctx.actor, { registrationFields: fields.filter((x) => x.id !== q.id) }, `שאלת הרשמה הוסרה: ${q.label}`), { text: 'השאלה הוסרה', undo: () => saveSettings(ctx.actor, { registrationFields: old }, 'שאלת הרשמה הוחזרה') });
  };
  const rowItems: ActionItem[] = rowOf ? [
    { label: 'עריכת השאלה', icon: 'edit', onSelect: () => open(rowOf) },
    { label: 'הסרת השאלה', icon: 'trash', tone: 'danger', confirm: {
      title: 'להסיר את השאלה?', text: `"${rowOf.label}" תוסר מטופס ההרשמה. תשובות שכבר נשמרו נשארות בכרטיס של כל אדם. ההסרה נרשמת בפעילות.`, confirmLabel: 'הסרה',
      onConfirm: () => remove(rowOf),
    } },
  ] : [];
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'סוגי ביקור ושאלות הרשמה', ...lnk(GUESTS) }} />
      <PageTitle>שאלות הרשמה</PageTitle>
      <ListCard title="תמיד נשאלים">
        <Row title="שם בעברית, טלפון, מייל" meta="המייל מגיע מחשבון Google" />
      </ListCard>
      <ListCard title="השאלות שלכם" count={fields.length}>
        {fields.map((f, i) => (
          <li key={f.id} className="manage-qrow" style={rowStyle(i)}>
            <DragHandle {...handle(i, f.label)} />
            <button type="button" className="manage-qrow__hit" onClick={() => setRowOf(f)} aria-haspopup="dialog">
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
      <ActionSheet open={!!rowOf} onClose={() => setRowOf(null)} title={rowOf?.label || ''} sub={rowOf ? `${questionMeta(rowOf)} · ${answered(rowOf)}` : undefined} items={rowItems} />
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
    </AppScreen>
  );
}
