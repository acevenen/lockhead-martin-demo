import { Orchestrator } from './ceo.js';
import { ensureAgents } from '../agents/loader.js';

// The mocked end-to-end workflow from directive §20, used by BOTH the CLI
// `demo:e2e` and the integration test — so the demo and the test are the same
// flow. It exercises: plan -> route -> worker -> review-requests-change ->
// worker corrects -> review approves -> failure -> lesson -> verify -> board.
export async function runHologramScenario(ctx, { now = null } = {}) {
  ensureAgents(ctx);
  const ceo = new Orchestrator(ctx, { ceoId: 'ceo-claude' });

  // 1-2. CEO receives the hologram objective and creates bounded tasks.
  const tasks = ceo.plan({
    goalId: 'goal-hologram',
    objective: 'Ship the interactive finger-tracked hologram demo',
    subtasks: [
      {
        objective: 'Spike: webcam feed + MediaPipe hand landmarks in the browser',
        acceptance_criteria: ['camera feed renders', 'hand landmarks logged at >15fps'],
        risk: 'medium', priority: 80, required_capabilities: ['frontend', 'prototyping'],
      },
      {
        objective: 'Map fingertip to a stable on-screen cursor',
        acceptance_criteria: ['cursor tracks index fingertip', 'jitter < 5px after smoothing'],
        risk: 'low', priority: 70, required_capabilities: ['frontend'],
      },
      {
        objective: 'One manipulable glowing object (pinch to grab, drag)',
        acceptance_criteria: ['pinch detected with debounce', 'object drags with the hand'],
        risk: 'medium', priority: 60, required_capabilities: ['frontend', '3d'],
      },
    ],
  });

  // 3-7. Route + run the first task through the review loop. The worker omits
  // verification on round 1 (reviewer requests changes) and supplies it on
  // round 2 (reviewer approves).
  const worker = async (task, { round }) => {
    if (round === 1) {
      return {
        artifact: { type: 'spike', path_or_uri: 'hologram/spikes/landmarks.html', content: 'draft: getUserMedia + Hands()', verification: { result: 'not_run' } },
        evidence: { round, note: 'first draft, not yet verified' },
      };
    }
    return {
      artifact: {
        type: 'spike', path_or_uri: 'hologram/spikes/landmarks.html',
        content: 'verified: getUserMedia + Hands() at 24fps',
        verification: { result: 'passed', checks: task.acceptance_criteria },
      },
      evidence: { round, note: 'verified against acceptance criteria' },
    };
  };
  const reviewer = async (task, [artifact]) => {
    if (artifact.verification?.result === 'passed') {
      return { decision: 'approved', next_action: 'proceed to fingertip cursor mapping' };
    }
    return { decision: 'changes_requested', required_changes: ['verify against acceptance criteria and attach evidence'] };
  };

  const result = await ceo.run(tasks[0].id, { worker, reviewer, taskType: 'frontend' });

  // 8. A failure creates a proposed lesson.
  const failure = ctx.failures.record({
    task_id: tasks[2].id,
    symptom: 'Pinch gesture double-fired, grabbing two objects at once',
    impact: 'demo felt unreliable during rehearsal',
    root_cause_status: 'hypothesized',
    likely_root_cause: 'no debounce window on the pinch transition',
    proposed_prevention: 'require a debounce interval and a regression check on pinch edge events',
  });
  const lesson = ctx.lessons.propose({
    trigger_conditions: 'gesture/edge detection without debouncing',
    scopes: ['project:hologram'], tags: ['frontend', 'gesture'],
    prevention_instruction: 'Every discrete gesture must debounce its trigger edge; add a regression check.',
    enforcement_mechanism: 'regression test on pinch edge events',
    regression_check: 'tests/gesture-debounce.test',
    task_type: 'frontend', owner: 'eng-demo',
  });
  ctx.failures.linkLesson(failure.id, lesson.id);

  // 9. A prevention check verifies the lesson (only a passing check activates it).
  const verified = ctx.lessons.verify(lesson.id, { verifier: 'qa-reviewer', checkPassed: true, evidence: [{ check: 'gesture-debounce.test', result: 'passed' }] });

  // 10-11. Board meeting summarizes the window and the action plan picks the top 3.
  const board = ctx.board.generate({ now });

  return {
    tasks, result, failure, lesson: verified, board,
    summary: {
      planned: tasks.length,
      completedFirstTask: result.status === 'completed',
      reviewRounds: result.reviews.length,
      lessonActive: verified.status === 'active',
      topActions: board.json.top_actions.map((a) => a.action),
    },
  };
}
