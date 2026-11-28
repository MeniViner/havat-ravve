// Z1-DemoStart (/demo, works signed out and with demo off) and Z3-DemoSwitch (the sheet behind the demo strip).
// Demo is a sandbox (demo/store.ts): nothing here reads or writes Firestore.
import { useState } from 'react';
import { AppScreen, useToast } from '../../core';
import { TopBar, PageTitle, RadioList, RadioRow, Avatar, Segmented, BottomBar, Button, Sheet, Inline, ListCard, Row, Toggle, Icon, initials } from '../../kit';
import { back, navigate } from '../../../router';
import {
  useDemo, useDemoStates, setDemo, setDemoStates, resetDemoData, demoDoc, PERSONA_LABELS, PERSONA_HINTS, PERSONA_UID, SCENARIOS, SCENARIO_KEYS,
  allowedDemoPersonas, type DemoAccessRole, type Persona, type Scenario,
} from '../../../demo/store';
import { nowIso } from '../../../clock';
import { leaveDemoTarget } from '../../../demo/intro';
import { setOfflineSince } from '../../data/system';
import './system.css';

const personaInitials = (p: Persona) => initials(String((demoDoc('users/' + PERSONA_UID[p]) as { displayName?: string } | null)?.displayName || PERSONA_LABELS[p].split(' · ')[1] || ''));
const DAY_OPTIONS = SCENARIO_KEYS.filter((k) => k === 'regular' || k === 'eventDay').map((k) => ({ value: k, label: SCENARIOS[k].label }));

/** Z1. Entry points: the sign-in screen, the profile screen and ?demo=. */
export function DemoStart({ role, authorize }: { role: DemoAccessRole | null; authorize: () => void }) {
  const demo = useDemo();
  const allowed = allowedDemoPersonas(role);
  const [choice, setPersona] = useState<Persona>(demo.on ? demo.persona : role || 'guest');
  const persona = allowed.includes(choice) ? choice : allowed[0];
  const [day, setDay] = useState<Scenario>(demo.scenario);
  if (!role) return <AppScreen variant="detail" noNav><TopBar back={{ label: 'חזרה', onClick: () => back('/') }} /><PageTitle size="detail">ההדגמה זמינה לצוות החווה</PageTitle></AppScreen>;
  const enter = () => { authorize(); setDemo({ on: true, persona, scenario: day }); navigate('/', true); };
  return (
    <AppScreen className="system-scr" variant="root" gap={14} noNav bar={<BottomBar><Button size="bar" grow onClick={enter}>כניסה להדגמה</Button></BottomBar>}>
      <TopBar className="system-pull" back={{ label: 'חזרה', onClick: () => back('/') }} />
      <div className="system-z1-head">
        <PageTitle size="detail">לראות איך האפליקציה עובדת</PageTitle>
        <p>נכנסים לחווה לדוגמה, עם אנשים, משימות ואירוע. הנתונים לא אמיתיים: שום דבר לא נשמר בחווה ולא נשלח לאף אחד.</p>
      </div>
      <div className="system-group">
        <span className="system-group__label">להיכנס בתור</span>
        <RadioList label="להיכנס בתור">
          {allowed.map((p) => (
            <RadioRow key={p} checked={persona === p} onSelect={() => setPersona(p)} leading={<Avatar initials={personaInitials(p)} size={36} />} title={PERSONA_LABELS[p]} meta={PERSONA_HINTS[p]} />
          ))}
        </RadioList>
      </div>
      <div className="system-group">
        <span className="system-group__label">איזה יום לראות</span>
        <Segmented label="איזה יום" mode="radio" value={day} onChange={setDay} options={DAY_OPTIONS} />
      </div>
    </AppScreen>
  );
}

/** Z3: switch persona and day, leave, reset, and the hard-to-reach states (demo only). */
export function DemoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = useDemo(); const states = useDemoStates(); const toast = useToast();
  const exit = () => { onClose(); setDemo({ on: false }); navigate(leaveDemoTarget(), true); };
  const reset = () => { resetDemoData(); setOfflineSince(''); toast.show({ text: 'נתוני הדוגמה אופסו', duration: 2500 }); };
  const offline = (on: boolean) => { setOfflineSince(on ? nowIso() : ''); setDemoStates({ offline: on }); };
  return (
    <Sheet className="system-scr" open={open} onClose={onClose} title="הדגמה" aside="נתונים לא אמיתיים">
      <Button variant="outline" onClick={() => { onClose(); navigate('/demo'); }}>בחירת תפקיד ויום</Button>
      <Inline gap={8}>
        <Button variant="secondary" size="lg" grow icon="exit" style={{ fontWeight: 600 }} onClick={exit}>יציאה מההדגמה</Button>
        <Button variant="outline" size="lg" onClick={reset}>איפוס הנתונים</Button>
      </Inline>
      <details className="system-states">
        <summary>מצבים להדגמה<Icon name="chevron-down" size={16} /></summary>
        <ListCard>
          <Row className="system-togglerow" title="אין קליטה" meta="פס כהה ופעולות ששמורות בטלפון" actions={<Toggle checked={states.offline} onChange={offline} label="אין קליטה" />} />
          <Row className="system-togglerow" title="הפעולה הבאה לא תישמר" meta="כאילו מישהו אחר הקדים" actions={<Toggle checked={states.refuseNext} onChange={(v) => setDemoStates({ refuseNext: v })} label="הפעולה הבאה לא תישמר" />} />
          <Row className="system-togglerow" title="רשימות ריקות" meta="משימות, קניות ודוכן" actions={<Toggle checked={states.empty} onChange={(v) => setDemoStates({ empty: v })} label="רשימות ריקות" />} />
        </ListCard>
      </details>
    </Sheet>
  );
}
