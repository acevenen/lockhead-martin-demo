// Governed tool handlers behind the MCP boundary. Every write identifies the
// caller, validates input (via the repositories' contracts), applies scope +
// approval policy, records an event (the repos do this), and returns a stable id
// + status. Reads are scope-filtered so an agent can't pull memory it may not
// see. The owner (caller === null / 'owner') has full access.

function readableScopes(ctx, caller) {
  if (!caller || caller === 'owner') return '*';
  const m = ctx.agents.get(caller);
  return m ? (m.memory_read_scopes || []) : [];
}

function scopeAllowed(scopes, memScope) {
  if (scopes === '*') return true;
  return scopes.some((s) => s === memScope || s === 'global' && memScope === 'global'
    || (s.endsWith(':*') && memScope.startsWith(s.slice(0, -1)))
    || s === '*');
}

/** Build the callable tool registry for a given caller. */
export function makeTools(ctx, { caller = 'owner' } = {}) {
  const scopes = () => readableScopes(ctx, caller);
  const filterReadable = (mems) => (scopes() === '*' ? mems : mems.filter((m) => scopeAllowed(scopes(), m.scope)));

  return {
    memory_search: async ({ query, limit = 10 }) => filterReadable(ctx.memory.search(query, { limit })),
    memory_get: async ({ id }) => {
      const m = ctx.memory.get(id);
      if (!m) return null;
      if (scopes() !== '*' && !scopeAllowed(scopes(), m.scope)) throw errCode('not authorized to read this scope', 'FORBIDDEN');
      return m;
    },
    memory_propose: async (draft) => {
      const { proposal, memory, auto } = ctx.memory.propose(draft, { proposer: caller });
      return { proposal_id: proposal.id, memory_id: memory.id, status: proposal.status, auto };
    },
    memory_dispute: async ({ id, reason }) => { ctx.memory.dispute(id, { actor: caller, reason }); return { id, status: 'disputed' }; },

    goal_list: async () => ctx.memory.list({ type: 'goal', status: 'active' }),
    project_get: async ({ id }) => ({ id, note: 'project charters live in rory/brain/projects/; read via the filesystem or a future resource endpoint' }),

    task_create: async (spec) => { const t = ctx.tasks.create(spec, { actor: caller }); return { id: t.id, status: t.status }; },
    task_get: async ({ id }) => ctx.tasks.get(id),
    task_update: async ({ id, to_status, patch }) => { const t = ctx.tasks.transition(id, to_status, { actor: caller, patch }); return { id: t.id, status: t.status }; },
    task_list: async ({ status = null, goal = null } = {}) => ctx.tasks.list({ status, goal }),

    artifact_register: async (spec) => { const a = ctx.artifacts.register({ ...spec, authoring_agent: spec.authoring_agent ?? caller }, { actor: caller }); return { id: a.id }; },
    artifact_get: async ({ id }) => ctx.artifacts.get(id),

    agent_list: async () => ctx.agents.list({}).map((m) => ({ id: m.id, role: m.role, department: m.department, status: m.status })),
    agent_get: async ({ id }) => ctx.agents.get(id),

    handoff_create: async (spec) => { const h = ctx.handoffs.create({ ...spec, from_agent: spec.from_agent ?? caller }, { actor: caller }); return { handoff_id: h.handoff_id, status: h.status }; },
    handoff_get: async ({ id }) => ctx.handoffs.get(id),

    lesson_search: async ({ taskType = null, tags = [], scopes: sc = [] } = {}) => ctx.lessons.relevant({ taskType, tags, scopes: sc }),

    review_submit: async (spec) => {
      const task = ctx.tasks.get(spec.task_id);
      const r = ctx.reviews.submit({ ...spec, reviewer_agent: spec.reviewer_agent ?? caller }, { actor: caller, taskRisk: task?.risk ?? 'low' });
      return { review_id: r.review_id, decision: r.decision };
    },
    board_generate: async () => { const b = ctx.board.generate(); return { date: b.date, top_actions: b.json.top_actions }; },

    system_status: async () => {
      const open = ctx.tasks.list({}).filter((t) => !['completed', 'cancelled'].includes(t.status));
      return {
        agents: ctx.agents.list({}).length,
        open_tasks: open.length,
        blocked: open.filter((t) => t.status === 'blocked').length,
        approvals_pending: ctx.memory.pendingProposals().length,
        events: ctx.events.count(),
      };
    },
  };
}

function errCode(msg, code) { const e = new Error(msg); e.code = code; return e; }
