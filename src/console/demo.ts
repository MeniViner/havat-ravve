// /admin?demo: the console over made-up people, keys and numbers, kept in memory only. No Firestore, no Worker.
// The content is in demo/, one file per group of screens; docs/console-desktop-plan.md says which screen shows what.
import type { Source } from './source';
import { wait } from './demo/base';
import { statusDemo } from './demo/status';
import { farmDemo } from './demo/farm';
import { dataDemo } from './demo/data';
import { sendingDemo } from './demo/sending';
import { accessDemo } from './demo/access';

export const demoSource: Source = {
  demo: true,
  me: () => wait({ uid: 'd-owner', name: 'מני בעלים', role: 'owner' as const }),
  ...statusDemo, ...farmDemo, ...dataDemo, ...sendingDemo, ...accessDemo,
};
