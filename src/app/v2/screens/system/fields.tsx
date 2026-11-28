// The configurable registration questions (settings.registrationFields) as v2 fields: C13 (my details) and C9 (first entry).
// The same questions and rules as the old RegistrationFields.tsx; a required question carries " *" as it did.
import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { now } from '../../../clock';
import { CheckboxBox, Field, ChoiceGroup } from '../../kit';
import type { RegistrationField } from '../../../types';
import { href } from '../../../router';
import { answerOf } from '../../data/system';
import './registrationTerms.css';

export function RegistrationQuestions({ questions, answers, onChange, missing = [] }: {
  questions: RegistrationField[];
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  /** Required questions to mark (after a try to save). */
  missing?: string[];
}) {
  return (
    <>
      {questions.map((f) => {
        const label = f.label + (f.required ? ' *' : '');
        const value = answerOf(answers, f);
        const error = missing.includes(f.id) ? 'צריך למלא' : undefined;
        if (f.type === 'choice') {
          return (
            <div key={f.id}>
              {/* a second tap on the chosen option clears an optional answer */}
              <ChoiceGroup label={label} value={value} options={f.options.map((o) => ({ value: o, label: o }))}
                onChange={(v) => onChange(f.id, v === value && !f.required ? '' : v)} />
              {error && <span className="k-field__error" role="alert">{error}</span>}
            </div>
          );
        }
        return <Field key={f.id} label={label} type={f.type === 'date' ? 'date' : 'text'} ltr={f.type === 'date'} maxLength={200}
          value={value} error={error} onChange={(e) => onChange(f.id, e.target.value)} />;
      })}
    </>
  );
}

/** A fresh account confirms reading the terms. The separately opened policy keeps the registration draft in place. */
export function RegistrationTerms({ read, onChange, invalid }: { read: boolean; onChange: (read: boolean) => void; invalid: boolean }) {
  const id = useId();
  const local = location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator') ? '?emulator' : '';
  return <div className="registration-terms">
    <div className="registration-terms__line">
      <label className="k-checkbox registration-terms__toggle" htmlFor={id}>
        <input id={id} className="k-checkbox__input" type="checkbox" checked={read} onChange={(event) => onChange(event.target.checked)}
          required aria-labelledby={id + '-label'} aria-invalid={invalid || undefined} aria-describedby={invalid ? id + '-error' : undefined} />
        <CheckboxBox checked={read} />
      </label>
      <span id={id + '-label'}><label htmlFor={id}>קראתי את</label>{' '}
        <a href={href('/terms') + local} target="_blank" rel="noopener">תנאי השימוש</a>{' ואת '}
        <a href={href('/privacy') + local} target="_blank" rel="noopener">מדיניות הפרטיות</a>
      </span>
    </div>
    {invalid && <span className="k-field__error" id={id + '-error'} role="alert">כדי להיכנס, צריך לסמן שקראת את התנאים.</span>}
  </div>;
}

/** Each year occupies one fixed-width snap point, independent of the screen width. */
const YEAR_WIDTH = 56;
export function BirthYearField({ value, onChange, invalid = false }: {
  value?: number;
  onChange: (year: number) => void;
  invalid?: boolean;
}) {
  const current = now().getFullYear();
  const oldest = 1900;
  const years = Array.from({ length: current - oldest + 1 }, (_, i) => current - i);
  // An imported historical value remains readable without offering new dates outside the supported range.
  if (value !== undefined && Number.isInteger(value) && value > 0 && value < oldest) years.push(value);
  const selected = value !== undefined && years.includes(value) ? value : undefined;
  const centered = selected ?? Math.min(2000, current);
  const index = years.indexOf(centered);
  const wheel = useRef<HTMLDivElement>(null);
  const visible = useRef(-1);
  const hint = useId();

  useLayoutEffect(() => {
    if (visible.current !== index && wheel.current) {
      visible.current = index;
      wheel.current.scrollLeft = index * YEAR_WIDTH;
    }
  }, [index]);

  // Touch and trackpads scroll horizontally. A conventional vertical mouse wheel steps through the same years.
  useEffect(() => {
    const el = wheel.current;
    if (!el) return;
    const step = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const pos = Math.round(el.scrollLeft / YEAR_WIDTH);
      el.scrollLeft = (pos + Math.sign(event.deltaY)) * YEAR_WIDTH;
    };
    el.addEventListener('wheel', step, { passive: false });
    return () => el.removeEventListener('wheel', step);
  }, []);

  function choose(position: number) {
    const next = Math.max(0, Math.min(years.length - 1, position));
    visible.current = next;
    if (wheel.current) wheel.current.scrollLeft = next * YEAR_WIDTH;
    onChange(years[next]);
  }

  return <div className="birth-year">
    <span id={hint + '-label'} className="birth-year__label">אנא בחר שנת לידה</span>
    <div className="birth-year__frame">
      <div className="birth-year__wheel" dir="ltr" style={{ '--year-width': YEAR_WIDTH + 'px' } as CSSProperties}
        ref={wheel} tabIndex={0} role="spinbutton" aria-labelledby={hint + '-label'} aria-describedby={hint}
        aria-required="true" aria-invalid={invalid || undefined} aria-valuemin={years[years.length - 1]}
        aria-valuemax={current} aria-valuenow={selected} aria-valuetext={selected === undefined ? 'טרם נבחרה שנה' : String(selected)}
        onScroll={(e) => {
          const next = Math.max(0, Math.min(years.length - 1, Math.round(e.currentTarget.scrollLeft / YEAR_WIDTH)));
          if (next !== visible.current) {
            visible.current = next;
            onChange(years[next]);
          }
        }}
        onKeyDown={(e) => {
          const pos = visible.current;
          const keys: Record<string, number> = {
            ArrowUp: pos - 1, ArrowDown: pos + 1, ArrowLeft: pos - 1, ArrowRight: pos + 1,
            PageUp: pos - 10, PageDown: pos + 10, Home: years.length - 1, End: 0, Enter: pos, ' ': pos,
          };
          if (e.key in keys) { e.preventDefault(); choose(keys[e.key]); }
        }}>
        {years.map((year, i) => <span key={year} aria-hidden="true" className={selected === year ? 'is-selected' : undefined}
          onClick={() => choose(i)}>{year}</span>)}
      </div>
    </div>
    <small id={hint} className={invalid ? 'k-field__error birth-year__hint' : 'birth-year__hint'}>
      {selected === undefined ? (invalid ? 'צריך לבחור שנת לידה' : 'גללו או הקישו על שנה') : `גילך הוא ${current - selected} שנים`}
    </small>
  </div>;
}
