import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/clock.ts';

test('clock suspends while hidden, refreshes on wake, and removes timers/listeners on disposal', context => {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = new EventTarget();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 });
  let stop: (() => void) | undefined;
  try {
    const clock = createClock();
    let updates = 0;
    const unsubscribe = clock.subscribe(() => updates++);
    stop = clock.start();
    context.mock.timers.tick(1000);
    assert.equal(clock.getSnapshot(), 2000);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    const paused = updates;
    context.mock.timers.tick(8 * 3600000);
    assert.equal(updates, paused);
    doc.visibilityState = 'visible'; win.dispatchEvent(new Event('focus'));
    assert.equal(clock.getSnapshot(), Date.now());
    stop();
    const disposed = updates;
    context.mock.timers.tick(10000); win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(updates, disposed);
    unsubscribe();
  } finally {
    stop?.();
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
