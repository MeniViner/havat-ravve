// v2 screens: eventday. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** E1-Home */
export function EventHome(p: ScreenProps): ReactNode { return <Placeholder name="EventHome" ids="E1-Home" params={p.params} />; }
/** E2-Scan,E3-Ok,E4-Pay,E5-Bad */
export function GateScreen(p: ScreenProps): ReactNode { return <Placeholder name="GateScreen" ids="E2-Scan,E3-Ok,E4-Pay,E5-Bad" params={p.params} />; }
/** E6-Search */
export function GateSearch(p: ScreenProps): ReactNode { return <Placeholder name="GateSearch" ids="E6-Search" params={p.params} />; }
/** E7-StallWho */
export function StallWho(p: ScreenProps): ReactNode { return <Placeholder name="StallWho" ids="E7-StallWho" params={p.params} />; }
/** E8-StallSell */
export function StallSell(p: ScreenProps): ReactNode { return <Placeholder name="StallSell" ids="E8-StallSell" params={p.params} />; }
/** E9-Tabs */
export function StallTabs(p: ScreenProps): ReactNode { return <Placeholder name="StallTabs" ids="E9-Tabs" params={p.params} />; }
/** Y1-Live */
export function LiveScreen(p: ScreenProps): ReactNode { return <Placeholder name="LiveScreen" ids="Y1-Live" params={p.params} />; }
/** Y2-Scans */
export function ScansScreen(p: ScreenProps): ReactNode { return <Placeholder name="ScansScreen" ids="Y2-Scans" params={p.params} />; }
/** Y3-Rejected */
export function RejectedScan(p: ScreenProps): ReactNode { return <Placeholder name="RejectedScan" ids="Y3-Rejected" params={p.params} />; }
/** Y4-Waiting */
export function WaitingScreen(p: ScreenProps): ReactNode { return <Placeholder name="WaitingScreen" ids="Y4-Waiting" params={p.params} />; }
/** Y5-Close */
export function CloseEvent(p: ScreenProps): ReactNode { return <Placeholder name="CloseEvent" ids="Y5-Close" params={p.params} />; }

export type { V2Ctx };
