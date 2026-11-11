import type { Actor, Profile, Settings, Place, Template } from './types';
import type { Session } from './firebase';
export type TeamCtx = { user: Session; actor: Actor; profile: Profile; manager: boolean; owner: boolean; settings: Settings; places: Place[]; templates: Template[]; team: Profile[] };
export type GuestCtx = { user: Session | null; profile: Profile | null; settings: Settings };
