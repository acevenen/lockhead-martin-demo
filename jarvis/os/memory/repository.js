import { id } from '../lib/ids.js';
import { looksLikeSecret } from '../lib/redact.js';
import { assertNamed, validateNamed } from '../contracts/index.js';

const JSON_COLS = ['tags'];

// Durable memory is written proposal-first (directive §7.3). An agent proposes;
// policy decides whether it auto-accepts or needs the owner. Identity,
// preferences, goals, boundaries (constraints), and restricted memories always
// need the owner. Conflicts become `disputed`, never silently merged.
export class MemoryRepository {
  constructor(db, clock, events) {
    this.db = db;
    this.clock = clock;
    this.events = events;
  }

  /** True when the owner must approve this memory before it becomes active. */
  requiresApproval(m) {
    if (m.sensitivity === 'restricted') return true;
    if (['preference', 'goal', 'constraint'].includes(m.type)) return true;
    if (m.scope === 'identity') return true;
    return false;
  }

  /**
   * Propose a durable memory. Returns { proposal, memory, auto } where `auto`
   * is true if policy accepted it immediately. Refuses to store secrets.
   */
  propose(draft, { proposer = 'system', autoAcceptAllowed = true } = {}) {
    if (looksLikeSecret('content', draft.content) || looksLikeSecret(draft.subject, draft.content)) {
      throw errCode('refusing to store a secret-like value in memory', 'SECRET_REFUSED');
    }
    const now = this.clock.now();
    const memory = {
      id: id('mem'),
      type: draft.type,
      scope: draft.scope ?? 'global',
      subject: draft.subject,
      content: draft.content,
      status: 'proposed',
      source_type: draft.source_type ?? 'agent',
      source_reference: draft.source_reference ?? null,
      created_by: proposer,
      confidence: draft.confidence ?? 'stated',
      sensitivity: draft.sensitivity ?? 'internal',
      valid_from: draft.valid_from ?? null,
      valid_until: draft.valid_until ?? null,
      supersedes: draft.supersedes ?? null,
      tags: draft.tags ?? [],
      approval_required: false,
      approved_by: null,
      created_at: now,
      updated_at: now,
    };
    memory.approval_required = this.requiresApproval(memory);
    assertNamed('memory', memory);

    const proposal = {
      id: id('prop'),
      memory,
      proposer,
      status: memory.approval_required ? 'needs_approval' : 'pending',
      reason: draft.reason ?? null,
      decided_by: null,
      decided_at: null,
      created_at: now,
    };
    this.db.run(
      `INSERT INTO memory_proposals (id, memory, proposer, status, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [proposal.id, JSON.stringify(memory), proposer, proposal.status, proposal.reason, now],
    );
    this.events.append('memory.proposed', proposer, {
      subjectType: 'memory', subjectId: memory.id,
      payload: { type: memory.type, subject: memory.subject, needs_approval: memory.approval_required },
    });

    if (!memory.approval_required && autoAcceptAllowed) {
      const accepted = this.accept(proposal.id, { approver: 'policy:auto' });
      return { proposal: { ...proposal, status: 'accepted' }, memory: accepted, auto: true };
    }
    return { proposal, memory, auto: false };
  }

  /** Accept a proposal into active memory. Handles supersession and conflict. */
  accept(proposalId, { approver = 'owner' } = {}) {
    const prop = this.#getProposal(proposalId);
    if (!prop) throw errCode(`proposal ${proposalId} not found`, 'NOT_FOUND');
    if (prop.status === 'accepted') return this.get(prop.memory.id);
    const now = this.clock.now();
    const memory = { ...prop.memory, approved_by: approver, updated_at: now };

    // Supersession: an explicit supersedes pointer retires the old record.
    if (memory.supersedes) {
      const old = this.get(memory.supersedes);
      if (old && old.status === 'active') this.#setStatus(old.id, 'superseded', approver);
      memory.status = 'active';
    } else {
      // Conflict: same (type, scope, subject) already active -> dispute, keep both.
      const conflict = this.db.get(
        `SELECT * FROM memories WHERE type = ? AND scope = ? AND subject = ? AND status = 'active' LIMIT 1`,
        [memory.type, memory.scope, memory.subject],
      );
      memory.status = conflict ? 'disputed' : 'active';
      if (conflict) {
        this.events.append('memory.conflict', approver, {
          subjectType: 'memory', subjectId: memory.id,
          payload: { conflicts_with: conflict.id, subject: memory.subject },
        });
      }
    }

    this.#insertMemory(memory);
    this.db.run(
      `UPDATE memory_proposals SET status = 'accepted', decided_by = ?, decided_at = ? WHERE id = ?`,
      [approver, now, proposalId],
    );
    this.events.append('memory.accepted', approver, {
      subjectType: 'memory', subjectId: memory.id,
      payload: { status: memory.status },
    });
    return memory;
  }

  reject(proposalId, { approver = 'owner', reason = null } = {}) {
    const now = this.clock.now();
    this.db.run(
      `UPDATE memory_proposals SET status = 'rejected', decided_by = ?, decided_at = ?, reason = COALESCE(?, reason) WHERE id = ?`,
      [approver, now, reason, proposalId],
    );
    this.events.append('memory.rejected', approver, { subjectType: 'proposal', subjectId: proposalId, payload: { reason } });
  }

  /** Flag an active memory as disputed (surfaces the conflict for resolution). */
  dispute(memoryId, { actor = 'system', reason = null } = {}) {
    this.#setStatus(memoryId, 'disputed', actor);
    this.events.append('memory.disputed', actor, { subjectType: 'memory', subjectId: memoryId, payload: { reason } });
  }

  get(memoryId) {
    const row = this.db.get('SELECT * FROM memories WHERE id = ?', [memoryId]);
    return row ? unpack(row) : null;
  }

  list({ type = null, status = 'active', scope = null } = {}) {
    const where = [];
    const params = [];
    if (type) { where.push('type = ?'); params.push(type); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (scope) { where.push('scope = ?'); params.push(scope); }
    const sql = `SELECT * FROM memories ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    return this.db.all(sql, params).map(unpack);
  }

  pendingProposals() {
    return this.db.all(`SELECT * FROM memory_proposals WHERE status IN ('pending','needs_approval') ORDER BY created_at ASC`)
      .map((r) => ({ ...r, memory: JSON.parse(r.memory) }));
  }

  /** Full-text search over active durable memory (FTS5). Semantic search is a
   *  later optional index behind the same method signature (ADR-0004). */
  search(query, { limit = 10 } = {}) {
    try {
      const rows = this.db.all(
        `SELECT m.* FROM memories_fts f JOIN memories m ON m.id = f.id
         WHERE memories_fts MATCH ? AND m.status = 'active' LIMIT ?`,
        [query, limit],
      );
      return rows.map(unpack);
    } catch {
      // FTS MATCH is strict about syntax; fall back to LIKE for arbitrary input.
      const like = `%${query}%`;
      return this.db.all(
        `SELECT * FROM memories WHERE status = 'active' AND (subject LIKE ? OR content LIKE ?) LIMIT ?`,
        [like, like, limit],
      ).map(unpack);
    }
  }

  #getProposal(proposalId) {
    const row = this.db.get('SELECT * FROM memory_proposals WHERE id = ?', [proposalId]);
    return row ? { ...row, memory: JSON.parse(row.memory) } : null;
  }

  #insertMemory(memory) {
    const cols = Object.keys(memory);
    this.db.run(
      `INSERT OR REPLACE INTO memories (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => pack(c, memory[c])),
    );
    this.db.run(
      `INSERT INTO memories_fts (id, subject, content, tags) VALUES (?, ?, ?, ?)`,
      [memory.id, memory.subject, memory.content, (memory.tags || []).join(' ')],
    );
  }

  #setStatus(memoryId, status, actor) {
    this.db.run('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?', [status, this.clock.now(), memoryId]);
  }
}

function pack(col, value) {
  if (JSON_COLS.includes(col)) return JSON.stringify(value ?? []);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function unpack(row) {
  const out = { ...row };
  out.tags = row.tags ? JSON.parse(row.tags) : [];
  out.approval_required = !!row.approval_required;
  return out;
}

function errCode(msg, code) {
  const e = new Error(msg);
  e.code = code;
  return e;
}
