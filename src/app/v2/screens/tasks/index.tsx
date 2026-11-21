// v2 screens: tasks. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** T1-Root,T2-Time,T4-Done,L5-MineEmpty,P1-Root,P6-Full */
export function TasksRoot(p: ScreenProps): ReactNode { return <Placeholder name="TasksRoot" ids="T1-Root,T2-Time,T4-Done,L5-MineEmpty,P1-Root,P6-Full" params={p.params} />; }
/** T3-Task,C3-TaskLinks */
export function TaskScreen(p: ScreenProps): ReactNode { return <Placeholder name="TaskScreen" ids="T3-Task,C3-TaskLinks" params={p.params} />; }
/** C4-Assign */
export function AssignScreen(p: ScreenProps): ReactNode { return <Placeholder name="AssignScreen" ids="C4-Assign" params={p.params} />; }
/** T5-Add,S5-Add (also edit mode) */
export function AddScreen(p: ScreenProps): ReactNode { return <Placeholder name="AddScreen" ids="T5-Add,S5-Add (also edit mode)" params={p.params} />; }
/** T6-History */
export function HistoryScreen(p: ScreenProps): ReactNode { return <Placeholder name="HistoryScreen" ids="T6-History" params={p.params} />; }
/** C6-DonePhoto */
export function DonePhotoScreen(p: ScreenProps): ReactNode { return <Placeholder name="DonePhotoScreen" ids="C6-DonePhoto" params={p.params} />; }
/** C7-DayEnd */
export function DayEndScreen(p: ScreenProps): ReactNode { return <Placeholder name="DayEndScreen" ids="C7-DayEnd" params={p.params} />; }
/** L1-Templates */
export function RecurringList(p: ScreenProps): ReactNode { return <Placeholder name="RecurringList" ids="L1-Templates" params={p.params} />; }
/** L2-Template */
export function RecurringForm(p: ScreenProps): ReactNode { return <Placeholder name="RecurringForm" ids="L2-Template" params={p.params} />; }
/** L3-Places */
export function PlacesScreen(p: ScreenProps): ReactNode { return <Placeholder name="PlacesScreen" ids="L3-Places" params={p.params} />; }
/** L4-Place */
export function PlaceScreen(p: ScreenProps): ReactNode { return <Placeholder name="PlaceScreen" ids="L4-Place" params={p.params} />; }

export type { V2Ctx };
