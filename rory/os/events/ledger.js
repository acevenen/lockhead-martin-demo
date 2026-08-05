import { id } from '../lib/ids.js';
import { redact } from '../lib/redact.js';
import { assertNamed } from '../contracts/index.js';

// Append-only event ledger. This is the spine of auditability: every
// consequential state change writes an event here, and derived views (the
// board meeting, status) read from it. There is deliberately no update() or
// delete() — the ledger only grows.
export class EventLedger {
  constructor(db, clock) {
    this.db = db;
    this.clock = clock;
  }

  /**
   * Record an event. Payload is redacted before storage so no secret can enter
   * the ledger. Returns the stored event.
   */
  append(type, actor, { subjectType = null, subjectId = null, payload = {} } = {}) {
    const event = {
      id: id('evt'),
      type,
      actor,
      subject_type: subjectType,
      subject_id: subjectId,
      payload: redact(payload),
      created_at: this.clock.now(),
    };
    assertNamed('event', event);
    this.db.run(
      `INSERT INTO events (id, type, actor, subject_type, subject_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.type, event.actor, event.subject_type, event.subject_id,
        JSON.stringify(event.payload), event.created_at],
    );
    return event;
  }

  /** Events in [since, until), optionally filtered by type. Oldest first. */
  list({ since = null, until = null, type = null } = {}) {
    const where = [];
    const params = [];
    if (since) { where.push('created_at >= ?'); params.push(since); }
    if (until) { where.push('created_at < ?'); params.push(until); }
    if (type) { where.push('type = ?'); params.push(type); }
    const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq ASC`;
    return this.db.all(sql, params).map(this.#hydrate);
  }

  count() {
    return this.db.get('SELECT COUNT(*) AS n FROM events').n;
  }

  #hydrate(row) {
    return { ...row, payload: JSON.parse(row.payload) };
  }
}
