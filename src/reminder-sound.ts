const RESUME_TIMEOUT = 1_000;

/** One quiet synthesized chime, with no downloaded audio or extra runtime. */
export function createReminderSound(create: () => AudioContext = () => new AudioContext()) {
  let context: AudioContext | undefined, disposed = false, generation = 0;
  let cancelResume: (() => void) | undefined, stopTone: (() => void) | undefined;
  const audio = () => {
    if (!context || context.state === 'closed') context = create();
    return context;
  };
  const stop = () => {
    generation++;
    cancelResume?.(); cancelResume = undefined;
    stopTone?.(); stopTone = undefined;
  };
  return {
    // Call directly from enabling or another user gesture, before awaiting
    // notification permission. This unlocks later background reminders.
    prime() {
      if (disposed) return;
      try { const ctx = audio(); if (ctx.state !== 'running') void ctx.resume().catch(() => {}); } catch {}
    },
    async play(): Promise<boolean> {
      if (disposed) return false;
      stop();
      const operation = generation;
      try {
        const ctx = audio();
        if (ctx.state !== 'running') {
          const ready = await new Promise<boolean>(resolve => {
            let settled = false;
            const done = (value: boolean) => {
              if (settled) return;
              settled = true; clearTimeout(timer); cancelResume = undefined; resolve(value);
            };
            const timer = setTimeout(() => done(false), RESUME_TIMEOUT);
            cancelResume = () => done(false);
            try { void ctx.resume().then(() => done(ctx.state === 'running'), () => done(false)); }
            catch { done(false); }
          });
          if (!ready) return false;
        }
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
        oscillator.onended = () => { release(); if (operation === generation) stopTone = undefined; };
        oscillator.start(at); oscillator.stop(at + .56);
        return true;
      } catch { stopTone?.(); stopTone = undefined; return false; }
    },
    stop,
    dispose() {
      disposed = true; stop();
      try { if (context && context.state !== 'closed') void context.close().catch(() => {}); } catch {}
      context = undefined;
    },
  };
}
export type ReminderSound = ReturnType<typeof createReminderSound>;
