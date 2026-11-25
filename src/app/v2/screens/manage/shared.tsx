// Small pieces shared by the manage screens: SPA links, loading / not-found frames, link cards, the history sheet, and the
// old "אקסל" button (still used by other areas until they move to useTableView in v2/patterns.tsx).
import { useMemo, useState, type ReactNode } from 'react';
import { href } from '../../../router';
import { AppScreen, go } from '../../core';
import { Button, EmptyState, ListCard, Row, SearchField, Sheet, TopBar } from '../../kit';
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

/** A link row in its own bordered card (Q1 "כל הפעילות", Q13 "היסטוריה", Q23 "נוספו מראש ועוד לא נכנסו"). */
export function LinkCard({ title, meta, path, onClick }: { title: ReactNode; meta?: ReactNode; path?: string; onClick?: () => void }) {
  return (
    <ListCard aria-label={typeof title === 'string' ? title : undefined}>
      <Row minHeight={52} {...(path ? lnk(path) : { onClick })} title={title} meta={meta} />
    </ListCard>
  );
}

export type HistoryLine = { key: string; title: ReactNode; meta: ReactNode };
/** "היסטוריה" behind ⋯ or a row (Q6, Q13, N2): the record's log lines in a sheet, newest first. */
export function HistorySheet({ open, onClose, title = 'היסטוריה', lines }: { open: boolean; onClose: () => void; title?: string; lines: HistoryLine[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ListCard aria-label={title}>
        {lines.length ? lines.map((l) => <Row key={l.key} minHeight={50} title={<span style={{ fontWeight: 500 }}>{l.title}</span>} meta={l.meta} />)
          : <Row minHeight={50} title={<span className="k-soft" style={{ fontWeight: 400 }}>עוד אין שינויים</span>} />}
      </ListCard>
    </Sheet>
  );
}

type Cell = string | number | null | undefined;
/** Outline "אקסל" button (old M8, M10, N3): a CSV that Excel opens, with Hebrew intact; "צפייה בטבלה" opens the same rows in a sheet.
 *  The manage screens use useTableView (Q9, ⋯ items); this stays for the screens of other areas that still import it. */
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
