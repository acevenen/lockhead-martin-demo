import { id } from '../lib/ids.js';
import { assertNamed } from '../contracts/index.js';

// Handoffs are the bounded contract one agent passes to another (directive §6).
// Every handoff is validated against the handoff schema before it is stored, so
// a malformed or under-specified handoff cannot enter the system.
export class HandoffStore {
  constructor(db, clock, events) { this.db = db; this.clock = clock; this.events = events; }

  create(spec, { actor = 'system' } = {}) {
    const envelope = {
      handoff_id: spec.handoff_id ?? id('ho'),
      task_id: spec.task_id,
      from_agent: spec.from_agent,
      to_agent: spec.to_agent,
      objective: spec.objective,
      status: spec.status ?? 'ready',
      summary: spec.summary ?? '',
      changes: spec.changes ?? [],
      decisions: spec.decisions ?? [],
      assumptions: spec.assumptions ?? [],
      verification: spec.verification ?? { commands_or_checks: [], result: 'not_run' },
      risks: spec.risks ?? [],
      open_questions: spec.open_questions ?? [],
      recommended_next_action: spec.recommended_next_action ?? '',
      created_at: this.clock.now(),
    };
    assertNamed('handoff', envelope);
    this.db.run(
      `INSERT INTO handoffs (handoff_id, task_id, envelope, created_at) VALUES (?, ?, ?, ?)`,
      [envelope.handoff_id, envelope.task_id, JSON.stringify(envelope), envelope.created_at],
    );
    this.events.append('handoff.created', actor, {
      subjectType: 'handoff', subjectId: envelope.handoff_id,
      payload: { from: envelope.from_agent, to: envelope.to_agent, status: envelope.status },
    });
    return envelope;
  }

  get(handoffId) {
    const row = this.db.get('SELECT envelope FROM handoffs WHERE handoff_id = ?', [handoffId]);
    return row ? JSON.parse(row.envelope) : null;
  }

  forTask(taskId) {
    return this.db.all('SELECT envelope FROM handoffs WHERE task_id = ? ORDER BY created_at ASC', [taskId])
      .map((r) => JSON.parse(r.envelope));
  }
}
