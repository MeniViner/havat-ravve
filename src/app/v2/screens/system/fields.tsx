// The configurable registration questions (settings.registrationFields) as v2 fields: C13 (my details) and C9 (first entry).
// The same questions and rules as the old RegistrationFields.tsx; a required question carries " *" as it did.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { now } from '../../../clock';
import { Button, Checkbox, Field, ChoiceGroup } from '../../kit';
import type { RegistrationField } from '../../../types';
import { href } from '../../../router';
import { answerOf } from '../../data/system';

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
  return <div className="k-stack">
    <a className="guest-inlinelink" href={href('/terms')} target="_blank" rel="noopener">קריאת תנאי השימוש והפרטיות (ייפתח בחלון חדש)</a>
    <Checkbox label="קראתי את תנאי השימוש והפרטיות" checked={read} onChange={onChange} required aria-invalid={invalid || undefined} />
    {invalid && <span className="k-field__error" role="alert">כדי להיכנס, צריך לסמן שקראת את התנאים.</span>}
  </div>;
}

/** Scroll-snap wheel. Browsing years does not fill the optional field until the user confirms. */
export function BirthYearField({ value, onChange }: { value?: number; onChange: (year: number) => void }) {
  const [open, setOpen] = useState(false);
  const current = now().getFullYear();
  const min = Math.min(1900, value ?? current);
  const [draft, setDraft] = useState(value || current);
  const wheel = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const choose = (y: number) => {
    const year = Math.max(min, Math.min(current, y));
    if (wheel.current) wheel.current.scrollTop = (year - min) * 44;
    setDraft(year);
  };
  useLayoutEffect(() => {
    if (open) { choose(value || current); wheel.current?.focus({ preventScroll: true }); }
  }, [open, value, current]);
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>{value ? `שנת לידה · ${value}` : 'בחירת שנת לידה (רשות)'}</Button>;
  return <div className="birth-year">
    <p id={hintId} className="k-note">החליקו לשנה הרצויה. אפשר גם להשתמש בחצים.</p>
    <div className="birth-year__frame"><div className="birth-year__wheel" ref={wheel} tabIndex={0} role="spinbutton" aria-label="שנת לידה"
      aria-describedby={hintId} aria-valuemin={min} aria-valuemax={current} aria-valuenow={draft}
      onScroll={(e) => setDraft(Math.max(min, Math.min(current, min + Math.round(e.currentTarget.scrollTop / 44))))}
      onKeyDown={(e) => { const next: Record<string, number> = { ArrowUp: draft - 1, ArrowDown: draft + 1, PageUp: draft - 10, PageDown: draft + 10, Home: min, End: current };
        if (e.key in next) { e.preventDefault(); choose(next[e.key]); } }}>
      {Array.from({ length: current - min + 1 }, (_, i) => <div aria-hidden="true" key={i} className={i + min === draft ? 'is-current' : ''} onClick={() => choose(i + min)}>{i + min}</div>)}
    </div></div>
    <div className="birth-year__actions"><Button variant="outline" onClick={() => choose(draft - 1)} disabled={draft === min}>שנה קודמת</Button>
      <Button variant="outline" onClick={() => choose(draft + 1)} disabled={draft === current}>שנה הבאה</Button></div>
    <div className="birth-year__actions"><Button onClick={() => { onChange(draft); setOpen(false); }}>בחירת {draft}</Button>
      <Button variant="quiet" onClick={() => setOpen(false)}>דילוג</Button></div>
  </div>;
}
