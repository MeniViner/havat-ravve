// The words of an open payment, and the file of them, for both layouts of כסף ואירועים.
import { ddmm, daysFromToday, keyOf } from '../app/v2/format';
import { gw } from '../app/v2/gender';
import { nowMs } from '../app/clock';
import { saveCsv } from './desk/desk';
import { fmt } from './shared';
import type { Debt } from './source';

export const ils = (n: number) => `${fmt(Math.round(n))} ₪`;
export const KIND: Record<Debt['kind'], string> = { ticket: 'כרטיסים', donation: 'תרומה', tab: 'חשבון דוכן' };
export const debtState = (d: Debt) => (d.claimed ? gw(d.who, 'אמר ששילם', 'אמרה ששילמה') : 'מחכה לתשלום');
export const sinceText = (iso: string) => { if (!iso) return ''; const d = daysFromToday(iso); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : ddmm(iso); };
/** The open payments, for Excel. Whole dates there, so the column sorts. */
export const saveDebts = (debts: Debt[]) => saveCsv(`havat-ravve-payments-${keyOf(new Date(nowMs()))}.csv`, ['מי', 'על מה', 'ממתי', 'מצב', 'סכום בש״ח'], debts.map((d) => [d.who || 'בלי שם', `${KIND[d.kind]} · ${d.what}`, d.since ? keyOf(d.since) : '', debtState(d), d.amount]));
