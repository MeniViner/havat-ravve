// First visits in demo (demo/intro.ts) on screen: starts the first-visit demo, and asks the one question on the opening after it was left.
// Rendered next to the real app only (never while demo is on), for guests in the old shell and for the team and vendors in v2.
// It waits for settings/app (the W4 switches per kind of account) before deciding; a failed read counts as the defaults.
import { useEffect, useState } from 'react';
import { navigate } from '../router';
import { useDoc } from '../db';
import { runIntro, answerIntro, introPersona, demoIntroOf, INTRO_DECLINED, type DemoIntroRoles } from '../demo/intro';
import type { Profile } from '../types';
import { Sheet, Button } from './kit';

export function DemoIntro({ profile, owner, manager, shell, notify }: { profile: Profile; owner: boolean; manager: boolean; shell: keyof typeof INTRO_DECLINED; notify: (text: string) => void }) {
  const [ask, setAsk] = useState(false);
  const settings = useDoc<{ id: string; demoIntro?: Partial<DemoIntroRoles> }>('settings/app');
  useEffect(() => {
    if (settings.loading) return;
    const action = runIntro(profile, owner, manager, demoIntroOf(settings.item));
    if (action === 'start') navigate('/', true);
    else if (action === 'ask') setAsk(true);
  }, [profile.uid, settings.loading]);
  const answer = (on: boolean) => {
    setAsk(false);
    answerIntro(profile.uid, on, introPersona(profile, owner, manager));
    if (on) navigate('/', true);
    else notify(INTRO_DECLINED[shell]);
  };
  // closing the sheet without a button is an answer too (the question is asked once), without the toast
  const dismiss = () => { setAsk(false); answerIntro(profile.uid, false, 'guest'); };
  return (
    <Sheet open={ask} onClose={dismiss} title="רוצה לראות איך נראים נתוני דמו?" className="k-confirm">
      <p className="k-confirm__text">האפליקציה תיפתח עם נתונים לדוגמה, באותו תפקיד שלך. שום דבר לא נשמר באמת, ויוצאים בכל רגע מהפס למעלה.</p>
      <div className="k-confirm__actions">
        <Button variant="primary" size="lg" block onClick={() => answer(true)}>הפעלה</Button>
        <Button variant="secondary" size="lg" block onClick={() => answer(false)}>לא תודה</Button>
      </div>
    </Sheet>
  );
}
