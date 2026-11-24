// Small pieces every console screen uses: loading a value, the notice at the bottom, dates in words.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Toast } from '../app/v2/kit';
import { ddmm, hhmm, daysFromToday } from '../app/v2/format';
import { nowMs } from '../app/clock';
import { errorText, source } from './source';
import { fieldLabel } from './labels';

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
  const ms = nowMs() - Date.parse(iso);
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
  const ms = Date.parse(iso) - nowMs();
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

/** A queue line: what it is, why it waits, and its actions (under the text on a phone, beside it on a wide screen). */
export function QRow({ title, meta, tag, children }: { title: ReactNode; meta: ReactNode; tag: ReactNode; children: ReactNode }) {
  return (
    <div className="c-qrow">
      <div className="c-qrow__text"><div className="c-qrow__title">{title} <span className="c-qrow__tag">{tag}</span></div><div className="c-qrow__meta">{meta}</div></div>
      <div className="c-qrow__actions">{children}</div>
    </div>
  );
}

/** "בקשה אחת" / "3 בקשות": the one form for 1, the number and the plural for anything else. */
export const many = (n: number, one: string, other: string) => (n === 1 ? one : `${fmt(n)} ${other}`);

/** A link out of the console (to the app, the site editor, the full log). In the demo it stays in the demo. */
export const outHref = (path: string) => (source.demo ? `${path}${path.includes('?') ? '&' : '?'}${path.startsWith('/app') ? 'demo=owner' : 'demo'}` : path);

/** A stored field by its Hebrew name, with the stored name small beside it; a field we have no name for stays as stored. */
export function FieldName({ k }: { k: string }) {
  const he = fieldLabel(k);
  if (!he) return <bdi className="k-ltr" dir="ltr">{k}</bdi>;
  return <span className="c-fname">{he} <bdi className="c-fname__raw" dir="ltr">{k}</bdi></span>;
}
