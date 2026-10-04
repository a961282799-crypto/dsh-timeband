import { calendar, CalendarError, mergeCalendars, parseCalendar } from './calendar.ts';
import type { HolidayCalendar } from './calendar.ts';

export const CALENDAR_STORAGE_KEY = 'dsh-timeband/calendar/v1';
type CalendarStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type CalendarUpdateStatus = 'idle' | 'checking' | 'waiting' | 'failed';
export interface CalendarState {
  readonly data: HolidayCalendar;
  readonly issue: 'invalid' | 'storage' | null;
  readonly update: CalendarUpdateStatus;
}

/** One persisted calendar shared by the plugin views, scoped to this web origin. */
export function createCalendarStore(getStorage: () => CalendarStorage = () => window.localStorage) {
  const listeners = new Set<() => void>();
  const read = (): Pick<CalendarState, 'data' | 'issue'> => {
    try {
      const saved = getStorage().getItem(CALENDAR_STORAGE_KEY);
      return saved === null ? { data: calendar, issue: null } : { data: mergeCalendars(calendar, parseCalendar(saved)), issue: null };
    } catch (error) {
      return { data: calendar, issue: error instanceof CalendarError ? error.kind : 'storage' };
    }
  };
  let snapshot: CalendarState = { ...read(), update: 'idle' };
  const update = (state: CalendarState) => { snapshot = state; for (const listener of listeners) listener(); };
  const refresh = () => {
    const state = read();
    if (state.issue === snapshot.issue && JSON.stringify(state.data) === JSON.stringify(snapshot.data)) return;
    update({ ...state, update: snapshot.update });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    save(incoming: HolidayCalendar) {
      const data = mergeCalendars(mergeCalendars(snapshot.data, read().data), parseCalendar(JSON.stringify(incoming)));
      try { getStorage().setItem(CALENDAR_STORAGE_KEY, JSON.stringify(data)); }
      catch { throw new CalendarError('storage'); }
      update({ data, issue: null, update: 'idle' });
    },
    setUpdateStatus(status: CalendarUpdateStatus, issue = snapshot.issue) {
      if (snapshot.update !== status || snapshot.issue !== issue) update({ ...snapshot, update: status, issue });
    },
    start() {
      const onStorage = (event: StorageEvent) => { if (event.key === CALENDAR_STORAGE_KEY || event.key === null) refresh(); };
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', refresh);
      return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); };
    },
  };
}
export type CalendarStore = ReturnType<typeof createCalendarStore>;
