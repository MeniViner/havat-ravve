// אבטחה: who was refused, who was slowed down for too many requests, and everything done from the console
// (sign-ins, keys, restores), newest first. The server's reasons come in English and requests by their path: here
// they read in Hebrew, with the original kept small (and in the tooltip) for whoever needs it.
import { useMemo, useState } from 'react';
import { Card, Chip, ChipRow, ListCard, Row, Tag } from '../app/v2/kit';
import { dayName, ddmm, daysFromToday, hhmm } from '../app/v2/format';
import { many, Section, useLoad } from './shared';
import { source, type CatalogOp, type SecurityEvent } from './source';

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
  [/may not|not allowed|scope|only managers|permission/i, 'למפתח אין הרשאה לפעולה הזאת'],
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
  return hit?.he || null;
}

export function SecurityScreen() {
  const [days, setDays] = useState(7);
  const log = useLoad(() => source.security(days), [days]);
  const [filter, setFilter] = useState<Filter>('all');
  const needsCatalog = !!log.data?.items.some((e) => e.what.startsWith('/'));
  const cat = useLoad(() => (needsCatalog ? source.catalog() : Promise.resolve(null)), [needsCatalog]);
  const items = (log.data?.items || []).filter((e) => filter === 'all' || e.kind === filter);
  const groups = useMemo(() => {
    const out: { day: string; items: SecurityEvent[] }[] = [];
    for (const e of items) { const d = dayLabel(e.at); const g = out[out.length - 1]; if (g?.day === d) g.items.push(e); else out.push({ day: d, items: [e] }); }
    return out;
  }, [items]);
  const counts = log.data ? { refused: log.data.items.filter((e) => e.kind === 'refused').length, limited: log.data.items.filter((e) => e.kind === 'limited').length } : null;
  const what = (e: SecurityEvent) => {
    if (!e.what.startsWith('/')) return <bdi>{e.what}</bdi>;
    const he = opName(e.what, cat.data);
    return <>{he || 'בקשה לשרת'} <bdi className="c-raw" dir="ltr">{e.what}</bdi></>;
  };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">אבטחה</h1>
          <p className="c-sub">בקשות שהשרת דחה, כתובות שנחסמו על יותר מדי בקשות, וכל מה שנעשה מהקונסולה: כניסות, מפתחות ושחזורים.</p>
        </div>
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
              {g.items.map((e, i) => (
                <Row key={e.at + i} title={<><b>{e.who}</b> · {what(e)}</>}
                  meta={<><span className="k-ltr">{hhmm(e.at)}</span>{e.detail && <> · <span title={e.detail}>{reasonText(e.detail)}</span></>}</>}
                  tags={<Tag tone={e.kind === 'console' && !e.ok ? 'urgent' : KIND[e.kind].tone}>{e.kind === 'console' && !e.ok ? 'נכשל' : KIND[e.kind].he}</Tag>} />
              ))}
            </ListCard>
          </Section>
        ))}
      </div>
    </>
  );
}
