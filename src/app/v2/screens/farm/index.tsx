// v2 screens: farm. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** F1-Root */
export function FarmRoot(p: ScreenProps): ReactNode { return <Placeholder name="FarmRoot" ids="F1-Root" params={p.params} />; }
/** F2-Month,F3-Day */
export function CalendarScreen(p: ScreenProps): ReactNode { return <Placeholder name="CalendarScreen" ids="F2-Month,F3-Day" params={p.params} />; }
/** F4-Presence */
export function PresenceScreen(p: ScreenProps): ReactNode { return <Placeholder name="PresenceScreen" ids="F4-Presence" params={p.params} />; }
/** F5-Feed */
export function FeedScreen(p: ScreenProps): ReactNode { return <Placeholder name="FeedScreen" ids="F5-Feed" params={p.params} />; }
/** F6-Event */
export function FarmEventScreen(p: ScreenProps): ReactNode { return <Placeholder name="FarmEventScreen" ids="F6-Event" params={p.params} />; }
/** C11-CalItem */
export function CalItemForm(p: ScreenProps): ReactNode { return <Placeholder name="CalItemForm" ids="C11-CalItem" params={p.params} />; }
/** C5-Teammate */
export function TeammateScreen(p: ScreenProps): ReactNode { return <Placeholder name="TeammateScreen" ids="C5-Teammate" params={p.params} />; }

export type { V2Ctx };
