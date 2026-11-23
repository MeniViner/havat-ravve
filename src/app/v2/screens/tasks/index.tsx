// v2 screens: tasks. The shell routes to these names (v2/routes.tsx).
//   TasksRoot        Q2-TasksTime (T1, T2, T4, L5, P1; P6's 'עליך' now lives under 'רק שלי') and the B4 broadcast card slot
//   TaskScreen       T3-Task, C3-TaskLinks
//   AssignScreen     C4-Assign
//   AddScreen        Q3-AddMore, Q24-AddRecurring, S5-Add (also /tasks/:id/edit and /shopping/:id/edit)
//   HistoryScreen    T6-History
//   DonePhotoScreen  C6-DonePhoto
//   DayEndScreen     C7-DayEnd
//   RecurringList    L1-Templates
//   RecurringForm    Q24: /manage/recurring/new and /:id open the add form (AddForm) on 'חוזרת'
//   PlacesScreen     L3-Places
//   PlaceScreen      L4-Place
import type { V2Ctx } from '../../ctx';

export { TasksRoot } from './Root';
export { TaskScreen, AssignScreen, DonePhotoScreen } from './Task';
export { AddScreen } from './Add';
export { HistoryScreen, DayEndScreen } from './History';
export { RecurringList, RecurringForm } from './Recurring';
export { PlacesScreen, PlaceScreen } from './Places';
export { TasksCapture } from './shared';

export type { V2Ctx };
