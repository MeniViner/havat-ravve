// The configurable registration questions (settings.registrationFields) as v2 fields: C13 (my details) and C9 (first entry).
// The same questions and rules as the old RegistrationFields.tsx; a required question carries " *" as it did.
import { Checkbox, Field, ChoiceGroup } from '../../kit';
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
