// W4 "הדגמה בכניסה ראשונה" (owners only, from Q19 "מנהלים ומערכת"): one switch per kind of account for the first-visit demo
// (demo/intro.ts), and a row to the persona chooser (/demo). Each switch saves at once to settings/app.demoIntro, which only
// owners may change (firestore.rules); a missing value is the default (guests, volunteers and managers on, vendors off).
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { ListCard, PageTitle, Row, Toggle, TopBar } from '../../kit';
import { saveSettings, useRun } from '../../data/manage';
import { demoIntroOf, type DemoIntroRoles, type IntroKind } from '../../../demo/intro';
import { lnk } from './shared';

const KINDS: { k: IntroKind; title: string; meta: string }[] = [
  { k: 'guest', title: 'אורחים', meta: 'כרטיסים, ביקור ותרומה' },
  { k: 'staff', title: 'מתנדבים', meta: 'משימות, קניות והחווה' },
  { k: 'manager', title: 'מנהלים', meta: 'גם לשונית הניהול' },
  { k: 'vendor', title: 'בעלי דוכנים', meta: 'ההזמנה והדוכן' },
];

/** The meta line of the row on Q19: who sees it. */
export function demoIntroLine(s: { demoIntro?: Partial<DemoIntroRoles> | null }): string {
  const r = demoIntroOf(s);
  const on = KINDS.filter((x) => r[x.k]).map((x) => x.title);
  if (!on.length) return 'לא מוצגת לאף אחד';
  if (on.length === KINDS.length) return 'לכל החשבונות';
  return on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} ו${on[on.length - 1]}`;
}

export function DemoFirstVisitScreen({ ctx }: ScreenProps) {
  const roles = demoIntroOf(ctx.settings as { demoIntro?: Partial<DemoIntroRoles> });
  const run = useRun();
  const set = (k: IntroKind, v: boolean) => run(() => saveSettings(ctx.actor, { demoIntro: { ...roles, [k]: v } }, 'הדגמה בכניסה ראשונה עודכנה'));
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'הגדרות', ...lnk('/manage/settings') }} />
      <PageTitle>הדגמה בכניסה ראשונה</PageTitle>
      <p className="manage-lead">מי שנכנס לאפליקציה בפעם הראשונה רואה קודם סיור קצר בנתוני הדגמה, ואז עובר לחשבון האמיתי שלו.</p>
      <ListCard title="למי להציג">
        {KINDS.map((x) => (
          <Row key={x.k} minHeight={58} title={x.title} meta={x.meta} actions={<Toggle label={x.title} checked={roles[x.k]} onChange={(v) => set(x.k, v)} />} />
        ))}
      </ListCard>
      <ListCard aria-label="לראות את ההדגמה">
        <Row minHeight={52} {...lnk('/demo')} title="לראות את ההדגמה בעצמי" meta="נפתחת בתור כל תפקיד" />
      </ListCard>
      <span className="manage-hint">אפשר לצאת מההדגמה בכל רגע מהפס שבראש המסך. היא לא מוצגת שוב אחרי הפעם הראשונה.</span>
    </AppScreen>
  );
}
