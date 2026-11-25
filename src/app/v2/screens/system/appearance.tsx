import { setAppearance, useAppearance, type Appearance } from '../../../appearance';
import { back } from '../../../router';
import { AppScreen } from '../../core';
import { RadioList, RadioRow, TopBar } from '../../kit';

const options = [
  { value: 'light', title: 'בהיר', meta: 'מצב כהה כבוי' },
  { value: 'system', title: 'לפי המכשיר', meta: 'עובר בין בהיר לכהה לפי הגדרות המכשיר' },
  { value: 'dark', title: 'כהה תמיד', meta: 'מצב כהה פעיל כל הזמן' },
] as const satisfies readonly { value: Appearance; title: string; meta: string }[];

export function AppearanceScreen({ parent = '/me' }: { parent?: string }) {
  const mode = useAppearance();
  return (
    <AppScreen variant="detail" noNav>
      <TopBar back={{ label: 'חזרה לחשבון', onClick: () => back(parent) }} />
      <h1 className="k-h1 k-h1--detail">עיצוב</h1>
      <RadioList label="מצב כהה">
        {options.map(({ value, title, meta }) => (
          <RadioRow key={value} checked={mode === value} title={title} meta={meta} onSelect={() => setAppearance(value)} />
        ))}
      </RadioList>
    </AppScreen>
  );
}
