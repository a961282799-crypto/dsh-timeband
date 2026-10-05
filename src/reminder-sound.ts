const RESUME_TIMEOUT = 1_000;

/** One quiet synthesized chime, with no downloaded audio or extra runtime. */
export function createReminderSound(create: () => AudioContext = () => new AudioContext()) {
  let context: AudioContext | undefined, disposed = false, generation = 0;
  let cancelResume: (() => void) | undefined, stopTone: (() => void) | undefined;
  let unlocked = false, priming: Promise<boolean> | undefined;
  const audio = () => {
    if (!context || context.state === 'closed') context = create();
    return context;
  };
  const cancel = () => {
    generation++;
    cancelResume?.(); cancelResume = undefined;
    stopTone?.(); stopTone = undefined;
  };
  const pause = (ctx = context) => {
    if (!ctx || ctx !== context || stopTone || ctx.state === 'closed') return;
    try { void ctx.suspend().catch(() => {}); } catch {}
  };
  const stop = () => { cancel(); pause(); };
  const release = () => {
    cancel();
    const previous = context;
    context = undefined; unlocked = false; priming = undefined;
    try { if (previous && previous.state !== 'closed') void previous.close().catch(() => {}); } catch {}
  };
  const resume = (ctx: AudioContext, operation: number) => new Promise<boolean>(resolve => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (cancelResume === cancelPending) cancelResume = undefined;
      resolve(value);
    };
    const cancelPending = () => done(false);
    const timer = setTimeout(() => done(false), RESUME_TIMEOUT);
    cancelResume = cancelPending;
    // Always enqueue resume, even if a previous suspend has not settled yet.
    try { void ctx.resume().then(() => {
      const current = !disposed && context === ctx && operation === generation;
      if (settled || !current) { if (current && !stopTone) pause(ctx); done(false); return; }
      unlocked = ctx.state === 'running'; done(unlocked);
    }, () => done(false)); } catch { done(false); }
  });
  return {
    // Call directly from enabling or another user gesture, before awaiting
    // notification permission. This unlocks later background reminders.
    prime(): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (unlocked) return Promise.resolve(true);
      if (priming) return priming;
      try {
        const ctx = audio(), operation = generation;
        const pending = resume(ctx, operation).then(ready => {
          if (operation === generation) pause(ctx);
          if (priming === pending) priming = undefined;
          return ready;
        });
        priming = pending;
        return pending;
      } catch { return Promise.resolve(false); }
    },
    async play(): Promise<boolean> {
      if (disposed) return false;
      cancel();
      const operation = generation;
      try {
        const ctx = audio();
        if (!await resume(ctx, operation)) return false;
        if (disposed || operation !== generation || ctx.state !== 'running') return false;
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        const at = ctx.currentTime + .01;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, at);
        oscillator.frequency.setValueAtTime(660, at + .26);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.075, at + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, at + .24);
        gain.gain.setValueAtTime(0, at + .25);
        gain.gain.linearRampToValueAtTime(.065, at + .275);
        gain.gain.exponentialRampToValueAtTime(.0001, at + .53);
        gain.gain.linearRampToValueAtTime(0, at + .55);
        oscillator.connect(gain); gain.connect(ctx.destination);
        const release = () => {
          oscillator.onended = null;
          try { oscillator.stop(); } catch {}
          oscillator.disconnect(); gain.disconnect();
        };
        stopTone = release;
        oscillator.onended = () => { release(); if (operation === generation) { stopTone = undefined; pause(ctx); } };
        oscillator.start(at); oscillator.stop(at + .56);
        return true;
      } catch { if (operation === generation) stop(); return false; }
    },
    stop,
    release,
    dispose() {
      disposed = true; release();
    },
  };
}
export type ReminderSound = ReturnType<typeof createReminderSound>;
