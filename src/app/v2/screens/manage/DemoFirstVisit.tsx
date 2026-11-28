import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { ListCard, PageTitle, Row, TopBar } from '../../kit';
import { lnk } from './shared';

export function DemoFirstVisitScreen(_: ScreenProps) {
  return <AppScreen variant="detail">
    <TopBar back={{ label: 'הגדרות', ...lnk('/manage/settings') }} />
    <PageTitle>מצב הדגמה</PageTitle>
    <p className="manage-lead">מתנדבים, מנהלים ובעלים יכולים לפתוח הדגמה מהפרופיל ולבחור תפקיד ויום.</p>
    <ListCard><Row {...lnk('/demo')} title="לראות איך האפליקציה עובדת" /></ListCard>
  </AppScreen>;
}
