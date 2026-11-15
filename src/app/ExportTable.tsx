import { useMemo, useState } from 'react';
import { downloadCsv } from './data';
import { Btn, Empty, Field, Input, Sheet, Th, useSort } from './ui';
import './export-table.css';

type ExportData = {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
};

export function ExportActions({ getData, downloadLabel = 'אקסל' }: { getData: () => ExportData; downloadLabel?: string }) {
  const [preview, setPreview] = useState<ExportData | null>(null);
  const download = () => {
    const { filename, headers, rows } = getData();
    downloadCsv(filename, headers, rows);
  };

  return (
    <div className="export-actions">
      <Btn kind="ghost" size="sm" icon="download" onClick={download}>{downloadLabel}</Btn>
      <Btn kind="ghost" size="sm" onClick={() => setPreview(getData())}>צפייה בטבלה</Btn>
      <Sheet open={preview !== null} onClose={() => setPreview(null)} title={preview?.filename.replace(/\.csv$/i, '')} panelClassName="export-sheet">
        {preview && <ExportTable data={preview} />}
      </Sheet>
    </div>
  );
}

function ExportTable({ data }: { data: ExportData }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => data.rows.map((cells, index) => ({ cells, index })), [data.rows]);
  const { sort, toggle, apply } = useSort<(typeof rows)[number]>('');
  const term = query.trim().toLowerCase();
  const matched = term ? rows.filter(({ cells }) => cells.some((value) => String(value).toLowerCase().includes(term))) : rows;
  const visible = sort.key ? apply(matched, ({ cells }, column) => cells[Number(column)]) : matched;

  return (
    <>
      <Field>
        <Input type="search" aria-label="חיפוש בטבלה" placeholder="חיפוש בטבלה" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field>
      <div className="export-table-scroll" role="region" aria-label="נתוני הייצוא" tabIndex={0} dir="rtl">
        <table>
          <thead>
            <tr>{data.headers.map((caption, index) => <Th key={index} k={String(index)} sort={sort} onSort={toggle}>{caption}</Th>)}</tr>
          </thead>
          <tbody>
            {visible.map(({ cells, index }) => (
              <tr key={index}>{cells.map((value, column) => <td key={column}><bdi>{value}</bdi></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <Empty title={term ? 'לא נמצאו התאמות' : 'אין שורות לייצוא'} />}
    </>
  );
}
