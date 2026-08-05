import { id } from '../lib/ids.js';
import { assertNamed } from '../contracts/index.js';

// The auditable learning loop (directive §2.4, §12). Failures are recorded and
// linked; lessons are proposed with a prevention rule and only become
// `active` when a real check verifies them — a lesson does not become "verified"
// just because an agent wrote it.

export class FailureLog {
  constructor(db, clock, events) {
    this.db = db; this.clock = clock; this.events = events;
  }

  record(spec, { actor = 'system' } = {}) {
    const failure = {
      id: id('fail'),
      task_id: spec.task_id ?? null,
      run_id: spec.run_id ?? null,
      symptom: spec.symptom,
      impact: spec.impact ?? null,
      evidence: spec.evidence ?? [],
      root_cause_status: spec.root_cause_status ?? 'unknown',
      likely_root_cause: spec.likely_root_cause ?? null,
      contributing_factors: spec.contributing_factors ?? [],
      recurrent: spec.recurrent ?? false,
      containment: spec.containment ?? null,
      proposed_prevention: spec.proposed_prevention ?? null,
      owner: spec.owner ?? null,
      verification_state: spec.verification_state ?? 'not_run',
      lesson_id: spec.lesson_id ?? null,
      created_at: this.clock.now(),
    };
    assertNamed('failure', failure);
    const cols = Object.keys(failure);
    const jsonCols = ['evidence', 'contributing_factors'];
    this.db.run(
      `INSERT INTO failures (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => (jsonCols.includes(c) ? JSON.stringify(failure[c]) : (typeof failure[c] === 'boolean' ? (failure[c] ? 1 : 0) : failure[c]))),
    );
    this.events.append('failure.recorded', actor, {
      subjectType: 'failure', subjectId: failure.id,
      payload: { symptom: failure.symptom, task_id: failure.task_id },
    });
    return failure;
  }

  linkLesson(failureId, lessonId, { actor = 'system' } = {}) {
    this.db.run('UPDATE failures SET lesson_id = ? WHERE id = ?', [lessonId, failureId]);
    this.events.append('failure.lesson_linked', actor, { subjectType: 'failure', subjectId: failureId, payload: { lesson_id: lessonId } });
  }

  list({ since = null } = {}) {
    const rows = since
      ? this.db.all('SELECT * FROM failures WHERE created_at >= ? ORDER BY created_at ASC', [since])
      : this.db.all('SELECT * FROM failures ORDER BY created_at ASC');
    return rows.map(unpackFailure);
  }
}

export class LessonBook {
  constructor(db, clock, events) {
    this.db = db; this.clock = clock; this.events = events;
  }

  propose(draft, { actor = 'system' } = {}) {
    const lesson = {
      id: id('lsn'),
      trigger_conditions: draft.trigger_conditions,
      scopes: draft.scopes ?? [],
      tags: draft.tags ?? [],
      prevention_instruction: draft.prevention_instruction,
      enforcement_mechanism: draft.enforcement_mechanism ?? null,
      regression_check: draft.regression_check ?? null,
      evidence: draft.evidence ?? [],
      confidence: draft.confidence ?? 'uncertain',
      status: 'proposed',
      supersedes: draft.supersedes ?? null,
      last_verified: null,
      owner: draft.owner ?? null,
      task_type: draft.task_type ?? null,
      created_at: this.clock.now(),
    };
    assertNamed('lesson', lesson);
    const cols = Object.keys(lesson);
    const jsonCols = ['scopes', 'tags', 'evidence'];
    this.db.run(
      `INSERT INTO lessons (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => (jsonCols.includes(c) ? JSON.stringify(lesson[c]) : lesson[c])),
    );
    this.events.append('lesson.proposed', actor, {
      subjectType: 'lesson', subjectId: lesson.id,
      payload: { trigger: lesson.trigger_conditions },
    });
    return lesson;
  }

  /**
   * Verify a proposed lesson. A lesson only becomes `active` with real evidence:
   * a passing check result, or explicit reviewer approval. Refuses otherwise.
   */
  verify(lessonId, { verifier = 'system', checkPassed = false, reviewerApproved = false, evidence = [] } = {}) {
    if (!checkPassed && !reviewerApproved) {
      throw errCode('a lesson cannot be verified without a passing check or reviewer approval', 'UNVERIFIED');
    }
    const now = this.clock.now();
    const existing = this.get(lessonId);
    if (!existing) throw errCode(`lesson ${lessonId} not found`, 'NOT_FOUND');
    const mergedEvidence = [...existing.evidence, ...evidence];
    if (existing.supersedes) {
      this.db.run(`UPDATE lessons SET status = 'superseded' WHERE id = ?`, [existing.supersedes]);
    }
    this.db.run(
      `UPDATE lessons SET status = 'active', last_verified = ?, confidence = 'stated', evidence = ? WHERE id = ?`,
      [now, JSON.stringify(mergedEvidence), lessonId],
    );
    this.events.append('lesson.verified', verifier, {
      subjectType: 'lesson', subjectId: lessonId,
      payload: { via: checkPassed ? 'check' : 'reviewer' },
    });
    return this.get(lessonId);
  }

  markIneffective(lessonId, { actor = 'system', reason = null } = {}) {
    this.db.run(`UPDATE lessons SET status = 'ineffective' WHERE id = ?`, [lessonId]);
    this.events.append('lesson.ineffective', actor, { subjectType: 'lesson', subjectId: lessonId, payload: { reason } });
  }

  get(lessonId) {
    const row = this.db.get('SELECT * FROM lessons WHERE id = ?', [lessonId]);
    return row ? unpackLesson(row) : null;
  }

  /** Active lessons relevant to a task, matched by task_type / tags / scopes. */
  relevant({ taskType = null, tags = [], scopes = [] } = {}) {
    const active = this.db.all(`SELECT * FROM lessons WHERE status = 'active'`).map(unpackLesson);
    return active.filter((l) => {
      if (taskType && l.task_type && l.task_type === taskType) return true;
      if (tags.length && l.tags.some((t) => tags.includes(t))) return true;
      if (scopes.length && l.scopes.some((s) => scopes.includes(s))) return true;
      // A lesson with no narrowing conditions applies broadly.
      return !l.task_type && l.tags.length === 0 && l.scopes.length === 0;
    });
  }

  list({ status = null } = {}) {
    const rows = status
      ? this.db.all('SELECT * FROM lessons WHERE status = ? ORDER BY created_at ASC', [status])
      : this.db.all('SELECT * FROM lessons ORDER BY created_at ASC');
    return rows.map(unpackLesson);
  }
}

function unpackFailure(row) {
  return { ...row, recurrent: !!row.recurrent, evidence: JSON.parse(row.evidence), contributing_factors: JSON.parse(row.contributing_factors) };
}
function unpackLesson(row) {
  return { ...row, scopes: JSON.parse(row.scopes), tags: JSON.parse(row.tags), evidence: JSON.parse(row.evidence) };
}
function errCode(msg, code) {
  const e = new Error(msg); e.code = code; return e;
}
