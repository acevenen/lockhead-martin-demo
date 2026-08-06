// The CEO orchestration skeleton. It decomposes an objective into bounded
// tasks, routes each to an agent + model profile, and drives it through the
// assign -> run -> review -> complete flow with a review loop, budgets, and
// reviewer separation. The CEO orchestrates; it does not do every task itself
// (directive §9). Worker/reviewer behaviours are injectable so the same flow
// runs against the mock provider in tests and real agents later.
export class Orchestrator {
  constructor(ctx, { ceoId = 'ceo-claude', maxReviewRounds = 2 } = {}) {
    this.ctx = ctx;
    this.ceoId = ceoId;
    this.maxReviewRounds = maxReviewRounds;
  }

  /** CEO decomposes an objective into queued tasks under a goal. */
  plan({ goalId = null, objective, subtasks = [] }) {
    const { tasks, events } = this.ctx;
    events.append('ceo.plan', this.ceoId, { payload: { objective, count: subtasks.length } });
    return subtasks.map((st) => {
      const t = tasks.create({ ...st, parent_goal: goalId, objective: st.objective }, { actor: this.ceoId });
      tasks.transition(t.id, 'planned', { actor: this.ceoId });
      return tasks.transition(t.id, 'queued', { actor: this.ceoId });
    });
  }

  /** Route + assign a queued task, choosing a reviewer distinct from the worker. */
  assign(taskId, { taskType = null } = {}) {
    const { tasks, router, agents } = this.ctx;
    const task = tasks.get(taskId);
    const decision = router.route(task, { taskType, actor: this.ceoId });
    const worker = agents.get(decision.selected_agent);
    const reviewer = this.#pickReviewer(worker);
    const assigned = tasks.assign(taskId, worker.id, { reviewer: reviewer?.id ?? null, actor: this.ceoId });
    return { task: assigned, decision, worker, reviewer };
  }

  /**
   * Drive a queued/assigned task to completion. `worker(task, tools)` returns
   * { artifact, evidence, handoff }. `reviewer(task, artifacts)` returns
   * { decision, required_changes, findings }. Loops on changes_requested up to
   * maxReviewRounds, then blocks.
   */
  async run(taskId, { worker, reviewer, taskType = null } = {}) {
    const { tasks, artifacts, reviews, runs, lessons } = this.ctx;
    let { task, worker: workerAgent, reviewer: reviewerAgent } = this.#ensureAssigned(taskId, taskType);

    // Load relevant lessons into the worker's context (directive §12).
    const lessonContext = lessons.relevant({
      taskType, tags: task.required_capabilities, scopes: task.memory_scopes,
    });

    const producedArtifacts = [];
    const reviewRecords = [];

    for (let round = 1; round <= this.maxReviewRounds; round++) {
      task = tasks.transition(task.id, 'running', { actor: workerAgent.id });
      const run = runs.start({ task_id: task.id, agent_id: workerAgent.id, model_profile: this.#profileFor(task) });

      const out = await worker(task, {
        provider: this.ctx.providers.get(),
        lessons: lessonContext,
        round,
      });
      runs.finish(run.id, { status: 'completed', tokens: out?.tokens ?? {} });

      const artifact = artifacts.register(
        { task_id: task.id, authoring_agent: workerAgent.id, ...out.artifact },
        { actor: workerAgent.id },
      );
      producedArtifacts.push(artifact);
      if (out.evidence) tasks.addEvidence(task.id, out.evidence, { actor: workerAgent.id });

      task = tasks.transition(task.id, 'review_requested', { actor: workerAgent.id });

      const verdict = await reviewer(task, [artifact], { round });
      const review = reviews.submit(
        {
          task_id: task.id, worker_agent: workerAgent.id, reviewer_agent: reviewerAgent?.id ?? workerAgent.id,
          artifact_ids: [artifact.id], criteria: task.acceptance_criteria,
          decision: verdict.decision, required_changes: verdict.required_changes ?? [], findings: verdict.findings ?? [],
        },
        { taskRisk: task.risk },
      );
      reviewRecords.push(review);

      if (verdict.decision === 'approved') {
        task = tasks.transition(task.id, 'completed', {
          actor: this.ceoId,
          patch: { recommended_next_action: verdict.next_action ?? null },
        });
        return { task, artifacts: producedArtifacts, reviews: reviewRecords, status: 'completed' };
      }
      if (verdict.decision === 'escalated' || round === this.maxReviewRounds) {
        task = tasks.transition(task.id, 'blocked', { actor: this.ceoId, patch: { recommended_next_action: 'needs owner decision' } });
        return { task, artifacts: producedArtifacts, reviews: reviewRecords, status: 'blocked' };
      }
      // changes_requested: loop back into running.
      task = tasks.transition(task.id, 'changes_requested', { actor: reviewerAgent?.id ?? this.ceoId });
    }
    return { task, artifacts: producedArtifacts, reviews: reviewRecords, status: task.status };
  }

  #ensureAssigned(taskId, taskType) {
    const { tasks, agents } = this.ctx;
    let task = tasks.get(taskId);
    if (task.status === 'queued') {
      const a = this.assign(taskId, { taskType });
      return { task: a.task, worker: a.worker, reviewer: a.reviewer };
    }
    const worker = agents.get(task.assigned_agent);
    const reviewer = task.reviewer ? agents.get(task.reviewer) : null;
    return { task, worker, reviewer };
  }

  #pickReviewer(worker) {
    const { agents } = this.ctx;
    const roles = worker.reviewer_roles || [];
    for (const cand of agents.list({ status: 'active' })) {
      if (cand.id !== worker.id && roles.includes(cand.role)) return cand;
    }
    // Fallback: any active agent that isn't the worker.
    return agents.list({ status: 'active' }).find((a) => a.id !== worker.id) ?? null;
  }

  #profileFor(task) {
    const d = this.ctx.router.forTask(task.id).slice(-1)[0];
    return d?.selected_model_profile ?? null;
  }
}
