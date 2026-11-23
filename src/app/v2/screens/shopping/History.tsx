// S8-History: what was bought (found and ordered too). Search, list filter, groups (today / this week / earlier) and "שוב" to
// add it again. What was bought today is folded into one row on the shopping root (Q22) and lands here: swipe a row of today
// right to put it back on the list (the root's old "נקנה היום" / "נמצא החודש" card did that; found items: this month).
import { useMemo, useState } from 'react';
import { AppScreen, useToast } from '../../core';
import { BackLink, Button, Chip, ChipRow, EmptyState, ListCard, PageTitle, Row, SearchField, TextLink } from '../../kit';
import { dayName, ddmm, hhmm, keyOf } from '../../format';
import { back } from '../../../router';
import { todayKey } from '../../../clock';
import type { ScreenProps } from '../../ctx';
import type { ShoppingItem } from '../../../types';
import { againShopItem, first, historyGroups, listLabel, useShopping, type HistoryFilter, type HistoryGroup } from '../../data/shopping';
import { useMarkBought } from './common';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'הכל' }, { value: 'super', label: 'סופר' }, { value: 'building', label: 'בניין' }, { value: 'online', label: 'אינטרנט' },
  { value: 'giveaway', label: 'מחפשים' },
];
const SHOWN = 3;

export function ShopHistoryScreen({ ctx }: ScreenProps) {
  const toast = useToast();
  const { history, loading } = useShopping();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [more, setMore] = useState<Set<string>>(new Set());
  const today = todayKey();
  const { unmark } = useMarkBought(ctx.actor);
  const groups = useMemo(() => historyGroups(history, filter, q, today), [history, filter, q, today]);
  const when = (g: HistoryGroup, i: ShoppingItem) => (g.key === 'today' ? hhmm(i.boughtAt!) : g.key === 'week' ? dayName(i.boughtAt!) : ddmm(i.boughtAt!));
  const again = (i: ShoppingItem) => {
    againShopItem(ctx.actor, i).catch((e) => toast.show({ text: `לא נשמר. ${(e as Error)?.message || ''}`.trim(), tone: 'error', actions: [{ label: 'הבנתי', onClick: () => {} }] }));
    toast.show({ text: `נוסף ל${listLabel(i.category)}: ${i.title}`, duration: 2500 });
  };
  return (
    <AppScreen variant="detail">
      <div className="k-topbar"><BackLink label="קניות" onClick={() => back('/shopping')} /></div>
      <PageTitle>מה נקנה</PageTitle>
      <SearchField label="חיפוש בקניות" placeholder="חיפוש: פריט או שם" size="sm" className="shopping-search" value={q} onChange={(e) => setQ(e.target.value)} />
      <ChipRow label="רשימה">
        {FILTERS.map((f) => <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
      </ChipRow>
      {groups.map((g) => {
        const open = g.key === 'today' || more.has(g.key);
        const rows = open ? g.items : g.items.slice(0, SHOWN);
        const hidden = g.items.length - rows.length;
        return (
          <ListCard key={g.key} className="shopping-plain" title={g.title} count={g.items.length} tone="quiet"
            end={hidden > 0 ? <TextLink onClick={() => setMore((s) => new Set(s).add(g.key))}>{`עוד ${hidden}`}</TextLink> : undefined}>
            {rows.map((i) => (
              <Row key={i.id} title={i.title}
                meta={[i.qty, first(i.boughtBy?.name || ''), when(g, i), filter === 'all' && i.category !== 'super' ? listLabel(i.category) : ''].filter(Boolean).join(' · ')}
                actions={<Button variant="outline" icon="plus" iconSize={16} className="shopping-again" onClick={() => again(i)}>שוב</Button>}
                swipe={g.key === 'today' || (i.category === 'giveaway' && keyOf(i.boughtAt!).slice(0, 7) === today.slice(0, 7)) ? { right: { label: 'להחזיר', icon: 'back', tone: 'done', onAction: () => unmark(i) } } : undefined} />
            ))}
          </ListCard>
        );
      })}
      {/* the list reads the latest 400 (useShopping): say so, as the old history did */}
      {history.length >= 400 && <p className="shopping-cap">מוצגות הרשומות האחרונות בלבד. לתקופה ארוכה יותר: דוחות, במסך הניהול.</p>}
      {!loading && groups.length === 0 && <EmptyState icon="search" title={q ? 'לא נמצא כלום' : 'עוד לא נקנה כלום'} text={q ? 'אפשר לחפש בשם אחר או לבחור "הכל".' : 'מה שמסמנים כנקנה יופיע כאן.'} />}
    </AppScreen>
  );
}
