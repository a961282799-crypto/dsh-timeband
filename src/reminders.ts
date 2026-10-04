import { createScheduleReader, nextTransition } from './schedule.ts';
import type { ScheduleSnapshot } from './schedule.ts';
import type { CalendarStore } from './calendar-store.ts';
import type { ReminderStore, ReminderStorage } from './reminder-store.ts';

export const REMINDER_LEAD = 5 * 60_000;
export const REMINDER_SENT_KEY = 'dsh-timeband/reminder-sent/v1';
const REMINDER_LOCK = 'dsh-timeband/peak-reminder';
type Subscription = { subscribe: (listener: () => void) => () => void };

function synchronize(task: () => void) {
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(REMINDER_LOCK, task) : Promise.resolve().then(task);
}

/** One controller per Cordis plugin, independent of mounted popovers.
 * Keep a deadline timer while hidden; use wall time after sleep and never
 * send a reminder once the peak period has already started. */
export function createReminders(options: {
  clock: Subscription;
  calendarStore: CalendarStore;
  reminderStore: ReminderStore;
  notify: (at: number, failed: () => void) => void;
  getStorage?: () => ReminderStorage;
  now?: () => number;
  synchronize?: (task: () => void) => Promise<unknown>;
}) {
  const readSchedule = createScheduleReader();
  const now = options.now ?? Date.now;
  const storage = options.getStorage ?? (() => window.localStorage);
  const lock = options.synchronize ?? synchronize;
  let schedule: ScheduleSnapshot | undefined, target: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, wakeAt: number | null = null;
  let attempted: number | null = null, running = false, generation = 0;
  const clear = () => { clearTimeout(timer); timer = undefined; wakeAt = null; };
  const upcoming = (instant: number) => {
    const data = options.calendarStore.getSnapshot().data;
    const current = readSchedule(instant, data);
    if (current !== schedule) {
      schedule = current;
      let next = current.band === 'unknown' ? null : current.next;
      if (next?.band === 'offpeak') next = nextTransition(next.at, data);
      target = next?.band === 'peak' ? next.at : null;
    }
    return target;
  };
  const arm = (at: number, instant: number) => {
    if (wakeAt === at) return;
    clear(); wakeAt = at;
    timer = setTimeout(() => { timer = undefined; wakeAt = null; refresh(); }, Math.max(1, Math.min(2_147_483_647, at - instant)));
  };
  const refresh = () => {
    if (!running || !options.reminderStore.getSnapshot().enabled) { clear(); attempted = null; return; }
    const instant = now(), at = upcoming(instant);
    if (at === null) { clear(); attempted = null; return; }
    if (instant < at - REMINDER_LEAD) { attempted = null; arm(at - REMINDER_LEAD, instant); return; }
    arm(at, instant);
    if (attempted === at) return;
    attempted = at;
    const operation = generation;
    void lock(() => {
      if (!running || generation !== operation || !options.reminderStore.getSnapshot().enabled) return;
      const current = now();
      if (current < at - REMINDER_LEAD || current >= at || upcoming(current) !== at) return;
      let previous: string | null;
      try {
        previous = storage().getItem(REMINDER_SENT_KEY);
        // A backwards clock change must not replay older reminders.
        if (previous !== null && Number.isSafeInteger(Number(previous)) && Number(previous) >= at) return;
        storage().setItem(REMINDER_SENT_KEY, String(at));
      } catch { options.reminderStore.fail('storage'); return; }
      const restore = () => {
        if (!running) return;
        try {
          if (storage().getItem(REMINDER_SENT_KEY) === String(at)) {
            if (previous === null) storage().removeItem(REMINDER_SENT_KEY); else storage().setItem(REMINDER_SENT_KEY, previous);
          }
        } catch {}
        options.reminderStore.fail('delivery');
      };
      try {
        options.notify(at, () => {
          // Error events arrive after the send lock has been released. Restore
          // the previous claim under the same lock without overwriting a newer one.
          void lock(restore).catch(() => { if (running) options.reminderStore.fail('delivery'); });
        });
      } catch { restore(); }
    }).catch(() => { if (running && generation === operation) options.reminderStore.fail('delivery'); });
  };
  return {
    start() {
      running = true; attempted = null;
      const changed = () => { generation++; attempted = null; refresh(); };
      const unsubscribe = [options.clock.subscribe(refresh), options.calendarStore.subscribe(changed), options.reminderStore.subscribe(changed)];
      refresh();
      return () => { running = false; generation++; clear(); unsubscribe.forEach(stop => stop()); };
    },
  };
}
