import { id } from '../lib/ids.js';
import { createHash } from 'node:crypto';
import { assertNamed } from '../contracts/index.js';

// Every consequential output is registered here with provenance. No agent may
// claim completion without an artifact whose verification references the
// acceptance criteria (enforced by the review engine + orchestrator).
export class ArtifactRepository {
  constructor(db, clock, events) {
    this.db = db;
    this.clock = clock;
    this.events = events;
  }

  register(spec, { actor = 'system' } = {}) {
    const artifact = {
      id: id('art'),
      task_id: spec.task_id,
      path_or_uri: spec.path_or_uri ?? null,
      type: spec.type,
      authoring_agent: spec.authoring_agent,
      content_hash: spec.content != null ? sha256(spec.content) : (spec.content_hash ?? null),
      review_state: 'unreviewed',
      verification: spec.verification ?? {},
      sensitivity: spec.sensitivity ?? 'internal',
      retention: spec.retention ?? null,
      created_at: this.clock.now(),
    };
    assertNamed('artifact', artifact);
    const cols = Object.keys(artifact);
    this.db.run(
      `INSERT INTO artifacts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => (c === 'verification' ? JSON.stringify(artifact[c]) : artifact[c])),
    );
    this.events.append('artifact.registered', actor, {
      subjectType: 'artifact', subjectId: artifact.id,
      payload: { task_id: artifact.task_id, type: artifact.type },
    });
    return artifact;
  }

  get(artifactId) {
    const row = this.db.get('SELECT * FROM artifacts WHERE id = ?', [artifactId]);
    return row ? unpack(row) : null;
  }

  forTask(taskId) {
    return this.db.all('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC', [taskId]).map(unpack);
  }

  setReviewState(artifactId, state, { actor = 'system' } = {}) {
    this.db.run('UPDATE artifacts SET review_state = ? WHERE id = ?', [state, artifactId]);
    this.events.append('artifact.review_state', actor, { subjectType: 'artifact', subjectId: artifactId, payload: { state } });
  }
}

function sha256(content) {
  return 'sha256:' + createHash('sha256').update(String(content)).digest('hex');
}

function unpack(row) {
  return { ...row, verification: row.verification ? JSON.parse(row.verification) : {} };
}
