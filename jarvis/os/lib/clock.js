// A tiny clock abstraction so time is injectable and tests are deterministic.
// Production uses the system clock; tests pass a fake that advances on demand.

export const systemClock = {
  now() {
    return new Date().toISOString();
  },
};

/**
 * A deterministic clock for tests. Starts at `start` and advances `stepMs`
 * every call to now() unless auto is false.
 */
export function fakeClock(start = '2026-01-01T00:00:00.000Z', stepMs = 1000, auto = true) {
  let t = new Date(start).getTime();
  return {
    now() {
      const iso = new Date(t).toISOString();
      if (auto) t += stepMs;
      return iso;
    },
    advance(ms) {
      t += ms;
    },
    set(iso) {
      t = new Date(iso).getTime();
    },
  };
}
