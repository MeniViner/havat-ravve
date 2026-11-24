// What every demo file shares. The demo's clock stands still at the moment the designs show (23.11.2026, 18:36 in Israel),
// so "לפני שתי דקות" and "היום 08:04" always read as designed.
export const DEMO_AT = '2026-11-23T18:36:00+02:00';
export const DEMO_NOW = Date.parse(DEMO_AT);
export const DAY = 24 * 60;
/** An instant so many minutes before the demo's now (negative: after it). */
export const ago = (min: number) => new Date(DEMO_NOW - min * 60_000).toISOString();
/** An instant in Israel's winter time: at('2026-11-23', '08:04'). */
export const at = (day: string, time: string) => new Date(`${day}T${time}:00+02:00`).toISOString();
export const dayKey = (daysAgo: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(DEMO_NOW - daysAgo * 86400_000));

export const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 180));
export const fakeKey = () => 'hr_DEMO_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
