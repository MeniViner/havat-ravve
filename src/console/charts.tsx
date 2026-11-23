// Small single-series charts for the console: columns (a value per day or month) and a funnel. One hue, no legend
// (the section title names the series), a title tooltip on every mark, and the numbers also written out as text.
import { fmt } from './shared';

/** Time runs left to right (old → now) unless `rtl` (e.g. weekdays, read like a Hebrew calendar). */
export function Columns({ data, label, height = 120, rtl }: { data: { key: string; value: number; tip: string; axis?: string }[]; label: string; height?: number; rtl?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="c-cols" aria-label={label}>
      <div className="c-cols__plot" style={{ height, direction: rtl ? 'rtl' : undefined }}>
        {data.map((d) => (
          <span key={d.key} className="c-cols__col" title={d.tip}>
            <span className="c-cols__bar" style={{ height: `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="c-cols__axis" aria-hidden="true" style={rtl ? { direction: 'rtl' } : undefined}>
        {data.map((d) => <span key={d.key}>{d.axis || ''}</span>)}
      </div>
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
