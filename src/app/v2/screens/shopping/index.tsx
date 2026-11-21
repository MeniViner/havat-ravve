// v2 screens: shopping (S1-S4, S6-S8). S5 (add / edit an item) is the tasks area's AddScreen: /new?kind=shopping&list=<key>[&text=][&photo=1][&mic=1]
// and /shopping/:id/edit. The shell routes to these names (v2/routes.tsx).
import type { V2Ctx } from '../../ctx';
import './shopping.css';

/** S1-Root, S2-Wish (?list=wish), S3-Empty (an empty list, e.g. ?list=online) */
export { ShoppingRoot } from './Root';
/** S4-Item */
export { ShopItemScreen } from './Item';
/** S6-Trip, S7-TripEnd */
export { TripScreen, TripDoneScreen } from './Trip';
/** S8-History */
export { ShopHistoryScreen } from './History';

export type { V2Ctx };
