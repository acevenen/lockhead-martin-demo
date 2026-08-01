import { openDb } from '../db/db.js';
import { systemClock } from '../lib/clock.js';
import { createLogger } from '../lib/logger.js';
import { id } from '../lib/ids.js';
import { EventLedger } from '../events/ledger.js';
import { TaskEngine } from '../tasks/engine.js';
import { MemoryRepository } from '../memory/repository.js';
import { AgentRegistry } from '../agents/registry.js';
import { ArtifactRepository } from '../artifacts/repository.js';
import { ReviewEngine } from '../review/engine.js';
import { FailureLog, LessonBook } from '../learning/repository.js';
import { ModelRegistry } from '../routing/model-registry.js';
import { Router } from '../routing/router.js';
import { makeProviderPool } from '../providers/index.js';
import { BoardMeeting } from '../board/meeting.js';
import { HandoffStore } from '../handoff/store.js';

// Assembles the whole control plane from a database + a clock. Everything is
// injectable so tests can run in-memory with a fake clock and the mock provider.
export function createContext({ path = undefined, clock = systemClock, limits = {}, useMock = true, providers = null } = {}) {
  const db = openDb(path);
  const log = createLogger('jarvis.os');
  const events = new EventLedger(db, clock);
  const models = ModelRegistry.load();

  const ctx = {
    db, clock, log, events, models,
    tasks: new TaskEngine(db, clock, events, limits),
    memory: new MemoryRepository(db, clock, events),
    agents: new AgentRegistry(db, clock, events),
    artifacts: null,
    reviews: null,
    failures: new FailureLog(db, clock, events),
    lessons: new LessonBook(db, clock, events),
    router: null,
    providers: providers ?? makeProviderPool({ useMock }),
    runs: new RunTracker(db, clock, events),
    handoffs: new HandoffStore(db, clock, events),
    close: () => db.close(),
  };
  ctx.artifacts = new ArtifactRepository(db, clock, events);
  ctx.reviews = new ReviewEngine(db, clock, events, ctx.artifacts);
  ctx.router = new Router(db, clock, events, ctx.agents, models);
  ctx.board = new BoardMeeting(ctx);
  return ctx;
}

// Records agent runs with model/provider/usage for observability + cost.
export class RunTracker {
  constructor(db, clock, events) { this.db = db; this.clock = clock; this.events = events; }

  start({ task_id, agent_id, model_profile = null, provider = null }) {
    const run = { id: id('run'), task_id, agent_id, model_profile, provider, status: 'running', started_at: this.clock.now() };
    this.db.run(
      `INSERT INTO runs (id, task_id, agent_id, model_profile, provider, status, tokens, started_at) VALUES (?, ?, ?, ?, ?, 'running', '{}', ?)`,
      [run.id, task_id, agent_id, model_profile, provider, run.started_at],
    );
    return run;
  }

  finish(runId, { status = 'completed', tokens = {}, cost_usd = null, error = null } = {}) {
    this.db.run(
      `UPDATE runs SET status = ?, tokens = ?, cost_usd = ?, error = ?, ended_at = ? WHERE id = ?`,
      [status, JSON.stringify(tokens), cost_usd, error, this.clock.now(), runId],
    );
    this.events.append('run.finished', 'system', { subjectType: 'run', subjectId: runId, payload: { status, tokens, cost_usd } });
  }

  list({ since = null } = {}) {
    const rows = since
      ? this.db.all('SELECT * FROM runs WHERE started_at >= ? ORDER BY started_at ASC', [since])
      : this.db.all('SELECT * FROM runs ORDER BY started_at ASC');
    return rows.map((r) => ({ ...r, tokens: JSON.parse(r.tokens || '{}') }));
  }
}
