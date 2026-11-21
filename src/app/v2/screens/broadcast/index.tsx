// v2 screens: broadcast. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** B1-Compose */
export function BroadcastCompose(p: ScreenProps): ReactNode { return <Placeholder name="BroadcastCompose" ids="B1-Compose" params={p.params} />; }
/** B2-Sent */
export function BroadcastsSent(p: ScreenProps): ReactNode { return <Placeholder name="BroadcastsSent" ids="B2-Sent" params={p.params} />; }
/** B3-Read */
export function BroadcastReads(p: ScreenProps): ReactNode { return <Placeholder name="BroadcastReads" ids="B3-Read" params={p.params} />; }
/** C1-Notifs */
export function NotificationsScreen(p: ScreenProps): ReactNode { return <Placeholder name="NotificationsScreen" ids="C1-Notifs" params={p.params} />; }

/** B4: the dark broadcast card pinned at the top of the first root (TasksRoot, VendorHome) until the person taps 'קראתי'. Renders nothing when there is no unread broadcast. */
export function BroadcastCard(_: { ctx: V2Ctx }): ReactNode { return null; }

export type { V2Ctx };
