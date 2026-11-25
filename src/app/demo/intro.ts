// First visits in demo: every account (new, and existing ones the first time they open this version) first sees the app with example data, as the example person of its own role (never a higher one).
//   1. first opening (role known, demo off)  → demo turns on by itself, and stays on across openings
//   2. the first time the person leaves demo → nothing more in that opening
//   3. the next opening                      → one question: "רוצה לראות איך נראים נתוני דמו?" (הפעלה / לא תודה)
//   4. after the answer                      → never again
// Remembered per person in this browser (localStorage, per uid). Nothing here reads or writes Firestore: the demo layer stays a sandbox.
// W4: the owners choose per kind of account whether step 1 happens at all (settings/app.demoIntro, missing = DEMO_INTRO_DEFAULT).
//   A kind that is off never starts by itself; a person who already got it (left, or was asked) goes on as before.
import { getDemo, setDemo, subscribeDemo, type Persona } from './store';
import type { Profile } from '../types';

export type IntroStage = 'demo' | 'left' | 'done';
export type IntroAction = 'start' | 'ask' | 'none';

/** The toast after "לא תודה": where demo can be turned on again, in each shell, named as the existing entry is.
 *  Team and vendors: the profile row "לראות איך האפליקציה עובדת" (/me → /demo). Guests: "מצב הדגמה" on החשבון שלי.
 *  A demo switch in Settings proper needs a design first; when the tidy round moves the guest entry, change it here. */
export const INTRO_DECLINED = {
  team: 'אפשר לחזור לדמו בכל רגע מהפרופיל, ב״לראות איך האפליקציה עובדת״',
  guest: 'אפשר לחזור לדמו בכל רגע מעמוד הכניסה, ב״לראות איך האפליקציה עובדת״',
} as const;

/** W4: the four switches of "הדגמה בכניסה ראשונה". Owners count with managers, a stall's helper with its owner. */
export type IntroKind = 'guest' | 'staff' | 'manager' | 'vendor';
export type DemoIntroRoles = Record<IntroKind, boolean>;
export const DEMO_INTRO_DEFAULT: DemoIntroRoles = { guest: true, staff: true, manager: true, vendor: false };
/** The switches as saved, with anything missing (an older document, a partial map) at its default. */
export const demoIntroOf = (s?: { demoIntro?: Partial<DemoIntroRoles> | null } | null): DemoIntroRoles => {
  const d = s?.demoIntro;
  const pick = (k: IntroKind) => (d && typeof d[k] === 'boolean' ? d[k] as boolean : DEMO_INTRO_DEFAULT[k]);
  return { guest: pick('guest'), staff: pick('staff'), manager: pick('manager'), vendor: pick('vendor') };
};
export const introKind = (persona: Persona): IntroKind =>
  persona === 'owner' || persona === 'manager' ? 'manager' : persona === 'staff' ? 'staff' : persona === 'vendor' || persona === 'helper' ? 'vendor' : 'guest';

const STAGE = (uid: string) => 'farm-demo-intro:' + uid;
/** sessionStorage: demo was left during this opening of the app (the question waits for the next opening). */
const LEFT_NOW = 'farm-demo-intro-left';
/** localStorage: the demo now on was started for the real account (the first visit or the question):
 *  leaving it goes back to the account, not to the persona chooser (/demo). */
const OWNED = 'farm-demo-intro-owned';
/** localStorage: ?demo-intro=reset on this device: the next real account to open starts the first-visit demo from the beginning. */
const RESET = 'farm-demo-intro-reset';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};

// Any way out of demo (the strip's יציאה, the switch sheet, Settings, ?demo=off) counts as leaving it in this opening.
let wasOn = getDemo().on;
let leftOwned = false;
subscribeDemo(() => {
  const on = getDemo().on;
  if (wasOn && !on) { ss.set(LEFT_NOW, '1'); leftOwned = !!ls.get(OWNED); ls.del(OWNED); }
  if (!wasOn && on) leftOwned = false;
  wasOn = on;
});

// ?demo-intro=reset (Meni's way to see the first visit again on his own account; also how it is tested).
if (typeof location !== 'undefined') {
  const params = new URLSearchParams(location.search);
  if (params.get('demo-intro') === 'reset') {
    ls.set(RESET, '1');
    params.delete('demo-intro');
    history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params.toString() : ''));
  }
}

/** The example person for a real account: the same role, or the closest one below it. */
export function introPersona(p: Profile, owner: boolean, manager: boolean): Persona {
  if (owner) return 'owner';
  if (manager) return 'manager';
  if (p.status !== 'active') return 'guest';
  if (p.role === 'staff') return 'staff';
  if (p.role === 'vendor') return p.helper ? 'helper' : 'vendor';
  return 'guest';
}

/** Pure: what to do when a real account is on screen with demo off. `on`: the W4 switch for this person's kind (default on).
 *  Off leaves a person who never had it untouched (nothing remembered), so turning the switch on later still reaches them. */
export function introStep(stage: IntroStage | null, o: { leftNow: boolean; on?: boolean }): { action: IntroAction; stage: IntroStage | null } {
  if (stage === null) return o.on === false ? { action: 'none', stage: null } : { action: 'start', stage: 'demo' };
  if (stage === 'done') return { action: 'none', stage };
  // 'demo' with demo off means the person left it; 'left' waits for an opening other than the one they left in
  if (o.leftNow) return { action: 'none', stage: 'left' };
  return { action: 'ask', stage: 'left' };
}

const readStage = (uid: string): IntroStage | null => {
  const s = ls.get(STAGE(uid));
  return s === 'demo' || s === 'left' || s === 'done' ? s : null;
};

/** Called once the real account, its role and the farm's settings are known, with demo off. Returns what the screen should do.
 *  `roles`: the W4 switches (demoIntroOf(settings)). */
export function runIntro(p: Profile, owner: boolean, manager: boolean, roles: DemoIntroRoles = DEMO_INTRO_DEFAULT): IntroAction {
  if (getDemo().on) return 'none';
  let stage = readStage(p.uid);
  if (ls.get(RESET)) { ls.del(RESET); stage = null; ss.set(LEFT_NOW, ''); }
  const persona = introPersona(p, owner, manager);
  const step = introStep(stage, { leftNow: ss.get(LEFT_NOW) === '1', on: roles[introKind(persona)] });
  if (step.stage !== stage) step.stage ? ls.set(STAGE(p.uid), step.stage) : ls.del(STAGE(p.uid));
  if (step.action === 'start') startOwnDemo(persona);
  return step.action;
}

/** The question was answered (either way): never ask again. */
export function answerIntro(uid: string, on: boolean, persona: Persona) {
  ls.set(STAGE(uid), 'done');
  if (on) startOwnDemo(persona);
}

/** Demo for the real account at its own role (the first visit, or הפעלה on the question). */
export function startOwnDemo(persona: Persona) {
  ls.set(OWNED, '1');
  setDemo({ on: true, persona });
}

/** Where the demo strip's יציאה goes (called right after demo turned off): back to the account when the demo was started for it,
 *  otherwise to the persona chooser as before. */
export const leaveDemoTarget = (): string => (leftOwned ? '/' : '/demo');
