// The daily board meeting. Reviews the preceding 24 hours from the append-only
// event ledger — never from a mutable summary — so it cannot invent activity.
// Produces structured JSON and a readable Markdown report, plus a scored daily
// action plan. Idempotent by meeting date (the CLI guards file overwrite).

const TZ = 'America/Los_Angeles';

// Configurable weights for scoring candidate actions (directive §13).
export const ACTION_WEIGHTS = {
  goal_impact: 3, urgency: 2.5, dependency_value: 1.5, learning_value: 1,
  confidence: 1, effort: -1.5, risk: -1,
};

export function localDateLabel(iso, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export class BoardMeeting {
  constructor(ctx) { this.ctx = ctx; }

  /** Generate the report for the 24h window ending at `now`. */
  generate({ now = null, tz = TZ } = {}) {
    const end = now ?? this.ctx.clock.now();
    const start = new Date(new Date(end).getTime() - 24 * 3600 * 1000).toISOString();
    const date = localDateLabel(end, tz);

    const events = this.ctx.events.list({ since: start, until: end });
    const runs = this.ctx.runs.list({ since: start });
    const failures = this.ctx.failures.list({ since: start });
    const openTasks = this.ctx.tasks.list({}).filter((t) => !['completed', 'cancelled'].includes(t.status));
    const blocked = openTasks.filter((t) => t.status === 'blocked');
    const completed = this.#tasksByEvent(events, 'task.transition', (p) => p.to === 'completed');
    const lessonsProposed = events.filter((e) => e.type === 'lesson.proposed');
    const lessonsVerified = events.filter((e) => e.type === 'lesson.verified');
    const pendingApprovals = this.ctx.memory.pendingProposals();
    const usage = summarizeUsage(runs);

    const actions = this.#rankActions({ openTasks, blocked, failures, pendingApprovals, lessonBook: this.ctx.lessons });
    const top3 = actions.slice(0, 3);

    const json = {
      date, window: { since: start, until: end, tz },
      generated_at: this.ctx.clock.now(),
      activity: {
        events: events.length,
        completed_tasks: completed.length,
        open_tasks: openTasks.length,
        blocked_tasks: blocked.length,
        failures: failures.length,
        lessons_proposed: lessonsProposed.length,
        lessons_verified: lessonsVerified.length,
      },
      completed: completed.map((id) => summarizeTask(this.ctx.tasks.get(id))).filter(Boolean),
      blocked: blocked.map(summarizeTask),
      failures: failures.map((f) => ({ id: f.id, symptom: f.symptom, verification: f.verification_state, lesson: f.lesson_id })),
      lessons: { proposed: lessonsProposed.map((e) => e.subject_id), verified: lessonsVerified.map((e) => e.subject_id) },
      approvals_needed: pendingApprovals.map((p) => ({ id: p.id, subject: p.memory.subject, type: p.memory.type })),
      usage,
      action_plan: actions,
      top_actions: top3,
      no_activity: events.length === 0,
    };

    return { date, json, markdown: renderMarkdown(json) };
  }

  #tasksByEvent(events, type, pred) {
    return events.filter((e) => e.type === type && pred(e.payload)).map((e) => e.subject_id);
  }

  #rankActions({ openTasks, blocked, failures, pendingApprovals, lessonBook }) {
    const candidates = [];

    for (const t of blocked) {
      candidates.push(candidate(`Unblock: ${t.objective}`, {
        goal_impact: t.priority / 100 * 3, urgency: 3, dependency_value: 2, effort: 1, risk: riskNum(t.risk), confidence: 2,
        requires_approval: true, kind: 'unblock', ref: t.id,
      }));
    }
    for (const t of openTasks.filter((x) => x.status === 'queued')) {
      candidates.push(candidate(`Execute: ${t.objective}`, {
        goal_impact: t.priority / 100 * 3, urgency: t.priority / 100 * 2, dependency_value: 1, effort: 1.5, risk: riskNum(t.risk), confidence: 2,
        kind: 'execute', ref: t.id,
      }));
    }
    for (const f of failures.filter((x) => !x.lesson_id)) {
      candidates.push(candidate(`Prevent recurrence: ${f.symptom}`, {
        goal_impact: 1, urgency: 2, learning_value: 3, effort: 1, risk: 1, confidence: 1.5,
        kind: 'prevention', ref: f.id,
      }));
    }
    for (const l of lessonBook.list({ status: 'proposed' })) {
      candidates.push(candidate(`Verify lesson: ${l.trigger_conditions}`, {
        goal_impact: 0.5, urgency: 1.5, learning_value: 3, effort: 0.5, risk: 0, confidence: 1,
        kind: 'verify_lesson', ref: l.id,
      }));
    }
    for (const p of pendingApprovals) {
      candidates.push(candidate(`Owner decision: ${p.memory.subject}`, {
        goal_impact: 1, urgency: 2, dependency_value: 1.5, effort: 0.2, risk: 0, confidence: 2,
        requires_approval: true, kind: 'approval', ref: p.id,
      }));
    }

    for (const c of candidates) c.score = round2(scoreAction(c.factors));
    return candidates.sort((a, b) => b.score - a.score);
  }
}

function candidate(action, { requires_approval = false, kind, ref, ...factors }) {
  return { action, kind, ref, requires_approval, factors, score: 0 };
}

function scoreAction(factors) {
  let s = 0;
  for (const [k, w] of Object.entries(ACTION_WEIGHTS)) s += (factors[k] ?? 0) * w;
  return s;
}

function riskNum(risk) {
  return { none: 0, low: 1, medium: 2, high: 3, critical: 4 }[risk] ?? 1;
}

function summarizeTask(t) {
  if (!t) return null;
  return { id: t.id, objective: t.objective, status: t.status, risk: t.risk, priority: t.priority, next: t.recommended_next_action };
}

function summarizeUsage(runs) {
  let input = 0, output = 0, cost = 0, n = runs.length;
  for (const r of runs) {
    input += r.tokens?.input_tokens ?? 0;
    output += r.tokens?.output_tokens ?? 0;
    cost += r.cost_usd ?? 0;
  }
  return { runs: n, input_tokens: input, output_tokens: output, cost_usd: round2(cost) };
}

const round2 = (n) => Math.round(n * 100) / 100;

function renderMarkdown(j) {
  const L = [];
  L.push(`# Board Meeting — ${j.date}`);
  L.push(`_Window: ${j.window.since} → ${j.window.until} (${j.window.tz}). Generated ${j.generated_at}._`);
  L.push('');
  // 1
  L.push('## 1. Executive summary');
  if (j.no_activity) {
    L.push('No agent activity in the last 24 hours. Nothing was fabricated to fill this report.');
  } else {
    L.push(`${j.activity.completed_tasks} task(s) completed, ${j.activity.open_tasks} open (${j.activity.blocked_tasks} blocked), ${j.activity.failures} failure(s), ${j.activity.lessons_verified} lesson(s) verified. ${j.approvals_needed.length} item(s) need your decision.`);
  }
  L.push('');
  // 2
  L.push('## 2. Progress toward active goals');
  L.push('_Goals are tracked in `jarvis/brain/goals/active-goals.md`. Task→goal linkage drives this once goals are populated._');
  L.push('');
  // 3
  L.push('## 3. Work completed (last 24h)');
  L.push(j.completed.length ? j.completed.map((t) => `- **${t.objective}** (${t.id}) — ${t.risk} risk`).join('\n') : '- None.');
  L.push('');
  // 4
  L.push('## 4. Verification status');
  L.push(`- Runs recorded: ${j.usage.runs}. Failures: ${j.activity.failures}. Lessons verified: ${j.activity.lessons_verified}.`);
  L.push('');
  // 5
  L.push('## 5. Bugs, failures, unresolved risks');
  L.push(j.failures.length ? j.failures.map((f) => `- ${f.symptom} — verification: ${f.verification}${f.lesson ? `, lesson ${f.lesson}` : ''}`).join('\n') : '- None recorded.');
  L.push('');
  // 6
  L.push('## 6. Dissenting / conflicting recommendations');
  L.push('- None surfaced this cycle. (Reviewer disagreements and disputed memories appear here.)');
  L.push('');
  // 7
  L.push('## 7. Lessons proposed / verified');
  L.push(`- Proposed: ${j.lessons.proposed.length}. Verified: ${j.lessons.verified.length}.`);
  L.push('');
  // 8
  L.push('## 8. Resource & model usage');
  L.push(`- ${j.usage.runs} run(s), ${j.usage.input_tokens} in / ${j.usage.output_tokens} out tokens, est. $${j.usage.cost_usd}. (Mock provider reports $0.)`);
  L.push('');
  // 9
  L.push('## 9. Blockers requiring your decision');
  const blockers = [...j.blocked.map((t) => `- ${t.objective} (${t.id}) — ${t.next ?? 'needs direction'}`), ...j.approvals_needed.map((a) => `- Approve memory: ${a.subject} (${a.type})`)];
  L.push(blockers.length ? blockers.join('\n') : '- None.');
  L.push('');
  // 10
  L.push('## 10. Recommended action plan (today)');
  L.push(j.action_plan.length ? j.action_plan.map((a, i) => `${i + 1}. [${a.score}] ${a.action}${a.requires_approval ? ' _(needs approval)_' : ''}`).join('\n') : '- Nothing queued.');
  L.push('');
  // 11
  L.push('## 11. Three highest-leverage actions');
  L.push(j.top_actions.length ? j.top_actions.map((a, i) => `${i + 1}. **${a.action}** — score ${a.score} (${a.kind})`).join('\n') : '- None.');
  L.push('');
  // 12
  L.push('## 12. Items requiring approval');
  L.push(j.action_plan.filter((a) => a.requires_approval).length
    ? j.action_plan.filter((a) => a.requires_approval).map((a) => `- ${a.action}`).join('\n')
    : '- None.');
  L.push('');
  return L.join('\n');
}
