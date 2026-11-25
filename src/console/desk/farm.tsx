// What the three farm screens (סטטיסטיקות, ביקורים ושימוש, כסף ואירועים) share on a computer.
import { useState, type ReactNode, type CSSProperties, type FocusEvent } from 'react';
import { Chips, DCard, Skeleton, SkeletonTiles, VBars, type BarDatum } from './desk';

export const PERIODS = [7, 30, 90, 365] as const;
export const periodText = (d: number) => (d === 7 ? 'שבוע' : d === 30 ? 'חודש' : d === 90 ? '3 חודשים' : 'שנה');
/** "בחודש האחרון", "ב־3 החודשים האחרונים", "בשנה האחרונה" */
export const inLast = (d: number) => (d === 7 ? 'בשבוע האחרון' : d === 30 ? 'בחודש האחרון' : d === 90 ? 'ב־3 החודשים האחרונים' : 'בשנה האחרונה');
/** "בחודש", "ב־3 חודשים" (short, under a number) */
export const inPeriod = (d: number) => (d === 90 ? 'ב־3 חודשים' : `ב${periodText(d)}`);

export const PeriodChips = ({ days, onChange, periods = PERIODS }: { days: number; onChange: (d: number) => void; periods?: readonly number[] }) =>
  <Chips label="תקופה" value={String(days)} onChange={(v) => onChange(Number(v))} options={periods.map((d) => ({ value: String(d), label: periodText(d) }))} />;

/** Whether this column's date is written under it: about six along the chart, and always the last one. */
export function axisAt(i: number, n: number) {
  const step = n <= 7 ? 1 : Math.ceil(n / 5);
  return i === n - 1 || (i % step === 0 && n - 1 - i > step / 2);
}

/** `aside`: what the card says about this column (the tooltip's text unless given). */
export type FarmBar = BarDatum & { aside?: string };
/** A card of columns. The line beside the title tells the column under the mouse (or the one in focus), else `aside`. */
export function BarsCard({ title, aside, data, label, height = 120, months, style }: { title: ReactNode; aside?: string; data: FarmBar[]; label: string; height?: number; months?: boolean; style?: CSSProperties }) {
  const [at, setAt] = useState<string | null>(null);
  const cur = at === null ? null : data.find((d) => d.key === at);
  const onBlur = (e: FocusEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAt(null); };
  return (
    <DCard title={title} style={style} aside={<span className="df-aside" title={cur?.tip} aria-live="polite">{cur ? cur.aside ?? cur.tip : aside}</span>}>
      <div className={data.length >= 28 ? 'df-bars df-bars--days' : months ? 'df-bars df-bars--months' : 'df-bars'} onMouseLeave={() => setAt(null)} onBlur={onBlur}>
        <VBars data={data} label={label} height={height} gap={data.length > 60 ? 1 : 4} onPick={setAt} />
      </div>
    </DCard>
  );
}

/** Placeholders in the page's own shape: a row of tiles, a chart beside a side column, two cards. */
export function FarmSkeleton({ tiles = 6, side = 360 }: { tiles?: number; side?: number }) {
  return (
    <>
      {tiles > 0 && <SkeletonTiles n={tiles} />}
      <div className="df-row" aria-busy="true">
        <DCard style={{ flex: 1, minHeight: 190 }}><Skeleton lines={6} /></DCard>
        <DCard style={{ flex: 'none', width: side, minHeight: 190 }}><Skeleton lines={6} /></DCard>
      </div>
      <div className="df-row"><DCard style={{ flex: 1, minHeight: 170 }}><Skeleton lines={5} /></DCard><DCard style={{ flex: 1, minHeight: 170 }}><Skeleton lines={5} /></DCard></div>
    </>
  );
}
