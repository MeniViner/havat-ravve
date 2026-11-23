// First visits in demo: a new account first sees the app with example data, as the example person of its own role (never a higher one).
//   1. first opening (role known, demo off)  → demo turns on by itself, and stays on across openings
//   2. the first time the person leaves demo → nothing more in that opening
//   3. the next opening                      → one question: "רוצה לראות איך נראים נתוני דמו?" (הפעלה / לא תודה)
//   4. after the answer                      → never again
// Remembered per person in this browser (localStorage, per uid). Nothing here reads or writes Firestore: the demo layer stays a sandbox.
import { getDemo, setDemo, subscribeDemo, type Persona } from './store';
import type { Profile } from '../types';

export type IntroStage = 'demo' | 'left' | 'done';
export type IntroAction = 'start' | 'ask' | 'none';

/** The toast after "לא תודה": where demo can be turned on again, in each shell, named as the existing entry is.
 *  Team and vendors: the profile row "לראות איך האפליקציה עובדת" (/me → /demo). Guests: "מצב הדגמה" on החשבון שלי.
 *  A demo switch in Settings proper needs a design first; when the tidy round moves the guest entry, change it here. */
export const INTRO_DECLINED = {
  team: 'אפשר לחזור לדמו בכל רגע מהפרופיל, ב״לראות איך האפליקציה עובדת״',
  guest: 'אפשר לחזור לדמו בכל רגע מ״החשבון שלי״, ב״מצב הדגמה״',
} as const;

/** Accounts created from this day get the first-visit demo. Older accounts (the working team) are left as they are. */
export const INTRO_FROM = '2026-11-23';

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

/** Pure: what to do when a real account is on screen with demo off. */
export function introStep(stage: IntroStage | null, o: { fresh: boolean; leftNow: boolean }): { action: IntroAction; stage: IntroStage | null } {
  if (stage === null) return o.fresh ? { action: 'start', stage: 'demo' } : { action: 'none', stage: null };
  if (stage === 'done') return { action: 'none', stage };
  // 'demo' with demo off means the person left it; 'left' waits for an opening other than the one they left in
  if (o.leftNow) return { action: 'none', stage: 'left' };
  return { action: 'ask', stage: 'left' };
}

const readStage = (uid: string): IntroStage | null => {
  const s = ls.get(STAGE(uid));
  return s === 'demo' || s === 'left' || s === 'done' ? s : null;
};

/** Called once the real account and its role are known, with demo off. Returns what the screen should do. */
export function runIntro(p: Profile, owner: boolean, manager: boolean): IntroAction {
  if (getDemo().on) return 'none';
  let stage = readStage(p.uid);
  let fresh = typeof p.createdAt === 'string' && p.createdAt.slice(0, 10) >= INTRO_FROM;
  if (ls.get(RESET)) { ls.del(RESET); stage = null; fresh = true; ss.set(LEFT_NOW, ''); }
  const step = introStep(stage, { fresh, leftNow: ss.get(LEFT_NOW) === '1' });
  if (step.stage !== stage) step.stage ? ls.set(STAGE(p.uid), step.stage) : ls.del(STAGE(p.uid));
  if (step.action === 'start') startOwnDemo(introPersona(p, owner, manager));
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
