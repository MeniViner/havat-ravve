// אבטחה: who was refused, who was slowed down for too many requests, and everything done from the console
// (sign-ins, keys, restores), newest first. The server's reasons come in English and requests by their path: here
// they read in Hebrew, with the original kept small (and in the tooltip) for whoever needs it.
import { useMemo, useState } from 'react';
import { Button, Card, Chip, ChipRow, Field, ListCard, Row, Tag } from '../app/v2/kit';
import { dayName, ddmm, daysFromToday, hhmm } from '../app/v2/format';
import { many, Section, useLoad } from './shared';
import { nowMs } from '../app/clock';
import { source, type CatalogOp, type SecurityEvent } from './source';
import { useWide } from './desk/route';
import { opTitle } from './desk/runOps';
import { Btn, Chips, Col, Cols, DCard, DTag, Fact, Facts, Failed, Hist, Page, Search, Skeleton, Summary, Table, TableCard, Toolbar, saveCsv } from './desk/desk';

type Filter = 'all' | SecurityEvent['kind'];
const FILTERS: { id: Filter; he: string }[] = [{ id: 'all', he: 'הכל' }, { id: 'refused', he: 'נדחו' }, { id: 'limited', he: 'נחסמו' }, { id: 'console', he: 'בקונסולה' }];
const KIND: Record<SecurityEvent['kind'], { he: string; tone: 'urgent' | 'warm' | 'neutral' }> = {
  refused: { he: 'נדחה', tone: 'urgent' }, limited: { he: 'נחסם', tone: 'warm' }, console: { he: 'קונסולה', tone: 'neutral' },
};
const dayLabel = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(iso)} ${ddmm(iso)}`; };

/** The server's reason (an English message, or just its code) as an owner reads it. */
const REASONS: [RegExp, string][] = [
  [/revoked/i, 'המפתח בוטל'],
  [/API key has expired|key.*expired/i, 'תוקף המפתח נגמר'],
  [/unknown API key/i, 'מפתח לא מוכר'],
  [/sign-in token|sign in with Google|missing sign-in/i, 'החיבור עם Google לא תקף'],
  [/keys are stopped/i, 'כל המפתחות עצורים (במסך מתגים)'],
  [/read-only/i, 'החווה במצב קריאה בלבד'],
  [/may not|not allowed|scope|only managers|permission/i, 'למפתח אין הרשאה לזה'],
  [/active team member|no active profile/i, 'המפתח פועל בשם מי שכבר לא בצוות'],
  [/console is for/i, 'הקונסולה רק לבעלי החווה'],
  [/RATE_LIMITED|too many/i, 'יותר מדי בקשות בזמן קצר'],
];
const CODES: Record<string, string> = {
  FORBIDDEN: 'אין הרשאה', UNAUTHENTICATED: 'המפתח לא זוהה', VALIDATION_FAILED: 'הבקשה לא תקינה', NOT_FOUND: 'לא נמצא', RATE_LIMITED: 'יותר מדי בקשות בזמן קצר',
};
const hasLatin = (s: string) => /[A-Za-z]/.test(s);
function reasonText(detail: string): string {
  if (!detail || !hasLatin(detail)) return detail;
  for (const [re, he] of REASONS) if (re.test(detail)) return he;
  if (CODES[detail]) return CODES[detail];
  // "אין הרשאה: <english>" keeps its Hebrew start; a reason that is all English becomes one plain line
  const head = detail.split(':')[0].trim();
  return head && !hasLatin(head) ? head : 'השרת סירב לבקשה';
}

/** "/v1/tasks/abc" -> the operation's Hebrew name from the catalog, when one matches. */
function opName(path: string, ops: CatalogOp[] | null): string | null {
  if (!ops) return null;
  const clean = path.split('?')[0];
  const hit = ops.filter((o) => new RegExp('^' + o.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+') + '$').test(clean))
    .sort((a, b) => (a.method === 'GET' ? -1 : 1) - (b.method === 'GET' ? -1 : 1))[0];
  return hit ? opTitle(hit) : null;
}

// ---------- what an event says, for both layouts ----------
const SIGN_IN = 'כניסה לקונסולה';
/** The owners' switches by name; true: the stored value says it is off. */
const SWITCH: Record<string, [string, boolean]> = {
  emailPaused: ['מיילים על תשלומים', true], pushPaused: ['התראות לטלפון', true], broadcastEmailPaused: ['הודעות במייל לנרשמים', true], keysStopped: ['עצירת כל המפתחות', false],
  readOnly: ['קריאה בלבד', false], maintenance: ['הודעת תחזוקה', false], registrationClosed: ['סגירת ההרשמה', false], backupPaused: ['גיבוי לילי', true], monitorPaused: ['ניטור', true], cleanupPaused: ['ניקוי רשומות ישנות', true],
};
/** Which switch changed and to what, when the server says it ({"emailPaused":true} or emailPaused=true in the detail). */
function switchText(e: SecurityEvent): string | null {
  if (e.kind !== 'console' || !/מתג/.test(e.what)) return null;
  const out: string[] = [];
  for (const m of e.detail.matchAll(/"?([A-Za-z]+)"?\s*[:=]\s*"?(true|false|on|off)\b/g)) {
    const sw = SWITCH[m[1]];
    if (sw) out.push(`${(m[2] === 'true' || m[2] === 'on') !== sw[1] ? 'הדליק מתג' : 'כיבה מתג'}: ${sw[0]}`);
  }
  return out.length ? out.join(', ') : null;
}
/** How long an automatic block lasts, as the event says it ("נחסם לדקה", "נחסם ל־10 דקות"); the limiter's own minute when it does not. */
const blockMinutes = (e: SecurityEvent) => Number(/ל־?\s?(\d+) דק/.exec(e.detail)?.[1] || 1);
const isBlock = (e: SecurityEvent) => e.kind === 'limited' && !/מכסה/.test(e.detail);
const minutesHe = (m: number) => (m === 1 ? 'דקה' : `${m} דקות`);
type Line = SecurityEvent & { id: string; whoHe: string; whatHe: string; why: string; from: string; raw: string };
const KEY_ID = /^[A-Za-z0-9_-]+$/;
function lineOf(e: SecurityEvent, i: number, ops: CatalogOp[] | null, keyNames: Map<string, string>): Line {
  const path = e.what.startsWith('/');
  const sw = switchText(e);
  const whoHe = !e.who ? 'כתובת לא מוכרת' : KEY_ID.test(e.who) ? keyNames.get(e.who) || 'מפתח API' : e.who;
  const why = sw ? '' : reasonText(e.kind === 'limited' ? e.detail.split(':')[0].trim() : e.detail);
  return {
    ...e, id: e.at + '-' + i, whoHe, whatHe: sw || (path ? opName(e.what, ops) || 'בקשה לשרת' : e.what), why,
    from: e.kind === 'console' ? 'קונסולה' : whoHe === 'כתובת לא מוכרת' ? 'אינטרנט' : 'מפתח API',
    raw: [path ? e.what : '', e.detail && e.detail !== why && !sw ? e.detail : ''].filter(Boolean).join(' · '),
  };
}
/** A sign-in that something was done in right after it is told by what was done: the full list keeps it under "בקונסולה" and in the sign-ins. */
const VISIT_MS = 20 * 60_000;
function withoutOpenings(lines: Line[]) {
  return lines.filter((l) => l.what !== SIGN_IN || !lines.some((x) => x !== l && x.kind === 'console' && x.who === l.who && x.at > l.at && Date.parse(x.at) - Date.parse(l.at) < VISIT_MS));
}
const when = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? `היום ${hhmm(iso)}` : d === -1 ? `אתמול ${hhmm(iso)}` : `${dayName(iso)} ${ddmm(iso)}`; };
const whenFull = (iso: string) => { const d = daysFromToday(iso); return d === 0 || d === -1 ? when(iso) : `${ddmm(iso)} ${hhmm(iso)}`; };
const freed = (e: SecurityEvent) => { const at = Date.parse(e.at) + blockMinutes(e) * 60_000; return `${at <= nowMs() ? 'שוחררה' : 'משתחררת'} ב־${hhmm(new Date(at).toISOString())}`; };
const tagOf = (e: SecurityEvent) => (e.kind === 'console' ? (e.ok ? null : { he: 'נכשל', tone: 'red' as const }) : e.kind === 'refused' ? { he: 'נדחה', tone: 'red' as const } : { he: 'נחסם', tone: 'warm' as const });
function excel(lines: Line[]) {
  saveCsv('havat-ravve-security.csv', ['תאריך', 'שעה', 'מי', 'מה', 'סיבה', 'מאיפה', 'תוצאה', 'פרטים מהשרת'],
    lines.map((l) => [`${ddmm(l.at)}.${l.at.slice(0, 4)}`, hhmm(l.at), l.whoHe, l.whatHe, l.why, l.from, tagOf(l)?.he || 'בוצע', l.raw]));
}
const SPAN: Record<number, string> = { 1: 'ביממה האחרונה', 7: 'בשבעת הימים האחרונים', 30: 'ב־30 הימים האחרונים' };
const PERIOD: Record<number, string> = { 1: 'ביממה', 7: 'השבוע', 30: 'החודש' };
const DENY = 'בקשה נדחית כשמפתח מנסה פעולה שאין לו הרשאה אליה או כשהמפתח בוטל.';

export function SecurityScreen() {
  const wide = useWide();
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const log = useLoad(() => source.security(days), [days]);
  const [filter, setFilter] = useState<Filter>('all');
  const needsCatalog = !!log.data?.items.some((e) => e.what.startsWith('/'));
  const cat = useLoad(() => (needsCatalog ? source.catalog() : Promise.resolve(null)), [needsCatalog]);
  // a refused or slowed-down key may come by its id: shown by its name
  const needsKeys = !!log.data?.items.some((e) => e.who && KEY_ID.test(e.who));
  const keys = useLoad(() => (needsKeys ? source.keys().catch(() => null) : Promise.resolve(null)), [needsKeys]);
  const lines = useMemo(() => {
    const names = new Map((keys.data || []).map((k) => [k.id, k.label || 'מפתח API']));
    return (log.data?.items || []).map((e, i) => lineOf(e, i, cat.data, names));
  }, [log.data, cat.data, keys.data]);
  const t = q.trim().toLowerCase();
  const items = useMemo(() => lines.filter((l) => (filter === 'all' || l.kind === filter) && (!t || [l.whoHe, l.whatHe, l.why, l.from, l.raw].some((x) => x.toLowerCase().includes(t)))), [lines, filter, t]);
  const groups = useMemo(() => {
    const out: { day: string; items: Line[] }[] = [];
    for (const e of items) { const d = dayLabel(e.at); const g = out[out.length - 1]; if (g?.day === d) g.items.push(e); else out.push({ day: d, items: [e] }); }
    return out;
  }, [items]);
  const counts = log.data ? { refused: log.data.items.filter((e) => e.kind === 'refused').length, limited: log.data.items.filter((e) => e.kind === 'limited').length } : null;
  const blocks = lines.filter(isBlock);
  const block = minutesHe(blocks[0] ? blockMinutes(blocks[0]) : 1);
  const signIns = lines.filter((l) => l.what === SIGN_IN && l.ok).slice(0, 6);
  const what = (e: Line) => (e.what.startsWith('/') ? <>{e.whatHe} <bdi className="c-raw" dir="ltr">{e.what}</bdi></> : <bdi>{e.whatHe}</bdi>);
  if (wide) {
    const rows = log.data ? (filter === 'all' && !t ? withoutOpenings(items) : items) : null;
    const bad = counts ? counts.refused + counts.limited : 0;
    return (
      <Page group="גישה ואבטחה" title="יומן אבטחה" sub="בקשות שהשרת דחה, כתובות שנחסמו, וכל מה שנעשה בקונסולה: כניסות, מפתחות, מתגים ושחזורים"
        actions={<Btn icon="download" disabled={!items.length} onClick={() => excel(items)}>אקסל</Btn>}>
        <Toolbar end={<Search value={q} onChange={setQ} placeholder="חיפוש: אדם, מפתח או פעולה" width={280} />}>
          <Chips label="סוג" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.id, label: f.he }))} />
          <Chips label="תקופה" value={String(days)} onChange={(d) => setDays(Number(d))} options={['1', '7', '30'].map((d) => ({ value: d, label: d === '1' ? 'יממה' : `${d} ימים` }))} />
        </Toolbar>
        <Cols>
          <TableCard>
            <div className={log.loading && log.data ? 'da-old' : undefined}>
              <Table<Line> label="יומן אבטחה" rows={rows} rowKey={(l) => l.id} error={log.error && `לא הצלחנו לקרוא את היומן. ${log.error}`} retry={log.reload}
                empty={t ? 'לא נמצא כלום. נסו מילה אחרת או תקופה ארוכה יותר.' : 'אין כאן כלום לתקופה הזאת.'}
                columns={[
                  { key: 'at', head: 'מתי', cell: (l) => <span title={whenFull(l.at)}>{when(l.at)}</span>, width: 120, soft: true },
                  { key: 'who', head: 'מי', cell: (l) => l.whoHe, width: 180, strong: true },
                  { key: 'what', head: 'מה', cell: (l) => <span className="da-what" title={l.raw || undefined}>{l.whatHe}{l.why && ` · ${l.why}`}</span> },
                  { key: 'from', head: 'מאיפה', cell: (l) => l.from, width: 130, soft: true },
                  { key: 'tag', head: '', cell: (l) => { const x = tagOf(l); return x && <span title={l.kind === 'refused' ? DENY : undefined}><DTag tone={x.tone}>{x.he}</DTag></span>; }, width: 90, align: 'end' },
                ]} />
            </div>
          </TableCard>
          <Col width={360}>
            {counts ? <div title={DENY}><Summary icon="shield" tone={bad ? 'amber' : 'green'}
              title={bad ? [counts.refused ? many(counts.refused, 'בקשה אחת נדחתה', 'בקשות נדחו') : '', blocks.length ? many(blocks.length, 'כתובת אחת נחסמה', 'כתובות נחסמו') : counts.limited ? 'המכסה היומית נגמרה' : ''].filter(Boolean).join(', ') : 'לא נדחתה אף בקשה'}
              text={bad ? `${SPAN[days]}. אף אחת לא עברה.` : `${SPAN[days]}.`} /></div>
              : <DCard>{log.error ? <Failed text="הסיכום לא נטען." retry={log.reload} /> : <Skeleton lines={2} />}</DCard>}
            <DCard title={`כתובות שנחסמו ${PERIOD[days]}${log.data ? ` · ${blocks.length}` : ''}`}>
              {!log.data ? <Skeleton lines={2} /> : (
                <Facts style={{ marginTop: -4 }}>
                  {blocks.slice(0, 5).map((l) => <Fact key={l.id} label={when(l.at)}>{l.whoHe} · {l.why.replace(/ בזמן קצר$/, '')} · {freed(l)}</Fact>)}
                  {!blocks.length && <Fact label={PERIOD[days]}>לא נחסמה אף כתובת</Fact>}
                </Facts>
              )}
              <p className="da-small">חסימה אוטומטית נמשכת {block}. בקשה שנדחית לא עולה במכסה.</p>
            </DCard>
            <DCard title="כניסות לקונסולה">
              {!log.data ? <Skeleton lines={3} /> : (
                <div style={{ marginTop: -4 }}>
                  {signIns.map((l) => <Hist key={l.id} when={whenFull(l.at)}>{l.whoHe}</Hist>)}
                  {!signIns.length && <Hist when={PERIOD[days]}>לא נכנס אף אחד</Hist>}
                </div>
              )}
            </DCard>
          </Col>
        </Cols>
      </Page>
    );
  }
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">אבטחה</h1>
          <p className="c-sub">בקשות שהשרת דחה, כתובות שנחסמו על יותר מדי בקשות, וכל מה שנעשה מהקונסולה: כניסות, מפתחות, מתגים ושחזורים.</p>
        </div>
        <Button variant="neutral" icon="file" disabled={!items.length} onClick={() => excel(items)}>אקסל</Button>
      </div>
      {counts && (
        <Card pad="lg" className={log.loading ? 'c-health c-loading' : 'c-health'}>
          <span className={`c-state c-state--${counts.refused + counts.limited ? 'warn' : 'ok'}`} aria-hidden="true" />
          <div className="c-health__body">
            <b>{counts.refused + counts.limited ? `${many(counts.refused, 'בקשה אחת נדחתה', 'בקשות נדחו')}, ${many(counts.limited, 'כתובת אחת נחסמה', 'נחסמו')}` : 'לא נדחתה אף בקשה'}</b>
            <span className="c-soft">ב־{days === 1 ? 'יממה האחרונה' : `${days} הימים האחרונים`}. בקשה נדחית כשמפתח מנסה פעולה שאין לו הרשאה אליה או כשהמפתח בוטל.</span>
          </div>
        </Card>
      )}
      <Field label="חיפוש" labelHidden placeholder="חיפוש: אדם, מפתח או פעולה" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="c-filters">
        <ChipRow label="סוג">{FILTERS.map((f) => <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.he}</Chip>)}</ChipRow>
        <ChipRow label="תקופה">{[1, 7, 30].map((d) => <Chip key={d} selected={days === d} onClick={() => setDays(d)}>{d === 1 ? 'יממה' : `${d} ימים`}</Chip>)}</ChipRow>
      </div>
      {log.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את היומן. {log.error}</Card>}
      {log.loading && <p className="c-soft" role="status">טוען…</p>}
      {log.data && !items.length && !log.loading && <Card pad="md" className="c-soft">אין כאן כלום לתקופה הזאת.</Card>}
      <div className={log.loading ? 'c-stack c-loading' : 'c-stack'}>
        {groups.map((g) => (
          <Section key={g.day} title={g.day}>
            <ListCard>
              {g.items.map((e) => (
                <Row key={e.id} title={<><b>{e.whoHe}</b> · {what(e)}</>}
                  meta={<><span className="k-ltr">{hhmm(e.at)}</span>{e.why && <> · <span title={e.detail}>{e.why}</span></>}</>}
                  tags={<Tag tone={e.kind === 'console' && !e.ok ? 'urgent' : KIND[e.kind].tone}>{e.kind === 'console' && !e.ok ? 'נכשל' : KIND[e.kind].he}</Tag>} />
              ))}
            </ListCard>
          </Section>
        ))}
        {log.data && (
          <Section title={`כתובות שנחסמו ${PERIOD[days]} · ${blocks.length}`}>
            {!!blocks.length && <ListCard>{blocks.slice(0, 5).map((l) => <Row key={l.id} title={l.whoHe} meta={`${when(l.at)} · ${l.why} · ${freed(l)}`} />)}</ListCard>}
            <p className="c-note">חסימה אוטומטית נמשכת {block}. בקשה שנדחית לא עולה במכסה.</p>
          </Section>
        )}
        {!!signIns.length && <Section title="כניסות לקונסולה"><ListCard>{signIns.map((l) => <Row key={l.id} title={l.whoHe} meta={whenFull(l.at)} />)}</ListCard></Section>}
      </div>
    </>
  );
}
