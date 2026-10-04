import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderSound } from '../src/reminder-sound.ts';

function suspended() {
  let state: AudioContextState = 'suspended', release!: () => void, starts = 0, closed = 0;
  const context = {
    get state() { return state; },
    resume() { return new Promise<void>(resolve => { release = () => { state = 'running'; resolve(); }; }); },
    close() { state = 'closed'; closed++; return Promise.resolve(); },
    createOscillator() { starts++; throw new Error('a cancelled resume must not create a tone'); },
  } as unknown as AudioContext;
  return { sound: createReminderSound(() => context), resume: () => release(), starts: () => starts, closed: () => closed };
}

test('closing or unloading cancels a suspended audio request before it can play later', async () => {
  for (const dispose of [false, true]) {
    const f = suspended();
    const playing = f.sound.play();
    if (dispose) f.sound.dispose(); else f.sound.stop();
    f.resume();
    assert.equal(await playing, false); assert.equal(f.starts(), 0);
    if (!dispose) f.sound.dispose();
    assert.equal(f.closed(), 1); assert.equal(await f.sound.play(), false);
  }
});

test('an unanswered autoplay request times out without delaying the visible reminder indefinitely', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = suspended(); context.after(() => f.sound.dispose());
  const playing = f.sound.play();
  context.mock.timers.tick(1000);
  assert.equal(await playing, false);
  f.resume(); await Promise.resolve(); assert.equal(f.starts(), 0);
});
