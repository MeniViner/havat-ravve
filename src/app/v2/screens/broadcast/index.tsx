// v2 screens: messages (Q25, Q26, B3, B4) and notifications (C1). The shell routes to these names (v2/routes.tsx).
// Tidy round: the sent-messages list is the "הודעות" segment of People (Q25); /manage/broadcasts redirects there.
import './broadcast.css';
import type { V2Ctx } from '../../ctx';

/** Q26-ComposeAll (was B1), at /manage/broadcasts/new; MESSAGES_PATH is where it returns (Q25). */
export { BroadcastCompose, MESSAGES_PATH } from './Compose';
/** Q25-Messages (was B2-Sent): rendered by PeopleScreen for ?tab=messages. messagePath(id) is B3 under People. */
export { MessagesSegment, messagePath } from './Sent';
/** B3-Read, at /manage/people/messages/:id */
export { BroadcastReads } from './Reads';
/** C1-Notifs */
export { NotificationsScreen } from './Notifications';
/** B4: the dark broadcast card pinned at the top of the first root (TasksRoot, VendorHome) until the person taps 'קראתי'. Renders nothing when there is no unread broadcast. */
export { BroadcastCard } from './Card';
/** The phone-push choices: the C1 "מה לקבל" sheet, and the same content for the profile's notification row (L6 / C12). */
export { PushSheet, PushSettings } from './PushSheet';

export type { V2Ctx };
