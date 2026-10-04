export const REMINDER_STORAGE_KEY = 'dsh-timeband/reminders/v1';
export type ReminderStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ReminderIssue = 'denied' | 'unsupported' | 'storage' | 'delivery';
type Permission = NotificationPermission | 'unsupported';
export interface ReminderState { readonly enabled: boolean; readonly busy: boolean; readonly issue: ReminderIssue | null }

const browserPermissions = {
  read: (): Permission => typeof Notification === 'function' ? Notification.permission : 'unsupported',
  request: (): Promise<Permission> => Notification.requestPermission(),
};

/** Request notification permission only from the user's enable action. */
export function createReminderStore(
  getStorage: () => ReminderStorage = () => window.localStorage,
  permissions: { read: () => Permission; request: () => Promise<Permission> } = browserPermissions,
) {
  const listeners = new Set<() => void>();
  const read = (): ReminderState => {
    try {
      if (getStorage().getItem(REMINDER_STORAGE_KEY) !== 'true') return { enabled: false, busy: false, issue: null };
      const permission = permissions.read();
      return permission === 'granted' ? { enabled: true, busy: false, issue: null }
        : { enabled: false, busy: false, issue: permission === 'unsupported' ? 'unsupported' : 'denied' };
    } catch { return { enabled: false, busy: false, issue: 'storage' }; }
  };
  let snapshot = read(), operation = 0;
  const update = (state: ReminderState) => {
    if (state.enabled === snapshot.enabled && state.busy === snapshot.busy && state.issue === snapshot.issue) return;
    snapshot = state;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async setEnabled(enabled: boolean) {
      const current = ++operation;
      if (!enabled) {
        // Stop immediately, even if storage has become inaccessible.
        update({ enabled: false, busy: false, issue: null });
        try { getStorage().removeItem(REMINDER_STORAGE_KEY); }
        catch { update({ enabled: false, busy: false, issue: 'storage' }); }
        return;
      }
      update({ enabled: false, busy: true, issue: null });
      let permission: Permission;
      try {
        permission = permissions.read();
        if (permission === 'default') permission = await permissions.request();
      } catch {
        if (current === operation) update({ enabled: false, busy: false, issue: 'denied' });
        return;
      }
      if (current !== operation) return;
      if (permission !== 'granted') {
        update({ enabled: false, busy: false, issue: permission === 'unsupported' ? 'unsupported' : 'denied' });
        return;
      }
      try {
        getStorage().setItem(REMINDER_STORAGE_KEY, 'true');
        update({ enabled: true, busy: false, issue: null });
      } catch { if (current === operation) update({ enabled: false, busy: false, issue: 'storage' }); }
    },
    fail(issue: ReminderIssue) {
      operation++;
      try { getStorage().removeItem(REMINDER_STORAGE_KEY); } catch { issue = 'storage'; }
      update({ enabled: false, busy: false, issue });
    },
    start() {
      const refresh = () => { if (!snapshot.busy) update(read()); };
      const onStorage = (event: StorageEvent) => {
        if (event.key === REMINDER_STORAGE_KEY || event.key === null) { operation++; update(read()); }
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', refresh);
      window.addEventListener('pageshow', refresh);
      return () => {
        operation++;
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('focus', refresh);
        window.removeEventListener('pageshow', refresh);
      };
    },
  };
}
export type ReminderStore = ReturnType<typeof createReminderStore>;
