// v2 screens: events. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** M3-Events */
export function EventsList(p: ScreenProps): ReactNode { return <Placeholder name="EventsList" ids="M3-Events" params={p.params} />; }
/** M4-Prep,M5-Guests,M6-Live,M7-Summary */
export function EventScreen(p: ScreenProps): ReactNode { return <Placeholder name="EventScreen" ids="M4-Prep,M5-Guests,M6-Live,M7-Summary" params={p.params} />; }
/** N11-EventEdit */
export function EventForm(p: ScreenProps): ReactNode { return <Placeholder name="EventForm" ids="N11-EventEdit" params={p.params} />; }
/** N9-Products */
export function ProductsScreen(p: ScreenProps): ReactNode { return <Placeholder name="ProductsScreen" ids="N9-Products" params={p.params} />; }
/** N10-Product */
export function ProductForm(p: ScreenProps): ReactNode { return <Placeholder name="ProductForm" ids="N10-Product" params={p.params} />; }
/** N12-Tab */
export function TabScreen(p: ScreenProps): ReactNode { return <Placeholder name="TabScreen" ids="N12-Tab" params={p.params} />; }
/** V3-Files */
export function FilesScreen(p: ScreenProps): ReactNode { return <Placeholder name="FilesScreen" ids="V3-Files" params={p.params} />; }
/** V4-Staffing */
export function StaffingScreen(p: ScreenProps): ReactNode { return <Placeholder name="StaffingScreen" ids="V4-Staffing" params={p.params} />; }
/** V5-Debts */
export function DebtsScreen(p: ScreenProps): ReactNode { return <Placeholder name="DebtsScreen" ids="V5-Debts" params={p.params} />; }

export type { V2Ctx };
