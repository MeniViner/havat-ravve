// Small single-series charts for the console: columns (a value per day or month) and a funnel. One hue, no legend
// (the section title names the series), and the numbers also written out as text.
import { useRef, useState, type KeyboardEvent } from 'react';
import { fmt } from './shared';

/** Time runs left to right (old → now) unless `rtl` (e.g. weekdays, read like a Hebrew calendar).
 *  Every column is a button: a tap (or the keyboard, or the mouse passing over) shows its line under the chart, so the
 *  numbers work on a phone too. Until one is picked, the line shows the latest column (`pick="last"`) or the largest. */
export function Columns({ data, label, height = 120, rtl, pick = 'last' }: { data: { key: string; value: number; tip: string; axis?: string }[]; label: string; height?: number; rtl?: boolean; pick?: 'last' | 'max' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fallback = pick === 'max' ? data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0) : data.length - 1;
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const cols = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = sel !== null && sel < data.length ? sel : fallback;
  const shown = hover ?? chosen;
  const move = (e: KeyboardEvent) => {
    // the plot is laid out left to right, or right to left for `rtl`: the arrow goes where the eye goes
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? data.length - 1 : step ? Math.min(data.length - 1, Math.max(0, chosen + step)) : null;
    if (to === null) return;
    e.preventDefault();
    setSel(to);
    cols.current[to]?.focus();
  };
  if (!data.length) return null;
  return (
    <figure className="c-cols" aria-label={label}>
      <div className="c-cols__plot" style={{ height, direction: rtl ? 'rtl' : undefined }} onKeyDown={move} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button key={d.key} ref={(el) => { cols.current[i] = el; }} type="button" className="c-cols__col" title={d.tip} aria-label={d.tip}
            aria-pressed={i === chosen} tabIndex={i === chosen ? 0 : -1} onClick={() => setSel(i)} onMouseEnter={() => setHover(i)}>
            <span className="c-cols__bar" style={{ height: `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="c-cols__axis" aria-hidden="true" style={rtl ? { direction: 'rtl' } : undefined}>
        {data.map((d) => <span key={d.key}>{d.axis || ''}</span>)}
      </div>
      <figcaption className="c-cols__tip" aria-live="polite">{data[shown]?.tip}</figcaption>
    </figure>
  );
}

/** Steps of a process, each a bar of its count, with the share of the first step. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value || 0);
  return (
    <ol className="c-funnel">
      {steps.map((s) => (
        <li key={s.label} className="c-funnel__step" title={`${s.label}: ${fmt(s.value)}`}>
          <span className="c-funnel__label">{s.label}</span>
          <span className="c-funnel__track"><span className="c-funnel__bar" style={{ width: `${Math.max(s.value ? 2 : 0, (s.value / top) * 100)}%` }} /></span>
          <span className="c-funnel__value"><b className="k-num">{fmt(s.value)}</b>{steps[0] !== s && steps[0].value > 0 && <span className="c-soft"> · {Math.round((s.value / steps[0].value) * 100)}%</span>}</span>
        </li>
      ))}
    </ol>
  );
}
