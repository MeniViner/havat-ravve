import { nowIso } from './clock';
import { newId, write } from './db';

type AccountAction = 'profile_updated' | 'photo_updated' | 'welcome_completed' | 'updates_changed' | 'push_changed';

export function saveAccountChange(uid: string, action: AccountAction, data: Record<string, unknown>) {
  const col = 'account_activity';
  return write.batch([
    { op: 'update', col: 'users', id: uid, data },
    { op: 'set', col, id: newId(col), data: { uid, action, at: nowIso() } },
  ]);
}
