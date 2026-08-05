import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('routing is deterministic and records a decision', () => {
  const ctx = testContext({ withAgents: true });
  const t = ctx.tasks.create({ objective: 'build ui', risk: 'medium', required_capabilities: ['frontend'] });
  const d1 = ctx.router.route(ctx.tasks.get(t.id), { taskType: 'frontend' });
  assert.equal(d1.selected_agent, 'eng-demo');
  assert.equal(d1.selected_model_profile, 'coding_primary');
  assert.ok(ctx.router.forTask(t.id).length === 1);
  ctx.close();
});

test('identity-scoped data is kept on a local profile', () => {
  const ctx = testContext({ withAgents: true });
  const t = ctx.tasks.create({ objective: 'summarize my private notes', risk: 'medium', required_capabilities: ['frontend'], memory_scopes: ['identity'] });
  const d = ctx.router.route(ctx.tasks.get(t.id), { taskType: 'frontend' });
  assert.equal(ctx.models.get(d.selected_model_profile).privacy, 'local');
  assert.ok(d.constraints.some((c) => /local/.test(c)));
  ctx.close();
});

test('a critical-risk task falls back off a profile that disallows it', () => {
  const ctx = testContext({ withAgents: true });
  // eng-demo default coding_primary disallows 'critical'; must fall back.
  const t = ctx.tasks.create({ objective: 'risky', risk: 'critical', required_capabilities: ['frontend'] });
  const d = ctx.router.route(ctx.tasks.get(t.id), { taskType: 'frontend' });
  assert.ok(ctx.models.allowsRisk(d.selected_model_profile, 'critical'));
  ctx.close();
});

test('an unmatched task falls back to the CEO generalist', () => {
  const ctx = testContext({ withAgents: true });
  const t = ctx.tasks.create({ objective: 'exotic', required_capabilities: ['quantum'] });
  const d = ctx.router.route(ctx.tasks.get(t.id), { taskType: 'quantum' });
  assert.equal(d.selected_agent, 'ceo-claude');
  ctx.close();
});

test('no registered agents raises NO_AGENT', () => {
  const ctx = testContext(); // registry empty
  const t = ctx.tasks.create({ objective: 'anything' });
  assert.throws(() => ctx.router.route(ctx.tasks.get(t.id), { taskType: 'frontend' }), /NO_AGENT|no agent/);
  ctx.close();
});
