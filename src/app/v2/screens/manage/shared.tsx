// Small pieces shared by the manage screens: SPA links, loading / not-found frames, the "אקסל" button, drag-to-reorder rows.
import { useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { href } from '../../../router';
import { AppScreen, go } from '../../core';
import { Button, EmptyState, Icon, SearchField, Sheet, TopBar } from '../../kit';
import { downloadCsv } from '../../data/manage';
import './manage.css';

/** Props for a kit control that navigates inside the app: a real href (long-press, new tab) and an SPA click. */
export const lnk = (path: string) => ({
  href: href(path),
  onClick: (e: React.MouseEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault(); go(path);
  },
});

/** While the first snapshot loads (in demo this is instant). */
export function Loading({ back }: { back?: { label: string; path: string } }) {
  return (
    <AppScreen variant="detail" gap={10}>
      {back && <TopBar back={{ label: back.label, ...lnk(back.path) }} />}
      <EmptyState variant="fill" title="טוען…" />
    </AppScreen>
  );
}
/** The record is gone (deleted, or a wrong link). */
export function NotFound({ back, title }: { back: { label: string; path: string }; title: string }) {
  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={{ label: back.label, ...lnk(back.path) }} />
      <EmptyState variant="fill" icon="search" title={title} text="אולי נמחק, או שהקישור לא נכון." />
    </AppScreen>
  );
}

type Cell = string | number | null | undefined;
/** Outline "אקסל" button (M8, M10, N3): a CSV that Excel opens, with Hebrew intact; "צפייה בטבלה" opens the same rows in a sheet. */
export function ExcelButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: () => Cell[][] }) {
  const [preview, setPreview] = useState<(string | number)[][] | null>(null);
  const clean = () => rows().map((r) => r.map((c): string | number => (c === null || c === undefined ? '' : c)));
  return (
    <span className="manage-excel">
      <Button variant="quiet" onClick={() => setPreview(clean())}>צפייה בטבלה</Button>
      <Button variant="outline" icon="download" iconSize={16} onClick={() => downloadCsv(filename, headers, clean())}>אקסל</Button>
      <Sheet open={preview !== null} onClose={() => setPreview(null)} title={filename.replace(/\.csv$/i, '')} className="manage-table-sheet">
        {preview && <ExportTable headers={headers} rows={preview} />}
      </Sheet>
    </span>
  );
}

/** The export rows as a table: search across every cell, tap a heading to sort (again to reverse). */
export function ExportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const term = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = rows.map((cells, i) => ({ cells, i })).filter(({ cells }) => !term || cells.some((v) => String(v).toLowerCase().includes(term)));
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const x = a.cells[sort.col] ?? '', y = b.cells[sort.col] ?? '';
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he', { numeric: true });
      return r * sort.dir;
    });
  }, [rows, term, sort]);
  const toggle = (col: number) => setSort((s) => (s && s.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  return (
    <div className="manage-table">
      <SearchField size="sm" label="חיפוש בטבלה" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="manage-table__scroll" role="region" aria-label="נתוני הייצוא" tabIndex={0}>
        <table>
          <thead>
            <tr>{headers.map((h, c) => (
              <th key={c} aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => toggle(c)}>{h}{sort?.col === c && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}</button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.map(({ cells, i }) => <tr key={i}>{cells.map((v, c) => <td key={c}><bdi>{v}</bdi></td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {!visible.length && <EmptyState variant="card" title={term ? 'לא נמצאו התאמות' : 'אין שורות לייצוא'} />}
    </div>
  );
}

/** Plain link row of the manage root: 44 high, 15px, soft chevron (M1 "הודעות לצוות", "כל הפעילות בחווה"). */
export function PlainLink({ path, children, meta }: { path: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <a className="manage-plainlink" {...lnk(path)}>
      <span className="manage-plainlink__text"><span>{children}</span>{meta !== undefined && <span className="manage-plainlink__meta">{meta}</span>}</span>
      <span className="manage-plainlink__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
    </a>
  );
}

/**
 * Drag-to-reorder list rows (G1, G2, G3). The grip starts a pointer drag; rows shift while dragging; drop commits.
 * Keyboard: the grip is a button, arrow up/down moves the row one place.
 */
export function useReorder<T>(items: T[], onChange: (next: T[]) => void) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const start = useRef<{ y: number; h: number; from: number } | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items]; const [x] = next.splice(from, 1); next.splice(to, 0, x); onChange(next);
  };
  const grip = (i: number, label: string) => ({
    'aria-label': `גרירה לשינוי הסדר: ${label}`,
    className: 'manage-grip',
    type: 'button' as const,
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
      const li = (e.currentTarget.closest('li') as HTMLElement | null);
      start.current = { y: e.clientY, h: li?.offsetHeight || 60, from: i };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: i, to: i, dy: 0 });
    },
    onPointerMove: (e: RPointerEvent<HTMLButtonElement>) => {
      const s = start.current; if (!s) return;
      const dy = e.clientY - s.y;
      const to = Math.max(0, Math.min(items.length - 1, s.from + Math.round(dy / s.h)));
      setDrag({ from: s.from, to, dy });
    },
    onPointerUp: () => {
      const s = start.current; start.current = null;
      if (s && drag) move(s.from, drag.to);
      setDrag(null);
    },
    onPointerCancel: () => { start.current = null; setDrag(null); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
    },
  });
  /** Inline style for row i while a drag is going on. */
  const rowStyle = (i: number): React.CSSProperties | undefined => {
    if (!drag || !start.current) return undefined;
    const h = start.current.h;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 2, background: 'var(--surface)', boxShadow: '0 2px 10px rgba(20,23,27,.15)' };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-h}px)` };
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return { transform: `translateY(${h}px)` };
    return undefined;
  };
  return { grip, rowStyle, dragging: !!drag };
}

/** The grip icon inside the button made by useReorder().grip. */
export const Grip = () => <Icon name="drag" size={20} />;
