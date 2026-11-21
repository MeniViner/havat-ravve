// C2-Search: one search over what this person may read (client-side over loaded lists).
// Volunteers: tasks, events, shopping, places. Managers and owners also people, visits and money.
import { useMemo, useState } from 'react';
import { AppScreen, go } from '../../core';
import { TopBar, SearchField, ChipRow, Chip, ListCard, Row, Avatar, Tag, IconTile, EmptyState, TextLink, type IconName } from '../../kit';
import { back } from '../../../router';
import type { ScreenProps } from '../../ctx';
import { useSearchData, searchAll, type Hit, type SearchKind } from '../../data/system';
import './system.css';

type Filter = 'all' | 'people' | 'tasks' | 'events' | 'shopping';
const SECTIONS: { kind: SearchKind; title: string; icon?: IconName; filter: Filter }[] = [
  { kind: 'people', title: 'אנשים', filter: 'people' },
  { kind: 'visits', title: 'ביקורים', icon: 'pin', filter: 'all' },
  { kind: 'tasks', title: 'משימות', icon: 'tasks', filter: 'tasks' },
  { kind: 'events', title: 'אירועים', icon: 'calendar', filter: 'events' },
  { kind: 'shopping', title: 'קניות', icon: 'cart', filter: 'shopping' },
  { kind: 'places', title: 'מקומות', icon: 'pin', filter: 'all' },
];

export function SearchScreen({ ctx, params }: ScreenProps) {
  const [q, setQ] = useState(params.q || '');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<SearchKind[]>([]);
  const data = useSearchData(ctx);
  const hits = useMemo(() => searchAll(ctx, data, q), [ctx, data, q]);
  const byKind = (k: SearchKind) => hits.filter((h) => h.kind === k);
  const chips: { value: Filter; label: string }[] = [
    { value: 'all', label: 'הכל' },
    ...(ctx.manager ? [{ value: 'people' as const, label: 'אנשים' }] : []),
    { value: 'tasks', label: 'משימות' }, { value: 'events', label: 'אירועים' }, { value: 'shopping', label: 'קניות' },
  ];
  const countOf = (f: Filter) => (f === 'all' ? hits.length : hits.filter((h) => SECTIONS.find((s) => s.kind === h.kind)?.filter === f).length);
  const shown = SECTIONS.filter((s) => (filter === 'all' || s.filter === filter) && byKind(s.kind).length);
  return (
    <AppScreen variant="root" gap={10}>
      <TopBar className="system-pull" back={{ label: 'חזרה', onClick: () => back('/tasks') }} />
      <SearchField label="חיפוש בכל האפליקציה" active autoFocus value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      <ChipRow label="סוג תוצאה">
        {chips.map((c) => <Chip key={c.value} selected={filter === c.value} onClick={() => setFilter(c.value)}>{c.label}{filter === c.value && q.trim() ? ` · ${countOf(c.value)}` : ''}</Chip>)}
      </ChipRow>
      {shown.map((s) => {
        const list = byKind(s.kind);
        // under "הכל" each group shows its first 3; "עוד N" opens the rest
        const cut = filter === 'all' && !open.includes(s.kind) && list.length > 3;
        const more = cut ? <TextLink onClick={() => (s.filter === 'all' ? setOpen((o) => [...o, s.kind]) : setFilter(s.filter))}>עוד {list.length - 3}</TextLink> : undefined;
        return (
          <ListCard key={s.kind} title={s.title} count={list.length} end={more}>
            {list.slice(0, cut ? 3 : 50).map((h) => <HitRow key={h.kind + h.id} h={h} icon={s.icon} />)}
          </ListCard>
        );
      })}
      {q.trim() && !shown.length && !data.loading && (
        <EmptyState icon="search" title="לא נמצא" text={ctx.manager ? 'אפשר לחפש שם, טלפון, משימה, אירוע או קנייה' : 'אפשר לחפש משימה, אירוע, קנייה או מקום'} />
      )}
    </AppScreen>
  );
}

function HitRow({ h, icon }: { h: Hit; icon?: IconName }) {
  const tag = h.tag ? <Tag tone={h.tag.tone}>{h.tag.text}</Tag> : undefined;
  if (h.kind === 'people') return <Row leading={<Avatar name={h.initials} size={32} className="system-hit-avatar" />} title={h.title} tags={tag} meta={h.meta} onClick={() => go(h.href)} />;
  return <Row minHeight={58} leading={<IconTile icon={icon || 'file'} />} title={h.title} tags={tag} meta={h.meta || undefined} onClick={() => go(h.href)} />;
}
