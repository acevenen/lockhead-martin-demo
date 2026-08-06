import { id } from '../lib/ids.js';
import { assertNamed } from '../contracts/index.js';

// Deterministic, auditable routing. Given a task, choose (agent, model profile)
// and record why. No randomness — same inputs always yield the same decision,
// so routing is reproducible and testable (directive §10).
export class Router {
  constructor(db, clock, events, registry, models) {
    this.db = db;
    this.clock = clock;
    this.events = events;
    this.registry = registry; // AgentRegistry
    this.models = models; // ModelRegistry
  }

  /**
   * Decide who does the task and on which model profile. Considers, in order:
   * data egress (sensitivity), capabilities/task-type, task risk, quality need,
   * then a stable tie-break. Returns the persisted routing decision.
   */
  route(task, { taskType = null, requireLocal = null, actor = 'ceo-claude' } = {}) {
    const constraints = [];

    // 1. Data egress. Restricted or identity-scoped data must stay local.
    const mustBeLocal = requireLocal ?? (
      task.risk === 'critical'
      || (task.memory_scopes || []).some((s) => s === 'identity' || s === 'restricted')
    );
    if (mustBeLocal) constraints.push('data must not leave the machine');

    // 2. Candidate agents by capability / accepted task type.
    const candidates = this.registry.candidatesFor({
      taskType, capabilities: task.required_capabilities || [],
    });
    if (candidates.length === 0) {
      throw errCode(`no agent can accept this task (type=${taskType})`, 'NO_AGENT');
    }
    const agent = candidates[0];
    const alternatives = candidates.slice(1, 4).map((m) => ({ agent: m.id, role: m.role }));

    // 3. Model profile: start from the agent's default, then satisfy the
    //    constraints via its allowed profiles + fallbacks.
    const profile = this.#selectProfile(agent, task, mustBeLocal, constraints);

    const decision = {
      task_id: task.id,
      selected_agent: agent.id,
      selected_model_profile: profile,
      constraints,
      alternatives_considered: alternatives,
      decision_summary: `Routed to ${agent.id} (${agent.role}) on profile "${profile}" for a ${task.risk}-risk ${taskType ?? 'task'}${mustBeLocal ? ', kept local for privacy' : ''}.`,
      policy_version: this.models.policyVersion,
      created_at: this.clock.now(),
    };
    assertNamed('routing-decision', decision);
    this.#persist(decision);
    this.events.append('routing.decided', actor, {
      subjectType: 'task', subjectId: task.id,
      payload: { agent: agent.id, profile, local: mustBeLocal },
    });
    return decision;
  }

  #selectProfile(agent, task, mustBeLocal, constraints) {
    const ordered = [agent.default_model_profile, ...(agent.allowed_model_profiles || [])];
    const tryChain = (name, seen = new Set()) => {
      if (!name || seen.has(name) || !this.models.has(name)) return null;
      seen.add(name);
      const okRisk = this.models.allowsRisk(name, task.risk);
      const okEgress = this.models.allowsEgress(name, mustBeLocal);
      if (okRisk && okEgress) return name;
      for (const fb of this.models.get(name).fallbacks) {
        const r = tryChain(fb, seen);
        if (r) return r;
      }
      return null;
    };
    for (const name of ordered) {
      const chosen = tryChain(name);
      if (chosen) {
        if (chosen !== agent.default_model_profile) {
          constraints.push(`default profile "${agent.default_model_profile}" unsuitable; used "${chosen}"`);
        }
        return chosen;
      }
    }
    // Last resort: the local private profile always satisfies egress + risk.
    if (this.models.has('local_private')) {
      constraints.push('no cloud profile satisfied constraints; fell back to local_private');
      return 'local_private';
    }
    throw errCode('no model profile satisfies the task constraints', 'NO_PROFILE');
  }

  #persist(decision) {
    this.db.run(
      `INSERT INTO routing_decisions (id, task_id, selected_agent, selected_model_profile, constraints, alternatives_considered, decision_summary, policy_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id('route'), decision.task_id, decision.selected_agent, decision.selected_model_profile,
        JSON.stringify(decision.constraints), JSON.stringify(decision.alternatives_considered),
        decision.decision_summary, decision.policy_version, decision.created_at],
    );
  }

  forTask(taskId) {
    return this.db.all('SELECT * FROM routing_decisions WHERE task_id = ? ORDER BY created_at ASC', [taskId])
      .map((r) => ({ ...r, constraints: JSON.parse(r.constraints), alternatives_considered: JSON.parse(r.alternatives_considered) }));
  }
}

function errCode(msg, code) {
  const e = new Error(msg); e.code = code; return e;
}
