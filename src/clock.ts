/** One Cordis-owned clock for every mounted view. Always re-read wall time after sleep. */
export function createClock() {
  let snapshot = Date.now();
  const listeners = new Set<() => void>();
  const update = () => {
    snapshot = Date.now();
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      let timer: ReturnType<typeof setInterval> | undefined;
      const resume = () => {
        clearInterval(timer);
        timer = undefined;
        update();
        if (document.visibilityState !== 'hidden') timer = setInterval(update, 1000);
      };
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('focus', resume);
      window.addEventListener('pageshow', resume);
      resume();
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('focus', resume);
        window.removeEventListener('pageshow', resume);
      };
    },
  };
}
