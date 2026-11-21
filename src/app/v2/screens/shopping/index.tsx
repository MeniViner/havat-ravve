// v2 screens: shopping. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** S1-Root,S2-Wish,S3-Empty */
export function ShoppingRoot(p: ScreenProps): ReactNode { return <Placeholder name="ShoppingRoot" ids="S1-Root,S2-Wish,S3-Empty" params={p.params} />; }
/** S4-Item */
export function ShopItemScreen(p: ScreenProps): ReactNode { return <Placeholder name="ShopItemScreen" ids="S4-Item" params={p.params} />; }
/** S6-Trip */
export function TripScreen(p: ScreenProps): ReactNode { return <Placeholder name="TripScreen" ids="S6-Trip" params={p.params} />; }
/** S7-TripEnd */
export function TripDoneScreen(p: ScreenProps): ReactNode { return <Placeholder name="TripDoneScreen" ids="S7-TripEnd" params={p.params} />; }
/** S8-History */
export function ShopHistoryScreen(p: ScreenProps): ReactNode { return <Placeholder name="ShopHistoryScreen" ids="S8-History" params={p.params} />; }

export type { V2Ctx };
