// Small pieces every console screen uses: loading a value, the notice at the bottom, dates in words.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Toast } from '../app/v2/kit';
import { ddmm, hhmm, daysFromToday } from '../app/v2/format';
import { errorText } from './source';

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try { const v = await load(); if (n === seq.current) { setData(v); setError(null); } }
    catch (e) { if (n === seq.current) setError(errorText(e)); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export type NoticeState = { text: ReactNode; tone: 'info' | 'alert' } | null;
export function useNotice() {
  const [notice, setNotice] = useState<NoticeState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: ReactNode, tone: 'info' | 'alert' = 'info') => {
    clearTimeout(timer.current);
    setNotice({ text, tone });
    timer.current = setTimeout(() => setNotice(null), tone === 'alert' ? 7000 : 3500);
  }, []);
  const view = notice && (
    <div className="c-notice">
      <Toast tone={notice.tone} actions={notice.tone === 'alert' ? [{ label: 'הבנתי', onClick: () => setNotice(null) }] : []}>{notice.text}</Toast>
    </div>
  );
  return { show, view };
}

/** "לפני 3 דקות", "לפני שעתיים", "אתמול 14:05", "12.11" */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (ms < 0) return until(iso);
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'עכשיו';
  if (min === 1) return 'לפני דקה';
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  if (h === 1) return 'לפני שעה';
  if (h === 2) return 'לפני שעתיים';
  if (h < 12) return `לפני ${h} שעות`;
  const d = daysFromToday(iso);
  if (d === 0) return `היום ${hhmm(iso)}`;
  if (d === -1) return `אתמול ${hhmm(iso)}`;
  return ddmm(iso);
}
/** "עוד 18 שעות", "עד 12.2" */
export function until(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return ago(iso);
  const h = Math.round(ms / 3600_000);
  if (h < 1) return 'עוד פחות משעה';
  if (h === 1) return 'עוד שעה';
  if (h < 48) return `עוד ${h} שעות`;
  return `עד ${ddmm(iso)}`;
}
export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('he-IL'));

export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="c-section">
      <div className="c-section__head"><h2 className="c-section__title">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}
