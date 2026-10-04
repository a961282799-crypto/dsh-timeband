import { createReminderSound } from './reminder-sound.ts';
import type { ReminderSound } from './reminder-sound.ts';

export type DeliveryStatus = 'pending' | 'accepted' | 'unconfirmed' | 'unavailable';
export interface ReminderNotice {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly delivery: DeliveryStatus;
  readonly sound: 'pending' | 'played' | 'unavailable';
}
export const DELIVERY_TIMEOUT = 5_000;

/** Keep an in-app reminder even when the OS silently drops a notification.
 * A constructor returning is not a delivery acknowledgement. */
export function createReminderDelivery(
  create: (title: string, options: NotificationOptions) => Notification = (title, options) => new Notification(title, options),
  sound: ReminderSound = createReminderSound(),
) {
  const listeners = new Set<() => void>();
  let snapshot: ReminderNotice | null = null, sequence = 0, disposed = false;
  let notification: Notification | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const update = (value: ReminderNotice | null) => {
    snapshot = value;
    for (const listener of listeners) listener();
  };
  const clear = () => {
    clearTimeout(timer); timer = undefined;
    if (!notification) return;
    notification.onshow = notification.onerror = notification.onclose = notification.onclick = null;
    try { notification.close(); } catch {}
    notification = undefined;
  };
  const dismiss = () => { clear(); sound.stop(); if (snapshot) update(null); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    primeSound: () => sound.prime(),
    show(title: string, body: string, tag: string) {
      if (disposed) return;
      clear();
      const id = ++sequence;
      // Publish before invoking the native API so the button always responds.
      update({ id, title, body, delivery: 'pending', sound: 'pending' });
      void sound.play().then(played => {
        if (!disposed && snapshot?.id === id) update({ ...snapshot, sound: played ? 'played' : 'unavailable' });
      });
      const status = (delivery: DeliveryStatus) => {
        if (disposed || snapshot?.id !== id) return;
        update({ ...snapshot, delivery });
      };
      try {
        notification = create(`DSH TimeBand · ${title}`, { body, tag, silent: true });
        notification.onshow = () => { clearTimeout(timer); timer = undefined; status('accepted'); };
        notification.onerror = () => { clear(); status('unavailable'); };
        notification.onclose = () => {
          clear();
          if (snapshot?.id === id && snapshot.delivery === 'pending') status('unconfirmed');
        };
        notification.onclick = () => { window.focus(); dismiss(); };
        timer = setTimeout(() => { timer = undefined; status('unconfirmed'); }, DELIVERY_TIMEOUT);
      } catch { clear(); status('unavailable'); }
    },
    dismiss,
    dispose() { disposed = true; dismiss(); sound.dispose(); },
  };
}
export type ReminderDelivery = ReturnType<typeof createReminderDelivery>;
