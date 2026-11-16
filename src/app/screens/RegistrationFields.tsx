import type { RegistrationField } from '../types';
import { RECEIPT_PREFERENCE_FIELD } from '../types';
import { contactPhoneOk } from '../data';
import { Field, Input, Select } from '../ui';

export type ProfileDetails = { displayName: string; phone: string; fields: Record<string, string> };

export const signupQuestions = (fields: RegistrationField[]) => fields.filter((f) => (
  f.id !== RECEIPT_PREFERENCE_FIELD && f.label.trim() && (f.type !== 'choice' || f.options.length)
));

export function answerOf(answers: Record<string, string> | undefined, field: RegistrationField) {
  const value = answers?.[field.id];
  return typeof value === 'string' && (field.type !== 'choice' || field.options.includes(value)) ? value : '';
}

export function profileDetailsComplete(data: ProfileDetails, questions: RegistrationField[]) {
  return data.displayName.trim().length >= 2 && contactPhoneOk(data.phone.trim())
    && questions.every((f) => !f.required || answerOf(data.fields, f).trim());
}

export function RegistrationInputs({ data, questions, onChange, onboarding }: {
  data: ProfileDetails;
  questions: RegistrationField[];
  onChange: (patch: Partial<ProfileDetails>) => void;
  onboarding?: boolean;
}) {
  return (
    <>
      <Field label="שם בעברית *"><Input big={onboarding} autoFocus={onboarding} autoComplete="name" maxLength={80} required value={data.displayName} onChange={(e) => onChange({ displayName: e.target.value })} /></Field>
      <Field label="טלפון *"><Input big={onboarding} dir="ltr" type="tel" autoComplete="tel" maxLength={25} required value={data.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field>
      {questions.map((field) => {
        const props = { value: answerOf(data.fields, field), required: field.required, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ fields: { [field.id]: e.target.value } }) };
        return <Field key={field.id} label={field.label + (field.required ? ' *' : '')}>
          {field.type === 'choice'
            ? <Select {...props}><option value="">בחירה…</option>{field.options.map((option) => <option key={option}>{option}</option>)}</Select>
            : <Input {...props} type={field.type} dir={field.type === 'date' ? 'ltr' : undefined} />}
        </Field>;
      })}
    </>
  );
}
