// אבטחה: who was refused, who was slowed down for too many requests, and everything done from the console
// (sign-ins, keys, restores), newest first.
import { useMemo, useState } from 'react';
import { Card, Chip, ChipRow, ListCard, Row, Tag } from '../app/v2/kit';
import { dayName, ddmm, daysFromToday, hhmm } from '../app/v2/format';
import { Section, useLoad } from './shared';
import { source, type SecurityEvent } from './source';

type Filter = 'all' | SecurityEvent['kind'];
const FILTERS: { id: Filter; he: string }[] = [{ id: 'all', he: 'הכל' }, { id: 'refused', he: 'נדחו' }, { id: 'limited', he: 'נחסמו' }, { id: 'console', he: 'בקונסולה' }];
const KIND: Record<SecurityEvent['kind'], { he: string; tone: 'urgent' | 'warm' | 'neutral' }> = {
  refused: { he: 'נדחה', tone: 'urgent' }, limited: { he: 'נחסם', tone: 'warm' }, console: { he: 'קונסולה', tone: 'neutral' },
};
const dayLabel = (iso: string) => { const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(iso)} ${ddmm(iso)}`; };

export function SecurityScreen() {
  const [days, setDays] = useState(7);
  const log = useLoad(() => source.security(days), [days]);
  const [filter, setFilter] = useState<Filter>('all');
  const items = (log.data?.items || []).filter((e) => filter === 'all' || e.kind === filter);
  const groups = useMemo(() => {
    const out: { day: string; items: SecurityEvent[] }[] = [];
    for (const e of items) { const d = dayLabel(e.at); const g = out[out.length - 1]; if (g?.day === d) g.items.push(e); else out.push({ day: d, items: [e] }); }
    return out;
  }, [items]);
  const counts = log.data ? { refused: log.data.items.filter((e) => e.kind === 'refused').length, limited: log.data.items.filter((e) => e.kind === 'limited').length } : null;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">אבטחה</h1>
          <p className="c-sub">בקשות שהשרת דחה, כתובות שנחסמו על יותר מדי בקשות, וכל מה שנעשה מהקונסולה: כניסות, מפתחות ושחזורים.</p>
        </div>
      </div>
      {counts && (
        <Card pad="lg" className="c-health">
          <span className={`c-state c-state--${counts.refused + counts.limited ? 'warn' : 'ok'}`} aria-hidden="true" />
          <div className="c-health__body">
            <b>{counts.refused + counts.limited ? `${counts.refused} בקשות נדחו, ${counts.limited} נחסמו` : 'לא נדחתה אף בקשה'}</b>
            <span className="c-soft">ב־{days === 1 ? 'יממה האחרונה' : `${days} הימים האחרונים`}. בקשה נדחית כשמפתח מנסה פעולה שאין לו הרשאה אליה או כשהמפתח בוטל.</span>
          </div>
        </Card>
      )}
      <div className="c-filters">
        <ChipRow label="סוג">{FILTERS.map((f) => <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.he}</Chip>)}</ChipRow>
        <ChipRow label="תקופה">{[1, 7, 30].map((d) => <Chip key={d} selected={days === d} onClick={() => setDays(d)}>{d === 1 ? 'יממה' : `${d} ימים`}</Chip>)}</ChipRow>
      </div>
      {log.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את היומן. {log.error}</Card>}
      {log.data && !items.length && <Card pad="md" className="c-soft">אין כאן כלום לתקופה הזאת.</Card>}
      {groups.map((g) => (
        <Section key={g.day} title={g.day}>
          <ListCard>
            {g.items.map((e, i) => (
              <Row key={e.at + i} title={<><b>{e.who}</b> · <bdi>{e.what}</bdi></>} meta={<><span className="k-ltr">{hhmm(e.at)}</span>{e.detail && <> · {e.detail}</>}</>}
                tags={<Tag tone={e.kind === 'console' && !e.ok ? 'urgent' : KIND[e.kind].tone}>{e.kind === 'console' && !e.ok ? 'נכשל' : KIND[e.kind].he}</Tag>} />
            ))}
          </ListCard>
        </Section>
      ))}
    </>
  );
}
