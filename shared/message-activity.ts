export const AUDIENCE_LABELS = {
  all: 'כל הצוות', farmToday: 'בחווה היום', managers: 'מנהלים', crew: 'צוות האירוע',
  vendors: 'בעלי דוכנים', registrants: 'נרשמי האירוע', everyone: 'כל המשתמשים',
} as const;
export type BroadcastAudience = keyof typeof AUDIENCE_LABELS;
export const OUTSIDE_AUDIENCES: BroadcastAudience[] = ['registrants', 'vendors', 'everyone'];

export function messageActivityText(audience: BroadcastAudience, recipientCount: number, urgent: boolean, body?: string) {
  const preview = audience === 'all' && body ? Array.from(body.replace(/\s+/g, ' ')).slice(0, 80).join('') : '';
  return [AUDIENCE_LABELS[audience], `${recipientCount} נמענים`, urgent ? 'דחופה' : 'רגילה', preview].filter(Boolean).join(' · ');
}

/** De-duplicate recipients. A sender who is in the audience is treated like every other recipient. */
export function notificationTargets(uids: string[]) {
  return [...new Set(uids.filter(Boolean))];
}

export type SendReceipt = { accepted: boolean; created: number; queued: number };
