import { assertNamed } from '../contracts/index.js';

// The agent company roster. Manifests are validated against the agent-manifest
// contract before they enter the registry. Capabilities and tools are only what
// a manifest declares — never inferred from prose (directive §15).
export class AgentRegistry {
  constructor(db, clock, events) {
    this.db = db;
    this.clock = clock;
    this.events = events;
  }

  register(manifest, { actor = 'system' } = {}) {
    assertNamed('agent-manifest', manifest);
    const now = this.clock.now();
    const existing = this.db.get('SELECT id FROM agents WHERE id = ?', [manifest.id]);
    this.db.run(
      `INSERT OR REPLACE INTO agents (id, manifest, status, version, source_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM agents WHERE id = ?), ?), ?)`,
      [manifest.id, JSON.stringify(manifest), manifest.status, manifest.version ?? '0.1.0',
        manifest.source_provenance?.source_hash ?? null, manifest.id, now, now],
    );
    this.events.append(existing ? 'agent.updated' : 'agent.registered', actor, {
      subjectType: 'agent', subjectId: manifest.id,
      payload: { role: manifest.role, department: manifest.department, status: manifest.status },
    });
    return manifest;
  }

  get(agentId) {
    const row = this.db.get('SELECT * FROM agents WHERE id = ?', [agentId]);
    return row ? JSON.parse(row.manifest) : null;
  }

  list({ status = null, department = null } = {}) {
    const rows = this.db.all('SELECT manifest FROM agents ORDER BY id ASC');
    let out = rows.map((r) => JSON.parse(r.manifest));
    if (status) out = out.filter((m) => m.status === status);
    if (department) out = out.filter((m) => m.department === department);
    return out;
  }

  /** Agents that can accept a task type and are active, best-capability first. */
  candidatesFor({ taskType = null, capabilities = [] } = {}) {
    return this.list({ status: 'active' })
      .map((m) => ({ manifest: m, score: score(m, taskType, capabilities) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.manifest);
  }
}

function score(manifest, taskType, capabilities) {
  let s = 0;
  if (taskType && (manifest.accepted_task_types || []).includes(taskType)) s += 5;
  const caps = new Set(manifest.capabilities || []);
  for (const c of capabilities) if (caps.has(c)) s += 2;
  // A generalist executive can always take work, but at low priority.
  if (s === 0 && manifest.role?.startsWith('ceo')) s = 1;
  return s;
}
