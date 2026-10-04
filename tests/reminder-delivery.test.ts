import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderDelivery, DELIVERY_TIMEOUT } from '../src/reminder-delivery.ts';

function fixture() {
  const notices: Notification[] = [];
  let closed = 0;
  const delivery = createReminderDelivery(() => {
    const notification = { onshow: null, onerror: null, onclose: null, onclick: null, close() { closed++; } } as unknown as Notification;
    notices.push(notification);
    return notification;
  });
  const event = (index: number, kind: 'onshow' | 'onerror') => notices[index]?.[kind]?.call(notices[index]!, new Event(kind));
  return { delivery, notices, event, closed: () => closed };
}

test('silent native delivery is timed out honestly while the in-app reminder stays visible', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); context.after(() => f.delivery.dispose());
  f.delivery.show('Test', 'Body', 'test');
  assert.equal(f.delivery.getSnapshot()?.body, 'Body');
  assert.equal(f.delivery.getSnapshot()?.delivery, 'pending');
  context.mock.timers.tick(DELIVERY_TIMEOUT - 1);
  assert.equal(f.delivery.getSnapshot()?.delivery, 'pending');
  context.mock.timers.tick(1);
  assert.equal(f.delivery.getSnapshot()?.delivery, 'unconfirmed');
  f.event(0, 'onshow');
  assert.equal(f.delivery.getSnapshot()?.delivery, 'accepted');
});

test('native constructor and asynchronous errors preserve the in-app fallback', context => {
  const broken = createReminderDelivery(() => { throw new Error('native unavailable'); });
  broken.show('Test', 'Still readable', 'test');
  assert.equal(broken.getSnapshot()?.delivery, 'unavailable');
  assert.equal(broken.getSnapshot()?.body, 'Still readable');
  broken.dispose();
  const f = fixture(); context.after(() => f.delivery.dispose());
  f.delivery.show('Peak', '09:00', 'peak'); f.event(0, 'onerror');
  assert.equal(f.delivery.getSnapshot()?.delivery, 'unavailable');
  assert.equal(f.delivery.getSnapshot()?.title, 'Peak'); assert.equal(f.closed(), 1);
});

test('a replaced or dismissed notification cannot overwrite newer feedback; disposal closes native notices', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); context.after(() => f.delivery.dispose());
  f.delivery.show('First', 'First body', 'test');
  const staleShow = f.notices[0]!.onshow!;
  f.delivery.show('Second', 'Second body', 'test');
  staleShow.call(f.notices[0]!, new Event('show'));
  assert.equal(f.delivery.getSnapshot()?.title, 'Second');
  assert.equal(f.delivery.getSnapshot()?.delivery, 'pending'); assert.equal(f.closed(), 1);
  f.delivery.dismiss(); context.mock.timers.tick(DELIVERY_TIMEOUT);
  assert.equal(f.delivery.getSnapshot(), null); assert.equal(f.closed(), 2);
  f.delivery.show('Third', 'Body', 'test'); f.delivery.dispose();
  assert.equal(f.closed(), 3); context.mock.timers.tick(DELIVERY_TIMEOUT); assert.equal(f.delivery.getSnapshot(), null);
  f.delivery.show('After unload', 'Body', 'test'); assert.equal(f.notices.length, 3);
});
