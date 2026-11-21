// v2 screens: tasks. The shell routes to these names (v2/routes.tsx).
//   TasksRoot        T1-Root, T2-Time, T4-Done, L5-MineEmpty, P1-Root, P6-Full (and the B4 broadcast card slot)
//   TaskScreen       T3-Task, C3-TaskLinks
//   AssignScreen     C4-Assign
//   AddScreen        T5-Add, S5-Add (also /tasks/:id/edit and /shopping/:id/edit)
//   HistoryScreen    T6-History
//   DonePhotoScreen  C6-DonePhoto
//   DayEndScreen     C7-DayEnd
//   RecurringList    L1-Templates
//   RecurringForm    L2-Template
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
