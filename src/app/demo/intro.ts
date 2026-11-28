// Historical settings may remain in saved profiles/settings. Demo entry is now manual for eligible team accounts.
export type DemoIntroRoles = Record<'guest' | 'staff' | 'manager' | 'vendor', boolean>;
export const leaveDemoTarget = () => '/me';
