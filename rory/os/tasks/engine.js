import { id } from '../lib/ids.js';
import { assertNamed } from '../contracts/index.js';
import { TASK_TRANSITIONS } from '../contracts/enums.js';

const JSON_COLS = ['acceptance_criteria', 'exclusions', 'required_capabilities',
  'allowed_tools', 'memory_scopes', 'budget', 'dependencies', 'evidence', 'failure'];

// Default guardrails against runaway delegation / retries (directive §9).
export const DEFAULT_LIMITS = {
  maxDelegationDepth: 4,
  maxRetries: 2,
  defaultTimeoutMs: 5 * 60 * 1000,
};

export class TaskEngine {
  constructor(db, clock, events, limits = {}) {
    this.db = db;
    this.clock = clock;
    this.events = events;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  create(spec, { actor = 'system' } = {}) {
    const now = this.clock.now();
    const task = {
      id: id('task'),
      parent_goal: spec.parent_goal ?? null,
      parent_task: spec.parent_task ?? null,
      objective: spec.objective,
      acceptance_criteria: spec.acceptance_criteria ?? [],
      scope: spec.scope ?? null,
      exclusions: spec.exclusions ?? [],
      priority: spec.priority ?? 50,
      risk: spec.risk ?? 'low',
      required_capabilities: spec.required_capabilities ?? [],
      allowed_tools: spec.allowed_tools ?? [],
      memory_scopes: spec.memory_scopes ?? [],
      budget: { timeout_ms: this.limits.defaultTimeoutMs, ...(spec.budget ?? {}) },
      assigned_agent: spec.assigned_agent ?? null,
      reviewer: spec.reviewer ?? null,
      dependencies: spec.dependencies ?? [],
      status: 'proposed',
      evidence: [],
      failure: null,
      recommended_next_action: spec.recommended_next_action ?? null,
      delegation_depth: spec.delegation_depth ?? 0,
      retries: 0,
      lease_expires_at: null,
      created_at: now,
      updated_at: now,
    };
    assertNamed('task', task);
    if (task.delegation_depth > this.limits.maxDelegationDepth) {
      throw errCode(`delegation depth ${task.delegation_depth} exceeds max ${this.limits.maxDelegationDepth}`, 'DELEGATION_LIMIT');
    }
    this.#insert(task);
    this.events.append('task.created', actor, {
      subjectType: 'task', subjectId: task.id,
      payload: { objective: task.objective, risk: task.risk, priority: task.priority },
    });
    return task;
  }

  /** Create a child task under a parent, enforcing the delegation-depth ceiling. */
  delegate(parentId, spec, { actor = 'system' } = {}) {
    const parent = this.get(parentId);
    if (!parent) throw errCode(`parent task ${parentId} not found`, 'NOT_FOUND');
    return this.create(
      { ...spec, parent_task: parentId, parent_goal: spec.parent_goal ?? parent.parent_goal, delegation_depth: parent.delegation_depth + 1 },
      { actor },
    );
  }

  get(taskId) {
    const row = this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    return row ? unpack(row) : null;
  }

  list({ status = null, goal = null } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (goal) { where.push('parent_goal = ?'); params.push(goal); }
    const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY priority DESC, created_at ASC`;
    return this.db.all(sql, params).map(unpack);
  }

  /**
   * Move a task to a new status. Rejects transitions not allowed by
   * TASK_TRANSITIONS (deny-by-default). `patch` may set assigned_agent,
   * reviewer, evidence, failure, recommended_next_action, lease_expires_at.
   */
  transition(taskId, toStatus, { actor = 'system', patch = {} } = {}) {
    const task = this.get(taskId);
    if (!task) throw errCode(`task ${taskId} not found`, 'NOT_FOUND');
    const allowed = TASK_TRANSITIONS[task.status] || [];
    if (!allowed.includes(toStatus)) {
      throw errCode(`illegal transition ${task.status} -> ${toStatus}`, 'ILLEGAL_TRANSITION');
    }
    if (toStatus === 'queued' && task.status === 'failed') {
      if (task.retries >= this.limits.maxRetries) {
        throw errCode(`retry limit ${this.limits.maxRetries} reached`, 'RETRY_LIMIT');
      }
      patch = { ...patch, retries: task.retries + 1 };
    }
    const merged = applyPatch(task, patch, toStatus, this.clock.now());
    assertNamed('task', merged);
    this.#update(merged);
    this.events.append('task.transition', actor, {
      subjectType: 'task', subjectId: taskId,
      payload: { from: task.status, to: toStatus },
    });
    return merged;
  }

  assign(taskId, agentId, { reviewer = null, actor = 'system' } = {}) {
    return this.transition(taskId, 'assigned', { actor, patch: { assigned_agent: agentId, reviewer } });
  }

  addEvidence(taskId, evidenceItem, { actor = 'system' } = {}) {
    const task = this.get(taskId);
    if (!task) throw errCode(`task ${taskId} not found`, 'NOT_FOUND');
    const merged = { ...task, evidence: [...task.evidence, evidenceItem], updated_at: this.clock.now() };
    assertNamed('task', merged);
    this.#update(merged);
    this.events.append('task.evidence', actor, { subjectType: 'task', subjectId: taskId, payload: { evidence: evidenceItem } });
    return merged;
  }

  #insert(task) {
    const cols = Object.keys(task);
    this.db.run(
      `INSERT INTO tasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => pack(c, task[c])),
    );
  }

  #update(task) {
    const cols = Object.keys(task).filter((c) => c !== 'id');
    this.db.run(
      `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(',')} WHERE id = ?`,
      [...cols.map((c) => pack(c, task[c])), task.id],
    );
  }
}

function applyPatch(task, patch, toStatus, now) {
  const out = { ...task, ...patch, status: toStatus, updated_at: now };
  return out;
}

function pack(col, value) {
  if (JSON_COLS.includes(col)) return value === null ? null : JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function unpack(row) {
  const out = { ...row };
  for (const col of JSON_COLS) {
    if (out[col] === null || out[col] === undefined) {
      out[col] = col === 'failure' ? null : (col === 'budget' ? {} : []);
    } else {
      out[col] = JSON.parse(out[col]);
    }
  }
  return out;
}

function errCode(msg, code) {
  const e = new Error(msg);
  e.code = code;
  return e;
}
