import { id } from '../lib/ids.js';
import { assertNamed } from '../contracts/index.js';

// Review gate. Enforces reviewer separation: an agent cannot be the sole
// approver of its own high-risk output (directive §11). Completion means the
// acceptance criteria were verified by someone other than the worker.
export class ReviewEngine {
  constructor(db, clock, events, artifacts) {
    this.db = db;
    this.clock = clock;
    this.events = events;
    this.artifacts = artifacts;
  }

  /**
   * Record a review decision. `taskRisk` is used to enforce separation:
   * high/critical work cannot be self-approved.
   */
  submit(spec, { actor = null, taskRisk = 'low' } = {}) {
    const highRisk = taskRisk === 'high' || taskRisk === 'critical';
    if (highRisk && spec.decision === 'approved' && spec.reviewer_agent === spec.worker_agent) {
      throw errCode('reviewer separation: high-risk output cannot be self-approved', 'SELF_APPROVAL');
    }
    const review = {
      review_id: id('rev'),
      task_id: spec.task_id,
      artifact_ids: spec.artifact_ids ?? [],
      worker_agent: spec.worker_agent,
      reviewer_agent: spec.reviewer_agent,
      criteria: spec.criteria ?? [],
      findings: spec.findings ?? [],
      evidence: spec.evidence ?? [],
      decision: spec.decision,
      required_changes: spec.required_changes ?? [],
      created_at: this.clock.now(),
    };
    assertNamed('review', review);
    const cols = Object.keys(review);
    const jsonCols = ['artifact_ids', 'criteria', 'findings', 'evidence', 'required_changes'];
    this.db.run(
      `INSERT INTO reviews (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => (jsonCols.includes(c) ? JSON.stringify(review[c]) : review[c])),
    );
    // Propagate the decision to the reviewed artifacts.
    if (this.artifacts) {
      const state = review.decision === 'approved' ? 'approved'
        : review.decision === 'changes_requested' ? 'changes_requested' : 'unreviewed';
      for (const aid of review.artifact_ids) this.artifacts.setReviewState(aid, state, { actor: review.reviewer_agent });
    }
    this.events.append('review.submitted', actor ?? review.reviewer_agent, {
      subjectType: 'task', subjectId: review.task_id,
      payload: { decision: review.decision, reviewer: review.reviewer_agent, worker: review.worker_agent },
    });
    return review;
  }

  forTask(taskId) {
    return this.db.all('SELECT * FROM reviews WHERE task_id = ? ORDER BY created_at ASC', [taskId])
      .map((r) => ({
        ...r,
        artifact_ids: JSON.parse(r.artifact_ids), criteria: JSON.parse(r.criteria),
        findings: JSON.parse(r.findings), evidence: JSON.parse(r.evidence),
        required_changes: JSON.parse(r.required_changes),
      }));
  }
}

function errCode(msg, code) {
  const e = new Error(msg);
  e.code = code;
  return e;
}
