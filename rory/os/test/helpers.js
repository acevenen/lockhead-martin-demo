import { createContext } from '../core/context.js';
import { fakeClock } from '../lib/clock.js';
import { loadAgents } from '../agents/loader.js';

/** An in-memory context with a deterministic clock, for tests. */
export function testContext({ withAgents = false, start, stepMs } = {}) {
  const clock = fakeClock(start, stepMs);
  const ctx = createContext({ path: ':memory:', clock, useMock: true });
  if (withAgents) loadAgents(ctx);
  return ctx;
}
