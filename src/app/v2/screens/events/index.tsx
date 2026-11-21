// v2 screens: events (management). The shell routes to these names (v2/routes.tsx).
// M3 EventsList · M4-M7 EventScreen (?tab=prep|guests|day|summary) · N11 EventForm · N9 ProductsScreen · N10 ProductForm
// N12 TabScreen · V3 FilesScreen · V4 StaffingScreen · V5 DebtsScreen
import type { V2Ctx } from '../../ctx';

export { EventsList } from './list';
export { EventScreen } from './event';
export { EventForm } from './form';
export { ProductsScreen, ProductForm } from './products';
export { TabScreen } from './tab';
export { FilesScreen } from './files';
export { StaffingScreen } from './staffing';
export { DebtsScreen } from './debts';

export type { V2Ctx };
