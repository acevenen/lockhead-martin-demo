import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';
import { runHologramScenario } from '../orchestrator/scenario.js';

test('mocked end-to-end hologram workflow', async () => {
  // Clock starts inside the board's 24h window so the scenario's events land in it.
  const ctx = testContext({ start: '2026-08-01T12:00:00.000Z' });
  const r = await runHologramScenario(ctx, { now: '2026-08-01T18:00:00.000Z' });

  // 2. CEO created bounded tasks.
  assert.equal(r.tasks.length, 3, 'three subtasks planned');

  // 3. Routing chose an agent + model profile for the first task.
  const routes = ctx.router.forTask(r.tasks[0].id);
  assert.ok(routes.length >= 1, 'a routing decision was recorded');
  assert.equal(routes[0].selected_agent, 'eng-demo', 'frontend task routed to eng-demo');

  // 4-7. Worker produced, reviewer requested a change, worker corrected, reviewer approved.
  assert.equal(r.result.status, 'completed', 'first task completed');
  assert.equal(r.result.reviews.length, 2, 'exactly two review rounds');
  assert.equal(r.result.reviews[0].decision, 'changes_requested');
  assert.equal(r.result.reviews[1].decision, 'approved');
  // reviewer separation held: reviewer != worker.
  assert.notEqual(r.result.reviews[1].reviewer_agent, r.result.reviews[1].worker_agent);

  // 8-9. A failure produced a lesson that only became active after verification.
  assert.equal(r.lesson.status, 'active', 'lesson verified to active');
  assert.equal(r.failure.symptom.length > 0, true);

  // 10-11. Board meeting summarized the window and picked 3 top actions.
  assert.equal(r.board.json.no_activity, false);
  assert.ok(r.board.json.activity.completed_tasks >= 1);
  assert.ok(r.board.json.top_actions.length <= 3);
  assert.ok(r.board.markdown.includes('# Board Meeting'));

  ctx.close();
});

test('board meeting reports no activity honestly on an empty window', () => {
  const ctx = testContext({ withAgents: true });
  const { json, markdown } = ctx.board.generate({ now: '2026-08-01T18:00:00.000Z' });
  // Agent registration events are >24h? No — they are just now. So filter by a
  // window that excludes them:
  const empty = ctx.board.generate({ now: '2030-01-01T00:00:00.000Z' });
  assert.equal(empty.json.no_activity, true);
  assert.ok(empty.markdown.includes('No agent activity'));
  ctx.close();
});
