// v2 screens: broadcast (B1-B4) and notifications (C1). The shell routes to these names (v2/routes.tsx).
import './broadcast.css';
import type { V2Ctx } from '../../ctx';

/** B1-Compose */
export { BroadcastCompose } from './Compose';
/** B2-Sent */
export { BroadcastsSent } from './Sent';
/** B3-Read */
export { BroadcastReads } from './Reads';
/** C1-Notifs */
export { NotificationsScreen } from './Notifications';
/** B4: the dark broadcast card pinned at the top of the first root (TasksRoot, VendorHome) until the person taps 'קראתי'. Renders nothing when there is no unread broadcast. */
export { BroadcastCard } from './Card';
/** The phone-push choices: the C1 "מה לקבל" sheet, and the same content for the profile's notification row (L6 / C12). */
export { PushSheet, PushSettings } from './PushSheet';

export type { V2Ctx };
